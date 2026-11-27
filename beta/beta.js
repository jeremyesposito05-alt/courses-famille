/* Bêta autonome. Ne touche pas à app.js, au budget ni aux données de production.
   Projet Firebase de TEST exclusivement, à configurer manuellement. */
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, collection, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = selector => document.querySelector(selector);
const status = (message, error = false) => {
  $("#status").textContent = message;
  $("#status").classList.toggle("error", error);
};
let firebaseApp = null;
let auth = null;
let db = null;
let householdId = "";
let uid = "";
let selected = "personal";
let allowedFamily = false;
let stopTasks = null;
let stopAuth = null;
let currentTasks = [];

function stopWatch() {
  if (stopTasks) { stopTasks(); stopTasks = null }
  currentTasks = [];
  $("#tasks").replaceChildren();
}
function hidePrivate() {
  uid = "";
  allowedFamily = false;
  stopWatch();
  $("#taskPanel").hidden = true;
  $("#signed").hidden = true;
  $("#loginForm").hidden = false;
}
function permissionError(err) {
  const code = err?.code || "";
  status(code === "permission-denied"
    ? "Accès refusé : vérifie l'identité, l'appartenance au foyer et les règles de test."
    : "Erreur Firebase : " + code, true);
}
function taskCollection() {
  if (!uid) throw new Error("Non connecté");
  if (selected === "family") {
    if (!allowedFamily) throw new Error("Accès au foyer non autorisé");
    return collection(db, "households", householdId, "tasks");
  }
  return collection(db, "users", uid, "tasks");
}
function escapeDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return value.slice(8) + "." + value.slice(5, 7) + "." + value.slice(0, 4);
}
function renderTasks() {
  const container = $("#tasks");
  container.replaceChildren();
  if (!currentTasks.length) {
    const p = document.createElement("p"); p.className = "hint";
    p.textContent = "Aucune tâche de test dans cet espace.";
    container.append(p); return;
  }
  const list = [...currentTasks].sort((a,b) =>
    Number(a.status === "done") - Number(b.status === "done") ||
    Number(b.priority === "high") - Number(a.priority === "high") ||
    (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
  list.forEach(t => {
    const line = document.createElement("div"); line.className = "item";
    line.classList.toggle("done", t.status === "done");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = t.status === "done";
    checkbox.setAttribute("aria-label", "Terminer : " + t.title);
    const body = document.createElement("div"); body.className = "body";
    const title = document.createElement("strong"); title.textContent = t.title;
    const meta = document.createElement("small");
    meta.textContent = [t.priority === "high" ? "Priorité haute" : "Priorité normale", escapeDate(t.dueDate), t.notes].filter(Boolean).join(" · ");
    body.append(title, meta);
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Supprimer";
    remove.setAttribute("aria-label", "Supprimer : " + t.title);
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      try {
        await updateDoc(doc(taskCollection(), t.id), {
          status: checkbox.checked ? "done" : "open",
          updatedBy: uid, updatedAt: serverTimestamp()
        });
        status("Tâche actualisée.");
      } catch (err) { checkbox.checked = !checkbox.checked; permissionError(err) }
      finally { checkbox.disabled = false }
    });
    remove.addEventListener("click", async () => {
      if (!confirm("Supprimer cette tâche de test ?")) return;
      remove.disabled = true;
      try { await deleteDoc(doc(taskCollection(), t.id)); status("Tâche supprimée.") }
      catch (err) { permissionError(err); remove.disabled = false }
    });
    line.append(checkbox, body, remove); container.append(line);
  });
}
function watchTasks() {
  stopWatch();
  if (!uid || (selected === "family" && !allowedFamily)) {
    status("Espace familial non autorisé.", true); return;
  }
  stopTasks = onSnapshot(taskCollection(), snap => {
    currentTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
    if (!snap.metadata.fromCache) status("Données synchronisées avec le projet Firebase de test.");
    else status("Données en cache, connexion au serveur en attente.");
  }, permissionError);
}
function choose(next) {
  selected = next;
  $("#personal").setAttribute("aria-pressed", String(next === "personal"));
  $("#family").setAttribute("aria-pressed", String(next === "family"));
  $("#family").disabled = !allowedFamily;
  $("#accessInfo").textContent = next === "family"
    ? "Espace du foyer de test : partagé uniquement avec ses membres."
    : "Espace privé du compte connecté. Les autres membres ne peuvent pas le consulter.";
  watchTasks();
}

