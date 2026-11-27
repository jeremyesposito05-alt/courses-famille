import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(here, "../../firebase/firestore-beta.rules"), "utf8");
const PROJECT = "demo-famille-rules-tests";
const FAMILY = "famille-test";
const papa = "parent-a";
const maman = "parent-b";
const outsider = "personne-exterieure";

let env;
const db = uid => env.authenticatedContext(uid).firestore();
const task = (uid, category = "family", changes = {}) => ({
  title: "Exemple de tâche", notes: "", category, priority: "normal",
  status: "open", dueDate: "",
  createdBy: uid, updatedBy: uid,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...changes
});
const familyTask = (id = "test") => doc(db(papa), "households", FAMILY, "tasks", id);
const privateTask = (uid, id = "test") => doc(db(uid), "users", uid, "tasks", id);
async function seed(docPath, data) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), docPath), data);
  });
}
async function member(uid, active = true) {
  await seed("households/" + FAMILY + "/members/" + uid, { active });
}
async function createOwnedPrivate(uid, id, category = "personal") {
  const ref = privateTask(uid, id);
  await assertSucceeds(setDoc(ref, task(uid, category)));
  return ref;
}

before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "";
  if (!host || host.includes("firestore.googleapis.com")) {
    throw new Error("Lance les tests uniquement avec Firebase Emulator (FIRESTORE_EMULATOR_HOST requis)");
  }
  const [emulatorHost, emulatorPort] = host.split(":");
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: emulatorHost || "127.0.0.1", port: Number(emulatorPort || 8097), rules }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await member(papa);
  await member(maman);
});
after(async () => { if (env) await env.cleanup() });

test("Deux membres du foyer peuvent lire les mêmes tâches familiales", async () => {
  await assertSucceeds(setDoc(familyTask("shopping"), task(papa)));
  await assertSucceeds(getDoc(doc(db(maman), "households", FAMILY, "tasks", "shopping")));
  await assertSucceeds(getDocs(collection(db(maman), "households", FAMILY, "tasks")));
});

test("Un membre peut cocher une tâche familiale sans modifier son auteur", async () => {
  await assertSucceeds(setDoc(familyTask("rendezvous"), task(papa)));
  await assertSucceeds(updateDoc(doc(db(maman), "households", FAMILY, "tasks", "rendezvous"), {
    status: "done", updatedBy: maman, updatedAt: serverTimestamp()
  }));
  const saved = await assertSucceeds(getDoc(familyTask("rendezvous")));
  if (saved.data().status !== "done" || saved.data().createdBy !== papa) {
    throw new Error("La tâche n'est pas cochée correctement ou l'auteur a changé");
  }
});

test("Une personne extérieure ne peut pas accéder aux tâches du foyer", async () => {
  await assertSucceeds(setDoc(familyTask("private-family"), task(papa)));
  const outsiderDb = db(outsider);
  await assertFails(getDoc(doc(outsiderDb, "households", FAMILY, "tasks", "private-family")));
  await assertFails(getDocs(collection(outsiderDb, "households", FAMILY, "tasks")));
  await assertFails(addDoc(collection(outsiderDb, "households", FAMILY, "tasks"), task(outsider)));
  await assertFails(deleteDoc(doc(outsiderDb, "households", FAMILY, "tasks", "private-family")));
});

test("Un membre désactivé perd ses autorisations", async () => {
  await assertSucceeds(setDoc(familyTask("before"), task(papa)));
  await member(maman, false);
  await assertFails(getDoc(doc(db(maman), "households", FAMILY, "tasks", "before")));
  await assertFails(addDoc(collection(db(maman), "households", FAMILY, "tasks"), task(maman)));
});

test("Les tâches personnelles sont strictement privées, dans les deux sens", async () => {
  await createOwnedPrivate(papa, "travail", "work");
  await createOwnedPrivate(maman, "personnel");
  await assertFails(getDoc(doc(db(maman), "users", papa, "tasks", "travail")));
  await assertFails(getDoc(doc(db(papa), "users", maman, "tasks", "personnel")));
  await assertFails(getDocs(collection(db(maman), "users", papa, "tasks")));
  await assertFails(updateDoc(doc(db(maman), "users", papa, "tasks", "travail"), {
    status: "done", updatedAt: serverTimestamp(), updatedBy: maman
  }));
});

test("Un utilisateur ne peut pas créer ni modifier les permissions de membre", async () => {
  await assertFails(setDoc(doc(db(papa), "households", FAMILY, "members", outsider), { active: true }));
  await assertFails(updateDoc(doc(db(papa), "households", FAMILY, "members", maman), { active: false }));
  await assertFails(deleteDoc(doc(db(papa), "households", FAMILY, "members", maman)));
  await assertFails(getDoc(doc(db(papa), "households", FAMILY, "members", maman)));
  await assertSucceeds(getDoc(doc(db(papa), "households", FAMILY, "members", papa)));
});

test("Catégorie, champs et dates mal formés sont rejetés", async () => {
  const ref = familyTask("invalid");
  await assertFails(setDoc(ref, task(papa, "work")));
  await assertFails(setDoc(ref, task(papa, "family", { unexpected: "surprise" })));
  await assertFails(setDoc(ref, task(papa, "family", { title: "" })));
  await assertFails(setDoc(ref, task(papa, "family", { title: "a".repeat(181) })));
  await assertFails(setDoc(ref, task(papa, "family", { dueDate: "demain" })));
  await assertFails(setDoc(ref, task(papa, "family", { priority: "urgent" })));
  await assertFails(setDoc(privateTask(papa, "family-wrong"), task(papa, "family")));
});

test("Les dates d'origine et l'auteur ne peuvent pas être falsifiés", async () => {
  const ref = familyTask("immutable");
  await assertSucceeds(setDoc(ref, task(papa)));
  await assertFails(updateDoc(ref, { createdBy: maman, updatedBy: papa, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedBy: papa, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { updatedBy: maman, updatedAt: serverTimestamp() }));
});

test("Les anciennes collections ne sont pas accessibles dans la bêta", async () => {
  await seed("familles/ancien-code/config/app", { dummy: true });
  await assertFails(getDoc(doc(db(papa), "familles", "ancien-code", "config", "app")));
  await assertFails(setDoc(doc(db(papa), "familles", "ancien-code", "config", "app"), { attempt: true }));
});

test("Un compte non authentifié ne peut pas consulter les données", async () => {
  await assertSucceeds(setDoc(familyTask("no-auth"), task(papa)));
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous, "households", FAMILY, "tasks", "no-auth")));
  await assertFails(getDocs(collection(anonymous, "households", FAMILY, "tasks")));
});

test("Un utilisateur ne peut pas modifier l'horodatage de mise à jour", async () => {
  const ref = privateTask(papa, "tracking");
  await assertSucceeds(setDoc(ref, task(papa, "work")));
  await assertFails(updateDoc(ref, { notes: "changé", updatedBy: papa, updatedAt: new Date(2000, 0, 1) }));
});
