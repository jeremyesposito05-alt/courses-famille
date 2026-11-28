/* Independent preview storage. No Firebase SDK, credentials, network or production data.
   This small adapter preserves the existing shopping/menu/budget/agenda code paths.
   All records are examples stored only in this browser, not shared between iPhones. */
const STORAGE_KEY = "cf.preview.database.v1";
const ROOT = "familles/preview-demo";
const TRANSFORM = Symbol("preview-transform");
const listeners = new Set();
export const fs = Object.freeze({ preview: true });
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function safeKey(key) {
  if (!key || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Champ de démonstration invalide");
  return key;
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [safeKey(key), clone(item)]));
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Valeur de démonstration invalide");
  return value;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function dateString(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function examples() {
  const now = new Date(), today = dateString(now), month = today.slice(0, 7);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const period = dateString(monday), end = dateString(sunday), stamp = Date.now();
  const record = suffix => ROOT + "/" + suffix;
  return {
    [record("config/app")]: { periode: period },
    [record("periodes/" + period)]: { nom: "Semaine de démonstration", debut: period, fin: end, trips: { demo: { nom: "Courses de démonstration", date: today, o: 1, clos: false } }, choix: {}, notes: {}, par: {} },
    [record("articles/pommes-demo")]: { n: "Pommes", q: "1 kg", p: "", prix: 3.5, c: "demo", r: "fl", note: "Exemple fictif", coche: false, par: "Papa", liste: period, o: 10, maj: stamp },
    [record("articles/riz-demo")]: { n: "Riz", q: "500 g", p: "", prix: 2.4, c: "demo", r: "epi", note: "Exemple fictif", coche: false, par: "Maman", liste: period, o: 20, maj: stamp },
    [record("articles/pain-demo")]: { n: "Pain", q: "1", p: "", prix: 3, c: "demo", r: "boul", note: "Exemple fictif", coche: true, par: "Papa", liste: period, o: 30, maj: stamp },
    [record("semaines/" + period)]: { choix: { [today + "-soir"]: "libre:Repas de démonstration" }, notes: {}, par: {}, contraintes: {} },
    [record("agenda/balade-demo")]: { texte: "Balade en famille · exemple", cat: "famille", heure: "16:00", qui: ["Papa", "Maman"], date: today, rep: "une", fin: "", sauf: [], pauseVac: false, par: "Papa", maj: stamp },
    [record("agenda/rendezvous-demo")]: { texte: "Rendez-vous fictif", cat: "important", heure: "10:00", qui: ["Maman"], date: today, rep: "une", fin: "", sauf: [], pauseVac: false, par: "Maman", maj: stamp },
    [record("budget/config")]: { revenus: { Papa: 5000, Maman: 4000 }, note: "Montants entièrement fictifs" },
    [record("factures/logement-demo")]: { nom: "Logement · exemple", montant: 1800, freq: "mois", cat: "Logement", sous: "", type: "commune", payePar: "Papa", debut: month, note: "Donnée fictive", par: "Papa" },
    [record("factures/alimentation-demo")]: { nom: "Alimentation · exemple", montant: 600, freq: "mois", cat: "Alimentation", sous: "Courses", type: "egal", payePar: "Maman", debut: month, note: "Donnée fictive", par: "Maman" }
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (!plain(saved) || Object.keys(saved).some(path => !path.startsWith(ROOT + "/"))) throw new Error("Stockage invalide");
      return clone(saved);
    }
  } catch (_) { /* An unreadable store never causes a remote fallback. */ }
  const seed = examples();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch (_) { /* Writes below will report the failure to the existing UI. */ }
  return seed;
}
let database = load();