async function signedIn(user) {
  hidePrivate();
  if (!user) { status("Connecte-toi avec un compte de test."); return }
  uid = user.uid;
  $("#profile").textContent = "Compte de test : " + (user.email || uid);
  $("#signed").hidden = false;
  $("#loginForm").hidden = true;
  $("#taskPanel").hidden = false;
  try {
    const membership = await getDoc(doc(db, "households", householdId, "members", uid));
    allowedFamily = membership.exists() && membership.data().active === true;
  } catch (_) { allowedFamily = false }
  $("#family").disabled = !allowedFamily;
  if (!allowedFamily) status("Compte privé actif. Accès familial non activé pour ce foyer de test.");
  choose(allowedFamily ? "family" : "personal");
}

$("#configForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (firebaseApp) { status("Projet de test chargé. Recharge la page pour changer de projet.", true); return }
  let config;
  try { config = JSON.parse($("#config").value.trim()) }
  catch (_) { status("Le JSON Firebase est invalide.", true); return }
  const household = $("#household").value.trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(household)) { status("Identifiant de foyer invalide.", true); return }
  if (!config || typeof config.apiKey !== "string" ||
      typeof config.authDomain !== "string" ||
      typeof config.projectId !== "string" ||
      typeof config.appId !== "string") {
    status("Il manque un paramètre Firebase (apiKey, authDomain, projectId, appId).", true); return;
  }
  // Verrou explicitement destiné à protéger le projet de production actuel.
  if (config.projectId === "courses-famille-b9169" ||
      config.authDomain === "courses-famille-b9169.firebaseapp.com") {
    status("Projet de production interdit : crée un projet Firebase distinct pour cette bêta.", true); return;
  }
  householdId = household;
  try {
    firebaseApp = initializeApp(config, "famille-beta");
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    $("#configForm").querySelectorAll("input,textarea,button").forEach(el => el.disabled = true);
    $("#authPanel").hidden = false;
    stopAuth = onAuthStateChanged(auth, user => signedIn(user).catch(permissionError), permissionError);
    status("Projet Firebase de test chargé. Connecte-toi.");
  } catch (err) {
    firebaseApp = null; auth = null; db = null;
    permissionError(err);
  }
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.target.querySelector("button[type=submit]"); button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
    $("#password").value = "";
  } catch (err) { permissionError(err) }
  finally { button.disabled = false }
});
$("#reset").addEventListener("click", async () => {
  const email = $("#email").value.trim();
  if (!email) { status("Indique une adresse e-mail de test.", true); return }
  try { await sendPasswordResetEmail(auth, email); status("Si le compte existe, un e-mail de réinitialisation sera envoyé.") }
  catch (err) { permissionError(err) }
});
$("#logout").addEventListener("click", async () => {
  try { await signOut(auth) } catch (err) { permissionError(err) }
});
$("#personal").addEventListener("click", () => choose("personal"));
$("#family").addEventListener("click", () => { if (allowedFamily) choose("family") });

$("#taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!uid || (selected === "family" && !allowedFamily)) return;
  const title = $("#taskTitle").value.trim();
  if (!title || title.length > 180) { status("Indique un titre valide.", true); return }
  const btn = $("#addTask"); btn.disabled = true;
  try {
    await addDoc(taskCollection(), {
      title, notes: $("#taskNotes").value.trim(),
      category: selected === "family" ? "family" : "personal",
      priority: $("#priority").value === "high" ? "high" : "normal",
      status: "open", dueDate: $("#dueDate").value || "",
      createdBy: uid, updatedBy: uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    event.target.reset();
    status("Tâche enregistrée dans le projet de test.");
  } catch (err) { permissionError(err) }
  finally { btn.disabled = false }
});
window.addEventListener("pagehide", () => { if (stopTasks) stopTasks(); if (stopAuth) stopAuth() });