function reference(type, base, parts) {
  if (base !== fs && (!base || !["doc", "collection"].includes(base.type))) throw new Error("Stockage de démonstration requis");
  const segments = (base === fs ? [] : base.path.split("/")).concat(parts);
  if (segments.some(part => typeof part !== "string" || !part || part.includes("/"))) throw new Error("Chemin de démonstration invalide");
  segments.forEach(safeKey);
  if (segments.length < 3 || segments[0] !== "familles" || segments[1] !== "preview-demo") throw new Error("Seul le foyer fictif preview-demo est autorisé");
  if ((segments.length % 2 === 0) !== (type === "doc")) throw new Error("Type de chemin invalide");
  return Object.freeze({ type, path: segments.join("/"), id: segments.at(-1) });
}
export function collection(base, ...parts) { return reference("collection", base, parts); }
export function doc(base, ...parts) {
  if (base?.type === "collection" && !parts.length) parts.push(globalThis.crypto?.randomUUID?.() || "demo-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  return reference("doc", base, parts);
}
export function where(field, operator, value) {
  if (operator !== "==") throw new Error("Ce filtre n'est pas pris en charge dans la démonstration");
  field.split(".").forEach(safeKey);
  return { field, operator, value: clone(value) };
}
export function query(ref, ...conditions) {
  if (ref.type !== "collection") throw new Error("Collection requise");
  return { ...ref, type: "query", conditions };
}
const fieldValue = (data, field) => field.split(".").reduce((value, key) => value?.[key], data);
function documentSnapshot(path) {
  const value = own(database, path) ? clone(database[path]) : undefined;
  return { id: path.split("/").at(-1), exists: () => value !== undefined, data: () => value === undefined ? undefined : clone(value), metadata: { fromCache: true, hasPendingWrites: false } };
}
function snapshot(ref) {
  if (ref.type === "doc") return documentSnapshot(ref.path);
  const prefix = ref.path + "/";
  const docs = Object.keys(database).filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
    .filter(path => (ref.conditions || []).every(condition => equal(fieldValue(database[path], condition.field), condition.value)))
    .sort().map(documentSnapshot);
  return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback), metadata: { fromCache: true, hasPendingWrites: false } };
}
export async function getDocFromServer(ref) { return snapshot(ref); } // Compatibility name only; entirely local.
export function onSnapshot(ref, ...args) {
  const callbacks = args.filter(value => typeof value === "function"), next = callbacks[0], error = callbacks[1];
  if (!next) throw new Error("Fonction de réception requise");
  const listener = { ref, next, error, active: true };
  listeners.add(listener);
  deliver(listener);
  return () => { listener.active = false; listeners.delete(listener); };
}
function deliver(listener) {
  queueMicrotask(() => {
    if (!listener.active) return;
    try { listener.next(snapshot(listener.ref)); } catch (error) { if (listener.error) listener.error(error); else throw error; }
  });
}
export const deleteField = () => ({ [TRANSFORM]: "delete" });
export const arrayUnion = (...values) => ({ [TRANSFORM]: "union", values: clone(values) });
function assign(target, key, value, merge) {
  safeKey(key);
  if (value?.[TRANSFORM] === "delete") { delete target[key]; return; }
  if (value?.[TRANSFORM] === "union") {
    const array = Array.isArray(target[key]) ? clone(target[key]) : [];
    value.values.forEach(item => { if (!array.some(existing => equal(existing, item))) array.push(clone(item)); });
    target[key] = array; return;
  }
  if (plain(value)) {
    const keys = Object.keys(value);
    const nested = merge && keys.length && plain(target[key]) ? clone(target[key]) : {};
    keys.forEach(child => assign(nested, child, value[child], merge));
    target[key] = nested;
  } else target[key] = clone(value);
}
function apply(next, operation) {
  const { ref, kind, value, options } = operation;
  if (ref.type !== "doc" || !ref.path.startsWith(ROOT + "/")) throw new Error("Document fictif requis");
  if (kind === "delete") { delete next[ref.path]; return; }
  if (!plain(value)) throw new Error("Un document doit être un objet");
  if (kind === "update" && !own(next, ref.path)) throw new Error("Document inexistant");
  const result = kind === "update" || options?.merge ? clone(next[ref.path] || {}) : {};
  Object.entries(value).forEach(([field, item]) => {
    const parts = kind === "update" ? field.split(".") : [field];
    parts.forEach(safeKey);
    let target = result;
    parts.slice(0, -1).forEach(part => { if (!plain(target[part])) target[part] = {}; target = target[part]; });
    assign(target, parts.at(-1), item, kind === "set" && !!options?.merge);
  });
  next[ref.path] = result;
}
async function commit(operations) {
  const next = clone(database);
  operations.forEach(operation => apply(next, operation));
  // One localStorage write is atomic. Failures leave both memory and disk unchanged.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  database = next;
  const changed = new Set(operations.map(operation => operation.ref.path));
  listeners.forEach(listener => {
    if ([...changed].some(path => listener.ref.type === "doc" ? path === listener.ref.path : path.startsWith(listener.ref.path + "/") && !path.slice(listener.ref.path.length + 1).includes("/"))) deliver(listener);
  });
}
export const setDoc = (ref, value, options) => commit([{ kind: "set", ref, value, options }]);
export const updateDoc = (ref, value) => commit([{ kind: "update", ref, value }]);
export const deleteDoc = ref => commit([{ kind: "delete", ref }]);
export function writeBatch(store) {
  if (store !== fs) throw new Error("Stockage de démonstration requis");
  const operations = []; let committed = false;
  const append = operation => { if (committed) throw new Error("Lot déjà enregistré"); operations.push(operation); return batch; };
  const batch = {
    set: (ref, value, options) => append({ kind: "set", ref, value, options }),
    update: (ref, value) => append({ kind: "update", ref, value }),
    delete: ref => append({ kind: "delete", ref }),
    commit() { if (committed) return Promise.reject(new Error("Lot déjà enregistré")); committed = true; return commit(operations); }
  };
  return batch;
}
