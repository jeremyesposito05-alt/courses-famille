import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
         collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, writeBatch,
         getDocFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { budgetModule } from "./budget.js";

/* ---------- Firebase (configuration publique ; la liste est protégée par le code famille) ---------- */
const fbApp = initializeApp({
  apiKey: "AIzaSyCh8H211C1eWlmvOHfYN15KQJguZHOmvKk",
  authDomain: "courses-famille-b9169.firebaseapp.com",
  projectId: "courses-famille-b9169",
  storageBucket: "courses-famille-b9169.firebasestorage.app",
  messagingSenderId: "942002089203",
  appId: "1:942002089203:web:09b3a4d4be183279af9b86"
});
let fs;
try { fs = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = initializeFirestore(fbApp, { localCache: memoryLocalCache() }); }

/* ---------- Constantes ---------- */
const R = window.R, DESSERTS = window.DESSERTS;
const RAYONS = { fl: "Fruits & légumes", viande: "Viande & poisson", frais: "Frais", boul: "Boulangerie", epi: "Épicerie", surg: "Surgelés", placard: "Placard — à vérifier" };
const RAY_ORDER = ["fl", "viande", "frais", "boul", "epi", "surg", "placard"];
const TYPES = { volaille: "Volaille", boeuf: "Bœuf", porc: "Porc", poisson: "Poisson", vege: "Végétarien", oeufs: "Œufs" };
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
// Semaine type de la famille : [clé, repas, contrainte]
const WEEK = {
  1: [["soir", "Soir", "Stéphanie cuisine · simple ou préparé la veille"]],
  2: [["soir", "Soir", "Papa cuisine, du temps"]],
  3: [["midi", "Midi", "Avant le tennis · moins d’une heure"], ["soir", "Soir", "Du temps"]],
  4: [["soir", "Soir", "Patin jusqu’à 17 h 30 · 30 min max"]],
  5: [["soir", "Soir", "Soirée ciné · plat fun"]],
  6: [["midi", "Midi", "Samedi"], ["soir", "Soir", "Samedi"]],
  0: [["midi", "Brunch", "Dimanche"], ["soir", "Soir", "Dimanche · préparer le plat de lundi"]]
};
// Plats adaptés à chaque créneau (pour les propositions automatiques)
const POOL = {
  "1-soir": ["bolo", "macButternut", "pouletAF", "hachis"],
  "2-soir": ["saumonCroute", "teriyaki", "filetMignon", "curry", "boulettes"],
  "3-midi": ["rizSaute", "pateThon", "couscous"],
  "3-soir": ["chili", "quiche", "boulettes", "curry"],
  "4-soir": ["veloute", "pouletAF", "gnocchi"],
  "5-soir": ["fajitas", "pizza", "burgers", "nuggets"],
  "6-midi": ["poissonPane", "rosti", "gnocchi", "pateThon"],
  "6-soir": ["pouletRoti", "burgers", "curry", "boulettes"],
  "0-midi": ["crepes", "pancakes", "rosti"],
  "0-soir": ["minestrone", "frittata", "veloute"]
};
const FRAGILE = /salade|tomate|concombre|courgette|champignon|épinard|coriandre|persil|avocat|fruits|banane/i;

/* ---------- Outils ---------- */
const ls = { get: k => { try { return localStorage.getItem("cf." + k) } catch (e) { return null } },
             set: (k, v) => { try { localStorage.setItem("cf." + k, v) } catch (e) {} } };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chf = n => (n == null || n === "" || isNaN(n)) ? "" : Number(n).toFixed(2);
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dt = s => new Date(s + "T12:00:00");
const addDays = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d) };
const between = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const fmtD = s => s ? JOURS[dt(s).getDay()] + " " + dt(s).getDate() + " " + MOIS[dt(s).getMonth()] : "sans date";
const short = s => s ? dt(s).getDate() + "." + (dt(s).getMonth() + 1) : "";
const today = () => iso(new Date());
const label = x => ((x.q ? x.q + " " : "") + x.n).trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtQty = n => (Math.round(n * 100) / 100).toString().replace(".", ",").replace(/^0,5$/, "½");

/* ---------- État ---------- */
let code = ls.get("code"), me = ls.get("me");
const seenAtOpen = Number(ls.get("seen") || 0);
let pid = null, per = null, items = {}, hist = {}, periods = {};
let loaded = false, offline = false, pending = false;
let tab = ["courses", "menus", "budget", "reglages"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "accueil", trip = ls.get("trip") || "", filter = "tout";
let store = ls.get("store") === "1", wakeLock = null;
let unsubs = [], unsubPer = [];
const undoStack = [];

const other = () => me === "Papa" ? "Maman" : "Papa";
const fam = (...p) => doc(fs, "familles", code, ...p);
const col = (...p) => collection(fs, "familles", code, ...p);
const art = id => fam("articles", id);
const perRef = () => fam("periodes", pid);
const trips = () => Object.entries((per && per.trips) || {}).map(([id, t]) => Object.assign({ id }, t)).sort((a, b) => (a.o || 0) - (b.o || 0) || (a.date || "").localeCompare(b.date || ""));
// Menus : semaines de calendrier (lundi → dimanche), un document par semaine dans « semaines »
let weeks = {}, wkChosen = false;
const mondayOf = s => addDays(s, -((dt(s).getDay() + 6) % 7));
let wk = mondayOf(today());
const weekSlots = mon => {
  const w = weeks[mon] || {}, out = [];
  for (let i = 0; i < 7; i++) { const day = addDays(mon, i); WEEK[dt(day).getDay()].forEach(([k, repas, c]) => { const id = day + "-" + k; out.push({ id, repas, c: (w.contraintes || {})[id] || c }) }) }
  return out;
};
const slotData = id => { const w = weeks[mondayOf(id.slice(0, 10))] || {}; return { v: (w.choix || {})[id] || "", note: (w.notes || {})[id] || "", by: (w.par || {})[id] || "" } };
const slotTitle = id => { const s = slotData(id), r = R[s.v]; return r ? r.nom : s.v.startsWith("libre:") ? s.v.slice(6) : s.v === "aucun" ? "Pas de repas à préparer" : s.note || "À choisir" };
const slots = () => weekSlots(mondayOf(today())).concat(weekSlots(addDays(mondayOf(today()), 7)));
const saveSlots = (mon, data) => setDoc(fam("semaines", mon), Object.assign(data, { maj: Date.now() }), { merge: true }).catch(fail);
const live = () => Object.entries(items).map(([id, x]) => Object.assign({ id }, x));
const isNew = x => (x.par === "Papa" || x.par === "Maman") && x.par !== me && (x.maj || 0) > seenAtOpen && seenAtOpen > 0;
const lastPaid = n => { const k = (n || "").toLowerCase(); return Object.values(hist).filter(h => (h.n || "").toLowerCase() === k).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] };

document.addEventListener("visibilitychange", () => {
  if (document.hidden) ls.set("seen", String(Date.now()));
  else if (store) keepAwake();
});
window.addEventListener("pagehide", () => ls.set("seen", String(Date.now())));

/* ---------- Écritures (hors ligne : envoyées au retour du réseau) ---------- */
const fail = e => toast(e && e.code === "permission-denied" ? "Accès refusé : vérifiez le code famille" : "Modification non enregistrée");
const write = (id, data) => setDoc(art(id), data).catch(fail);
const patch = (id, data) => updateDoc(art(id), data).catch(fail);
const remove = id => deleteDoc(art(id)).catch(fail);
const savePer = data => setDoc(perRef(), Object.assign(data, { maj: Date.now() }), { merge: true }).catch(fail);
function pushUndo(txt, list) { undoStack.push({ txt, list }); if (undoStack.length > 50) undoStack.shift() }
function undo() {
  const u = undoStack.pop(); if (!u) return;
  u.list.forEach(({ id, before }) => { if (before) { write(id, before); items[id] = before } else { remove(id); delete items[id] } });
  render(); toast("Annulé : " + u.txt);
}

/* ---------- Connexion ---------- */
function connect() {
  unsubs.forEach(u => u()); unsubs = [];
  budget.connect();
  unsubs.push(onSnapshot(fam("config", "app"), snap => {
    const p = (snap.exists() && snap.data().periode) || "2026-09-25";
    if (p !== pid) { pid = p; connectPeriod() }
  }, onErr));
  unsubs.push(onSnapshot(col("historique"), snap => { hist = {}; snap.forEach(d => { hist[d.id] = d.data() }) }, () => {}));
  unsubs.push(onSnapshot(col("semaines"), snap => { weeks = {}; snap.forEach(d => { weeks[d.id] = d.data() }); if (!$("#dlg").open) render() }, () => {}));
  unsubs.push(onSnapshot(col("periodes"), snap => { periods = {}; snap.forEach(d => { const x = d.data(); periods[d.id] = { nom: x.nom, debut: x.debut, fin: x.fin } }); if (tab === "reglages" && !$("#dlg").open) render() }, () => {}));
}
function connectPeriod() {
  unsubPer.forEach(u => u()); unsubPer = []; items = {}; per = null; loaded = false;
  unsubPer.push(onSnapshot(perRef(), snap => {
    per = snap.exists() ? snap.data() : { trips: {}, slots: [], choix: {}, notes: {} };
    per.choix = per.choix || {}; per.notes = per.notes || {}; per.par = per.par || {}; per.trips = per.trips || {};
    if (!trips().some(t => t.id === trip)) trip = (trips().find(t => t.date >= today()) || trips()[0] || {}).id || "";
    if (!$("#dlg").open) render();
  }, onErr));
  unsubPer.push(onSnapshot(query(col("articles"), where("liste", "==", pid)), { includeMetadataChanges: true }, snap => {
    items = {}; snap.forEach(d => { items[d.id] = d.data() });
    loaded = true; offline = snap.metadata.fromCache; pending = snap.metadata.hasPendingWrites;
    if (!$("#dlg").open) render(); else renderTop();
  }, onErr));
}
function onErr(e) { if (e.code === "permission-denied") { code = null; ls.set("code", ""); render(); toast("Code famille refusé") } }

/* ---------- Alertes du jour ---------- */
const dismissKey = () => "dismiss." + today();
const dismissed = () => { try { return JSON.parse(ls.get(dismissKey()) || "[]") } catch (e) { return [] } };
function alerts() {
  if (!per) return [];
  const t0 = today(), t1 = addDays(t0, 1), out = [];
  const news = live().filter(isNew);
  if (news.length) out.push({ id: "new-" + news.length, ic: "●", txt: "<b>" + other() + "</b> a ajouté " + news.length + " article" + (news.length > 1 ? "s" : "") + " : " + news.slice(0, 3).map(x => esc(x.n)).join(", ") + (news.length > 3 ? "…" : "") + ' <button class="lnk" data-filter="' + other() + '">Voir</button>' });
  slots().forEach(s => {
    const day = s.id.slice(0, 10), v = slotData(s.id).v, r = R[v];
    if (day === t1 && r && per.debut && between(per.debut, day) >= 3) {
      const frozen = r.ing.filter(i => i[3] === "viande" || /cabillaud/i.test(i[2])).map(i => i[2].replace(/\s*\(.*\)/, ""));
      if (v === "burgers") frozen.push("pains à burger (demain matin)");
      if (frozen.length) out.push({ id: "thaw-" + s.id, ic: "❄", txt: "Ce soir : sortir <b>" + esc(frozen.join(", ")) + "</b> du congélateur pour " + esc(r.nom.toLowerCase()) + " (demain " + s.repas.toLowerCase() + ")" });
    }
    if (day === t0 && /préparer/.test(s.c || "")) out.push({ id: "prep-" + s.id, ic: "⏲", txt: "Aujourd’hui : " + esc(s.c.slice(s.c.indexOf("préparer"))) });
  });
  trips().forEach(t => {
    if (t.clos || !t.date) return;
    const n = live().filter(x => x.c === t.id && !x.coche && x.r !== "placard").length;
    if (!n) return;
    if (t.date === t0) out.push({ id: "trip-" + t.id, ic: "🛒", txt: "Aujourd’hui : " + esc(t.nom) + " (" + n + " articles) <button class='lnk' data-trip='" + t.id + "'>Voir</button>" });
    else if (t.date === t1) out.push({ id: "trip-" + t.id, ic: "🛒", txt: "Demain : " + esc(t.nom) + " (" + n + " articles)" });
  });
  const y = (per.debut || t0).slice(0, 4);
  live().filter(x => x.act && !x.coche).forEach(x => {
    const m = /jusqu’au (?:\p{L}+ )?(\d{1,2})\.(\d{1,2})/u.exec(x.note || ""); if (!m) return;
    const end = y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    if (end === t0 || end === t1) out.push({ id: "act-" + x.id, ic: "%", txt: "Action « " + esc(x.n) + " » : dernier jour " + (end === t0 ? "aujourd’hui" : "demain") });
  });
  const hide = dismissed();
  return out.filter(a => !hide.includes(a.id));
}
function alertsHtml() {
  const a = alerts();
  try { if (navigator.setAppBadge) a.length ? navigator.setAppBadge(a.length) : navigator.clearAppBadge() } catch (e) {}
  if (!a.length) return "";
  return '<section class="alerts" aria-label="Alertes"><h2>À savoir aujourd’hui</h2><ul>' + a.map(x =>
    '<li><span class="ic" aria-hidden="true">' + x.ic + '</span><span>' + x.txt + '</span><button data-dismiss="' + x.id + '" aria-label="Masquer">×</button></li>').join("") + '</ul></section>';
}

/* ---------- Rendu ---------- */
function render() {
  if (!code || !me) return renderSetup();
  document.body.classList.toggle("store", store && tab === "courses");
  document.body.dataset.tab = tab;
  $("#app").innerHTML = '<header class="top" id="top"></header><main id="main"></main>' +
    ((tab === "courses" && trip) || tab === "budget" ? '<button class="fab" id="add" aria-label="Ajouter un article">+</button>' : "") +
    '<nav class="tabs" role="tablist">' +
    tabBtn("accueil", "Accueil", '<path d="M3 11 12 4l9 7M5 10v10h14V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
    tabBtn("courses", "Courses", '<path d="M3 5h2l2.4 10.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.5L21 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/>') +
    tabBtn("menus", "Menus", '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 3c-2 2-2 6 0 8v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
    tabBtn("budget", "Budget", '<rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M16 15h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
    tabBtn("reglages", "Réglages", '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
    '</nav>';
  renderTop();
  if (tab === "accueil") renderHome(); else if (tab === "courses") renderCourses(); else if (tab === "menus") renderMenus(); else if (tab === "budget") budget.render($("#main")); else renderSettings();
}
function tabBtn(id, t, svg) {
  const n = id === "courses" && loaded ? alerts().length : 0;
  return '<button role="tab" data-tab="' + id + '" aria-selected="' + (tab === id) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg>' + t + (n ? '<span class="badge num">' + n + '</span>' : "") + '</button>';
}

function renderTop() {
  const top = $("#top"); if (!top) return;
  const syncTxt = !loaded ? "Connexion…" : offline ? "Hors ligne" : pending ? "Envoi…" : "Synchronisé";
  let h = '<div class="top-row"><h1>' + (tab === "accueil" ? "Famille" : tab === "courses" ? (store ? "Au magasin" : "Courses") : tab === "menus" ? "Menus" : tab === "budget" ? "Budget" : "Réglages") + '</h1>' +
    '<span class="sync' + (offline ? " off" : "") + '"><i></i>' + syncTxt + '</span>' +
    (tab === "courses" ? '<button class="me store-btn" id="storeBtn" aria-pressed="' + store + '">' + (store ? "Quitter" : "Mode magasin") + '</button>' : '<button class="me ' + me + '" data-tab="reglages">' + me + '</button>') + '</div>';
  if (tab === "budget") h += budget.top();
  if (tab === "courses" && per) {
    const inTrip = live().filter(x => x.c === trip), buy = inTrip.filter(x => x.r !== "placard");
    const done = buy.filter(x => x.coche).length;
    const left = buy.filter(x => !x.coche).reduce((a, x) => a + (Number(x.prix) || 0), 0);
    const paid = buy.reduce((a, x) => a + (Number(x.paye) || 0), 0);
    h += '<div class="seg" role="group" aria-label="Course">' + trips().map(t =>
      '<button data-trip="' + t.id + '" aria-pressed="' + (trip === t.id) + '"><span class="tn">' + esc(t.nom) + '</span><span class="td num">' + (t.clos ? "clôturée" : esc(fmtD(t.date))) + ' · ' + live().filter(x => x.c === t.id && x.r !== "placard" && !x.coche).length + '</span></button>').join("") +
      '<button class="seg-more" id="tripsBtn" aria-label="Gérer les courses">⋯</button></div>';
    if (!store) {
      h += '<div class="chips" role="group" aria-label="Filtre">' +
        [["tout", "Tout"], ["reste", "À acheter"], [other(), "Ajouts de " + other()], [me, "Mes ajouts"]].map(([k, t]) =>
          '<button data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' + t + '</button>').join("") + '</div>';
    }
    h += '<div class="summary num"><span><b>' + done + '</b> / ' + buy.length + ' dans le caddie</span><span>' + (paid ? 'payé <b>CHF ' + chf(paid) + '</b> · ' : "") + 'reste ≈ <b>CHF ' + chf(left) + '</b></span></div>';
  }
  top.innerHTML = h;
}

/* ---------- Accueil : l'essentiel du jour et l'accès à tout ---------- */
function renderHome() {
  const main = $("#main"), t0 = today(), d = new Date();
  const money = n => Number(n || 0).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tile = (tabId, title, sub, key, color, svg) => '<button class="tile" data-tab="' + tabId + '" style="--tc:' + color + '"><span class="tile-ic" aria-hidden="true"><svg viewBox="0 0 24 24">' + svg + '</svg></span>' +
    '<span class="tile-t">' + title + '</span><span class="tile-s">' + sub + '</span>' + (key ? '<span class="tile-k">' + key + '</span>' : "") + '</button>';
  // Courses : la prochaine course non clôturée
  const tr = trips().filter(t => !t.clos), next = tr.find(t => (t.date || "") >= t0) || tr[0];
  const left = next ? live().filter(x => x.c === next.id && !x.coche && x.r !== "placard").length : 0;
  // Menus : les repas du jour, sinon le prochain
  const title = s => slotTitle(s.id);
  const has = s => { const x = slotData(s.id); return x.v || x.note }, all = weekSlots(mondayOf(addDays(t0, -1))).concat(slots());
  const todays = all.filter(s => s.id.startsWith(t0) && has(s)), upcoming = all.find(s => s.id.slice(0, 10) > t0 && has(s));
  const menuSub = todays.length ? todays.map(s => esc(s.repas) + " : " + esc(title(s))).join("<br>") : upcoming ? esc(fmtD(upcoming.id.slice(0, 10))) + " · " + esc(title(upcoming)) : "Aucun repas prévu";
  // Budget : ce que chacun verse ce mois
  const bs = budget.summary();
  let h = '<section class="hello"><p class="eyebrow">' + JOURS_LONG[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + '</p><h2>Bonjour ' + esc(me) + '</h2></section>' + alertsHtml() +
    '<div class="tiles">' +
    tile("courses", "Courses", next ? esc(next.nom) + " · " + esc(fmtD(next.date)) : "Aucune course prévue", next ? left + " article" + (left > 1 ? "s" : "") + " à acheter" : "", "var(--t-courses)",
      '<path d="M3 5h2l2.4 10.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.5L21 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/>') +
    tile("menus", "Menus", todays.length ? "Aujourd’hui" : "Prochain repas", menuSub, "var(--t-menus)",
      '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 3c-2 2-2 6 0 8v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
    tile("budget", "Budget", "Versements du mois", bs ? me + " : " + money(bs[me]) + " CHF<br>" + other() + " : " + money(bs[other()]) + " CHF" : "Chargement…", "var(--t-budget)",
      '<rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M16 15h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
    tile("reglages", "Réglages", "Téléphone de " + esc(me), "Listes, historique des prix", "var(--t-reglages)",
      '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') +
    '</div><div class="quick"><button class="btn" data-quick="add">+ Ajouter à la liste</button><button class="btn" data-quick="store">Mode magasin</button><button class="btn" data-quick="depense">+ Dépense</button></div>';
  main.innerHTML = h;
}

function renderCourses() {
  const main = $("#main");
  if (!loaded || !per) { main.innerHTML = '<p class="empty">Chargement de la liste…</p>'; return }
  if (!trips().length) { main.innerHTML = '<p class="empty">Aucune course prévue. <button class="lnk" id="tripsBtn2">Créer une course</button></p>'; return }
  let list = live().filter(x => x.c === trip);
  let h = store ? "" : alertsHtml();
  if (!store) {
    if (filter === "reste") list = list.filter(x => !x.coche && x.r !== "placard");
    else if (filter === "Papa" || filter === "Maman") list = list.filter(x => x.par === filter);
  }
  const taken = store ? list.filter(x => x.coche) : [];
  if (store) list = list.filter(x => !x.coche && x.r !== "placard");
  if (!list.length) h += '<p class="empty">' + (store ? "Tout est dans le caddie ✓" : filter === "tout" ? "Aucun article. Touchez + pour en ajouter." : "Rien dans ce filtre.") + '</p>';
  RAY_ORDER.forEach(r => {
    const ri = list.filter(x => x.r === r).sort((a, b) => (a.o || 0) - (b.o || 0) || a.n.localeCompare(b.n, "fr"));
    if (!ri.length) return;
    const left = ri.filter(x => !x.coche).length;
    h += '<section class="rayon" style="--rc:var(--r-' + r + ')"><h2>' + RAYONS[r] + '<span class="num">' + (r === "placard" ? "" : left ? left + " à prendre" : "tout pris ✓") + '</span></h2>' + ri.map(rowHtml).join("") + '</section>';
  });
  if (taken.length) h += '<details class="taken"><summary>Déjà dans le caddie (' + taken.length + ')</summary>' + taken.map(rowHtml).join("") + '</details>';
  main.innerHTML = h;
}
function rowHtml(x) {
  const tags = [];
  if (isNew(x)) tags.push('<span class="tag new">nouveau</span>');
  if (x.par === "Papa" || x.par === "Maman") tags.push('<span class="tag ' + x.par + '">ajouté par ' + x.par + '</span>');
  if (x.act) tags.push('<span class="tag act">action</span>');
  if (x.coche && x.cochePar) tags.push('<span class="tag ' + x.cochePar + '">pris par ' + x.cochePar + '</span>');
  const price = x.paye != null && x.paye !== "" ? '<span class="price num">' + chf(x.paye) + '<small>payé</small></span>'
    : x.prix != null && x.prix !== "" ? '<span class="price num">' + chf(x.prix) + '<small>' + (x.act ? "action" : x.saisi ? "saisi" : "estimé") + '</small></span>' : '<span></span>';
  return '<div class="row' + (x.coche ? " done" : "") + '">' +
    '<button class="box" role="checkbox" aria-checked="' + !!x.coche + '" data-check="' + x.id + '" aria-label="' + esc(label(x)) + '"></button>' +
    '<button class="body" data-edit="' + x.id + '"><span class="name">' + (x.q ? '<span class="qty">' + esc(x.q) + '</span> ' : "") + esc(x.n) + '</span>' +
    (x.p ? '<span class="prod">' + esc(x.p) + '</span>' : "") +
    (x.note || x.frz ? '<span class="note' + (x.frz ? " frz" : "") + '">' + (x.frz ? "Congeler" + (x.note ? " · " : "") : "") + esc(x.note) + '</span>' : "") +
    (tags.length ? '<span class="tags">' + tags.join("") + '</span>' : "") + '</button>' + price + '</div>';
}

function renderMenus() {
  const main = $("#main");
  // À l'ouverture : la semaine en cours, ou la suivante si celle-ci n'a encore rien de prévu
  const nChoix = m => Object.values((weeks[m] || {}).choix || {}).filter(Boolean).length;
  if (!wkChosen && !nChoix(wk) && nChoix(addDays(wk, 7))) wk = addDays(wk, 7);
  const d0 = dt(wk), d6 = dt(addDays(wk, 6)), sl = weekSlots(wk);
  const planned = sl.filter(s => slotData(s.id).v).length;
  const wnum = (() => { const d = dt(addDays(wk, 3)), y0 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y0) / 864e5 - 3 + (y0.getDay() + 6) % 7) / 7) })();
  let h = alertsHtml();
  h += '<div class="wnav"><button class="x" data-wk="-7" aria-label="Semaine précédente">‹</button><div><b>Semaine du ' + d0.getDate() + (d0.getMonth() !== d6.getMonth() ? " " + MOIS[d0.getMonth()] : "") + ' au ' + d6.getDate() + ' ' + MOIS[d6.getMonth()] + '</b>' +
    '<span class="note">Semaine ' + wnum + ' · ' + planned + ' / ' + sl.length + ' repas prévus' + (wk === mondayOf(today()) ? " · cette semaine" : "") + '</span></div><button class="x" data-wk="7" aria-label="Semaine suivante">›</button></div>' +
    '<div class="quick"><button class="btn" id="proposeWeek">' + (planned < sl.length ? "Proposer les repas manquants" : "Tous les repas sont prévus ✓") + '</button><button class="btn" id="newList">Créer la liste de courses</button></div>';
  let day0 = "";
  sl.forEach(s => {
    const day = s.id.slice(0, 10), d = dt(day);
    if (day !== day0) { day0 = day }
    const { v, note, by } = slotData(s.id), r = R[v];
    const title = slotTitle(s.id);
    h += '<button class="meal' + (day === today() ? " today" : "") + (v ? "" : " empty") + '" data-meal="' + s.id + '"><span class="date"><span class="dow">' + JOURS[d.getDay()] + '</span><span class="dnum">' + d.getDate() + '</span></span>' +
      '<span><span class="c">' + esc(s.repas) + ' · ' + esc(s.c) + '</span><span class="m">' + esc(title) + (by === "Papa" || by === "Maman" ? '<span class="by ' + by + '">modifié par ' + by + '</span>' : "") + '</span>' +
      (r && r.kcal ? '<span class="k num">' + r.actif + ' min actif · ' + r.total + ' min en tout · <b>≈ ' + r.kcal + ' kcal</b></span>' : "") +
      (note && title !== note ? '<span class="k">' + esc(note) + '</span>' : "") + '</span></button>';
  });
  h += '<h2 class="week">Desserts Ninja Creami</h2>' + Object.entries(DESSERTS).map(([k, x]) =>
    '<button class="meal" data-dessert="' + k + '"><span class="date"><span class="dnum">❄</span></span><span><span class="m">' + esc(x.nom) + '</span><span class="k">' + esc(x.prep) + '</span></span></button>').join("");
  main.innerHTML = h;
}

function renderSettings() {
  const pers = Object.entries(periods).sort((a, b) => (b[1].debut || "").localeCompare(a[1].debut || ""));
  const hn = {};
  Object.values(hist).forEach(x => { const k = (x.n || "").toLowerCase(); (hn[k] = hn[k] || []).push(x) });
  const histRows = Object.values(hn).map(l => l.sort((a, b) => (b.date || "").localeCompare(a.date || ""))).sort((a, b) => a[0].n.localeCompare(b[0].n, "fr"));
  $("#main").innerHTML =
    '<div class="card"><h2>Qui utilise ce téléphone ?</h2><div class="who">' +
    ["Papa", "Maman"].map(p => '<button class="' + p + '" data-me="' + p + '" aria-pressed="' + (me === p) + '">' + p + '</button>').join("") + '</div>' +
    '<p>Vos ajouts portent la pastille « ajouté par ' + me + ' » sur l’autre téléphone.</p></div>' +
    '<div class="card"><h2>Listes de courses</h2>' + (pers.length ? pers.map(([id, x]) =>
      '<button class="pline" data-per="' + id + '" aria-pressed="' + (id === pid) + '"><b>' + esc(x.nom || id) + '</b><span>' + (id === pid ? "affichée" : "afficher") + '</span></button>').join("") : '<p>Aucune.</p>') +
    '<p class="note">Une nouvelle liste se crée depuis Menus, à partir des repas d’une ou deux semaines.</p></div>' +
    '<div class="card"><h2>Historique des prix payés</h2>' + (histRows.length ? '<p>Saisissez le prix du ticket dans un article (« Prix payé »), puis « Clôturer » la course : les prix sont gardés ici et resservent aux prochaines listes.</p><ul class="hist">' + histRows.map(l =>
      '<li><b>' + esc(l[0].n) + '</b><span class="num">' + l.slice(0, 4).map(x => chf(x.prix) + ' <small>' + short(x.date) + '</small>').join(" · ") + '</span></li>').join("") + '</ul>'
      : '<p>Encore vide. Dans un article, saisissez le « Prix payé » (sur le ticket), puis clôturez la course avec ⋯ : les prix sont enregistrés ici et resservent aux listes suivantes.</p>') + '</div>' +
    '<div class="card"><h2>Installer sur l’iPhone</h2><ol class="steps"><li>Ouvrir cette page dans <b>Safari</b>.</li><li>Toucher <b>Partager</b> (carré avec une flèche).</li><li>Choisir <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li></ol></div>' +
    '<div class="card"><h2>Code famille</h2><p class="num">Code : <b>' + esc(code.slice(0, 3)) + '•••••••</b></p><button class="btn danger" id="logout">Se déconnecter de ce téléphone</button></div>';
}

function renderSetup() {
  document.body.classList.remove("store");
  $("#app").innerHTML = '<header class="top"><div class="top-row"><h1>Famille</h1></div></header><main>' +
    '<div class="card"><h2>Bienvenue</h2><p>Courses, menus et budget de la famille, les mêmes sur les deux téléphones.</p>' +
    '<label class="f" for="codeIn">Code famille</label><input class="t" id="codeIn" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(code || "") + '">' +
    '<label class="f">Ce téléphone est celui de…</label><div class="who">' +
    ["Papa", "Maman"].map(p => '<button type="button" class="' + p + '" data-pick="' + p + '" aria-pressed="' + (me === p) + '">' + p + '</button>').join("") + '</div>' +
    '<button class="btn primary" id="start">Ouvrir la liste</button><p class="err" id="err" hidden></p></div></main>';
}

/* ---------- Feuilles ---------- */
const dlg = $("#dlg"), sheet = $("#sheet");
const budget = budgetModule({ fs, code: () => code, me: () => me, tab: () => tab, esc, ls, sheet, toast: (t, u) => toast(t, u), openSheet: h => openSheet(h), closeSheet: () => closeSheet(), rerender: () => render(), isOpen: () => dlg.open });
function openSheet(html) { sheet.innerHTML = html; try { dlg.showModal() } catch (e) { dlg.setAttribute("open", "") } }
function closeSheet() { try { dlg.close() } catch (e) { dlg.removeAttribute("open") } render() }
dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest(".x")) closeSheet() });
const opt = (o, v) => Object.entries(o).map(([k, t]) => '<option value="' + k + '"' + (k === v ? " selected" : "") + '>' + esc(t) + '</option>').join("");
const tripOpts = v => trips().map(t => '<option value="' + t.id + '"' + (t.id === v ? " selected" : "") + '>' + esc(t.nom) + ' · ' + esc(fmtD(t.date)) + '</option>').join("");

// Article : ajouter / modifier
function editor(id) {
  const x = id ? items[id] : { c: trip, r: "fl", q: "", n: "", p: "", prix: null, note: "", frz: false };
  const lp = id && lastPaid(x.n);
  openSheet('<form data-form="item" data-id="' + (id || "") + '"><div class="sheet-head"><h2>' + (id ? "Modifier" : "Ajouter un article") + '</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
    (id && (x.par === "Papa" || x.par === "Maman") ? '<p class="note">Ajouté par ' + x.par + '</p>' : "") +
    '<label class="f" for="fn">Article</label><input class="t" id="fn" required value="' + esc(x.n) + '" placeholder="ex. Skyr nature" list="histNames">' +
    '<datalist id="histNames">' + [...new Set(Object.values(hist).map(h => h.n))].map(n => '<option value="' + esc(n) + '">').join("") + '</datalist>' +
    '<div class="two"><div><label class="f" for="fq">Quantité</label><input class="t" id="fq" value="' + esc(x.q) + '" placeholder="ex. 2 pots"></div>' +
    '<div><label class="f" for="fp">Prix estimé</label><input class="t" id="fp" type="number" step="0.05" min="0" inputmode="decimal" value="' + (x.prix ?? "") + '"></div></div>' +
    '<div class="two"><div><label class="f" for="fc">Course</label><select class="t" id="fc">' + tripOpts(x.c) + '</select></div>' +
    '<div><label class="f" for="fr">Rayon</label><select class="t" id="fr">' + opt(RAYONS, x.r) + '</select></div></div>' +
    '<label class="f" for="fpay">Prix payé (ticket)</label><input class="t" id="fpay" type="number" step="0.05" min="0" inputmode="decimal" value="' + (x.paye ?? "") + '" placeholder="à remplir après la caisse">' +
    (lp ? '<p class="note num">Payé la dernière fois : ' + chf(lp.prix) + ' le ' + short(lp.date) + '</p>' : "") +
    '<label class="f" for="fpr">Produit, précision</label><input class="t" id="fpr" value="' + esc(x.p) + '">' +
    '<label class="f" for="fno">Note</label><input class="t" id="fno" value="' + esc(x.note) + '">' +
    '<label class="chk"><input type="checkbox" id="ffz"' + (x.frz ? " checked" : "") + '> À congeler au retour</label>' +
    '<div class="actions">' + (id ? '<button type="button" class="btn danger" id="del">Supprimer</button>' : "") + '<button class="btn primary">' + (id ? "Enregistrer" : "Ajouter") + '</button></div></form>');
  if (!id) setTimeout(() => $("#fn") && $("#fn").focus(), 60);
}
const num = s => { const t = String(s).trim().replace(",", "."); if (t === "") return null; const n = Math.round(parseFloat(t) * 100) / 100; return isNaN(n) ? null : n };
function submitItem(f) {
  const id = f.dataset.id, v = s => $(s).value.trim();
  const n = v("#fn"); if (!n) return;
  let prix = num(v("#fp"));
  const lp = lastPaid(n);
  if (!id && prix == null && lp) prix = lp.prix;
  const data = { n, q: v("#fq"), prix, paye: num(v("#fpay")), c: v("#fc"), r: v("#fr"), p: v("#fpr"), note: v("#fno"), frz: $("#ffz").checked, maj: Date.now() };
  if (id) {
    const before = Object.assign({}, items[id]);
    if (before.prix !== data.prix) { data.act = false; data.saisi = true }
    data.modifPar = me;
    pushUndo("modification de « " + label(before) + " »", [{ id, before }]);
    items[id] = Object.assign({}, before, data); patch(id, data); toast("Modifié : " + label(items[id]), true);
  } else {
    const newId = nid("m");
    const o = live().filter(x => x.c === data.c && x.r === data.r).reduce((m, x) => Math.max(m, x.o || 0), 0) + 10;
    Object.assign(data, { o, act: false, saisi: data.prix != null, coche: false, par: me, liste: pid });
    pushUndo("ajout de « " + label(data) + " »", [{ id: newId, before: null }]);
    items[newId] = data; write(newId, data); toast("Ajouté : " + label(data), true);
  }
  closeSheet();
}

// Courses : dates, création, clôture
function tripsSheet() {
  openSheet('<div class="sheet-head"><h2>Les courses</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
    '<p class="note">Changez le nom ou la date, ajoutez une course, ou clôturez-en une pour garder les prix payés.</p>' +
    trips().map(t => {
      const its = live().filter(x => x.c === t.id), paid = its.reduce((a, x) => a + (Number(x.paye) || 0), 0);
      return '<div class="trip-edit" data-t="' + t.id + '"><div class="two"><div><label class="f">Nom</label><input class="t" data-tn value="' + esc(t.nom) + '"></div>' +
        '<div><label class="f">Date</label><input class="t" type="date" data-td value="' + esc(t.date || "") + '"></div></div>' +
        '<p class="note num">' + its.length + ' articles' + (paid ? ' · payé CHF ' + chf(paid) : "") + (t.clos ? ' · <b>clôturée</b>' : "") + '</p>' +
        '<div class="actions"><button type="button" class="btn" data-close-trip="' + t.id + '">' + (t.clos ? "Rouvrir" : "Clôturer") + '</button><button type="button" class="btn danger" data-del-trip="' + t.id + '">Supprimer</button></div></div>';
    }).join("") +
    '<button type="button" class="btn wide" id="addTrip">+ Nouvelle course</button>' +
    '<button type="button" class="btn primary" id="saveTrips">Enregistrer</button>');
}
function saveTrips() {
  const t = {}; let n = 0;
  sheet.querySelectorAll(".trip-edit").forEach(el => {
    const id = el.dataset.t, cur = per.trips[id] || {};
    const nom = el.querySelector("[data-tn]").value.trim() || "Course", date = el.querySelector("[data-td]").value;
    t[id] = Object.assign({}, cur, { nom, date, o: ++n });
  });
  Object.assign(per.trips, t); savePer({ trips: t }); closeSheet(); toast("Courses enregistrées");
}
function addTrip() {
  const id = nid("t"), last = trips().slice(-1)[0];
  const date = last && last.date ? addDays(last.date, 7) : today();
  per.trips[id] = { nom: "Nouvelle course", date, o: trips().length + 1 };
  savePer({ trips: { [id]: per.trips[id] } }); trip = id; tripsSheet();
}
function deleteTrip(id, btn) {
  const its = live().filter(x => x.c === id), others = trips().filter(t => t.id !== id);
  if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = its.length ? (others.length ? "Confirmer (articles → " + others[0].nom + ")" : "Confirmer (articles supprimés)") : "Confirmer"; return }
  its.forEach(x => { if (others.length) { patch(x.id, { c: others[0].id }); items[x.id].c = others[0].id } else { remove(x.id); delete items[x.id] } });
  delete per.trips[id]; updateDoc(perRef(), { ["trips." + id]: deleteField(), maj: Date.now() }).catch(fail);
  if (trip === id) trip = (others[0] || {}).id || "";
  tripsSheet(); toast("Course supprimée");
}
function closeTrip(id) {
  const t = per.trips[id]; if (!t) return;
  if (t.clos) { t.clos = false; savePer({ trips: { [id]: { clos: false } } }); tripsSheet(); return }
  const paid = live().filter(x => x.c === id && x.paye != null && x.paye !== "");
  const b = writeBatch(fs);
  paid.forEach(x => b.set(doc(col("historique")), { n: x.n, q: x.q || "", prix: Number(x.paye), date: t.date || today(), course: t.nom, liste: pid, par: me }));
  b.set(perRef(), { trips: { [id]: { clos: true } }, maj: Date.now() }, { merge: true });
  b.commit().catch(fail);
  t.clos = true; tripsSheet(); toast(paid.length ? paid.length + " prix ajoutés à l’historique" : "Course clôturée (aucun prix payé saisi)");
}

// Repas : changer de plat
function mealSheet(slot) {
  const s = weekSlots(mondayOf(slot.slice(0, 10))).find(x => x.id === slot), { v, note } = slotData(slot), r = R[v], d = dt(slot.slice(0, 10));
  const groups = {};
  Object.entries(R).filter(([k]) => k !== "restes").forEach(([k, x]) => { (groups[x.type] = groups[x.type] || []).push([k, x]) });
  const opts = Object.entries(groups).map(([t, list]) => '<optgroup label="' + esc(TYPES[t] || t) + '">' +
    list.sort((a, b) => a[1].nom.localeCompare(b[1].nom, "fr")).map(([k, x]) => '<option value="' + k + '">' + esc(x.nom) + ' · ' + x.total + ' min</option>').join("") + '</optgroup>').join("");
  openSheet('<form data-form="meal" data-slot="' + slot + '"><div class="sheet-head"><div><p class="note">' + JOURS_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' · ' + esc(s.repas) + ' · ' + esc(s.c) + '</p><h2>' + esc(r ? r.nom : v.startsWith("libre:") ? v.slice(6) : v === "aucun" ? "Pas de repas à préparer" : "À choisir") + '</h2></div><button type="button" class="x" aria-label="Fermer">×</button></div>' +
    (r ? '<button type="button" class="btn wide" data-recipe="' + v + '">Voir la recette</button>' : "") +
    '<label class="f" for="mPick">Changer de plat</label><select class="t" id="mPick"><option value="">— garder le plat actuel —</option>' + opts +
    '<optgroup label="Autre"><option value="libre">Autre plat (à écrire)</option><option value="aucun">Pas de repas à préparer (resto, invités…)</option></optgroup></select>' +
    '<div id="libreBox" hidden><label class="f" for="mLibre">Nom du plat</label><input class="t" id="mLibre" value="' + esc(v.startsWith("libre:") ? v.slice(6) : "") + '" placeholder="ex. Raclette"></div>' +
    '<label class="f" for="mNote">Remarque</label><textarea class="t" id="mNote" placeholder="ex. préparer la veille, Lana mange à l’école…">' + esc(note) + '</textarea>' +
    '<label class="chk"><input type="checkbox" id="mIng"> Ajouter les ingrédients du nouveau plat à la liste</label>' +
    '<label class="f" for="mTrip">… dans la course</label><select class="t" id="mTrip">' + tripOpts((trips().filter(t => !t.clos && t.date <= slot.slice(0, 10)).slice(-1)[0] || trips().slice(-1)[0] || {}).id) + '</select>' +
    '<div class="actions"><button class="btn primary">Enregistrer</button></div></form>');
}
function submitMeal(f) {
  const slot = f.dataset.slot, pick = $("#mPick").value, note = $("#mNote").value.trim();
  const before = slotData(slot).v, mon = mondayOf(slot.slice(0, 10));
  let v = before;
  if (pick === "libre") { const t = $("#mLibre").value.trim(); if (!t) { $("#mLibre").focus(); return } v = "libre:" + t }
  else if (pick) v = pick;
  const changed = v !== before;
  const w = weeks[mon] = weeks[mon] || {};
  (w.choix = w.choix || {})[slot] = v; (w.notes = w.notes || {})[slot] = note; (w.par = w.par || {})[slot] = me;
  saveSlots(mon, { choix: { [slot]: v }, notes: { [slot]: note }, par: { [slot]: me } });
  if ($("#mIng").checked && R[v]) addIngredients(v, slot, $("#mTrip").value);
  closeSheet(); toast(changed ? "Menu modifié" : "Remarque enregistrée");
}
function addIngredients(rid, slot, course) {
  const r = R[rid], day = slot.slice(0, 10), list = [];
  r.ing.filter(i => i[3] !== "placard").forEach((i, n) => {
    const id = nid("i") + n, lp = lastPaid(i[2]);
    const data = { n: cap(i[2]), q: (fmtQty(i[0]) + " " + (i[1] || "")).trim(), p: "", prix: lp ? lp.prix : null, c: course, r: i[3], note: "Pour " + r.nom.toLowerCase() + " (" + short(day) + ")", frz: false, act: false, coche: false, par: me, liste: pid, o: 500 + n, maj: Date.now() };
    items[id] = data; write(id, data); list.push({ id, before: null });
  });
  pushUndo("ajout des ingrédients de « " + r.nom + " »", list);
  setTimeout(() => toast(list.length + " ingrédients ajoutés", true), 2300);
}

// Proposer les repas manquants d'une semaine, selon la semaine type, sans reprendre ceux de la semaine précédente
function pick(pool, avoid, used) {
  const fresh = pool.filter(k => !used.has(k) && !avoid.has(k));
  const ok = fresh.length ? fresh : pool.filter(k => !used.has(k));
  const from = ok.length ? ok : pool;
  return from[Math.floor(Math.random() * from.length)];
}
function fillWeek(mon) {
  const prev = weeks[addDays(mon, -7)] || {}, avoid = new Set(Object.values(prev.choix || {}));
  const used = new Set(weekSlots(mon).map(s => slotData(s.id).v).filter(Boolean)), choix = {};
  weekSlots(mon).forEach(s => {
    if (slotData(s.id).v) return;
    const dow = dt(s.id.slice(0, 10)).getDay(), k = s.id.slice(11);
    const r = pick(POOL[dow + "-" + k] || [], avoid, used);
    if (r) { choix[s.id] = r; used.add(r) }
  });
  if (!Object.keys(choix).length) return 0;
  const w = weeks[mon] = weeks[mon] || {}; w.choix = Object.assign({}, w.choix, choix);
  saveSlots(mon, { choix });
  return Object.keys(choix).length;
}
function proposeWeek() {
  const n = fillWeek(wk);
  render(); toast(n ? n + " repas proposés — touchez-en un pour le changer" : "Tous les repas sont déjà prévus");
}

// Nouvelle liste de courses à partir des repas d'une ou deux semaines
function newListSheet() {
  const sat = addDays(wk, -2), start = sat >= today() ? sat : today();
  openSheet('<form data-form="liste"><div class="sheet-head"><h2>Nouvelle liste de courses</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
    '<p class="note">Je reprends les repas prévus, j’additionne les ingrédients par rayon et je mets le frais fragile de la fin de période dans un rachat.</p>' +
    '<div class="two"><div><label class="f" for="lWeeks">Repas de</label><select class="t" id="lWeeks"><option value="1">cette semaine</option><option value="2" selected>cette semaine et la suivante</option></select></div>' +
    '<div><label class="f" for="lDate">Date de la grande course</label><input class="t" type="date" id="lDate" value="' + start + '"></div></div>' +
    '<label class="chk"><input type="checkbox" id="lFill" checked> Proposer d’abord les repas manquants</label>' +
    '<p class="note">La liste actuelle reste consultable dans Réglages.</p>' +
    '<div class="actions"><button class="btn primary">Créer la liste</button></div></form>');
}
function submitList() {
  const nb = Number($("#lWeeks").value), date = $("#lDate").value || today();
  if ($("#lFill").checked) for (let i = 0; i < nb; i++) fillWeek(addDays(wk, 7 * i));
  const debut = wk, fin = addDays(wk, 7 * nb - 1);
  let newPid = date; while (periods[newPid] || newPid === pid) newPid += "b";
  const trs = { g: { nom: "Grande course", date, o: 1 } };
  const rachat = nb > 1 ? addDays(wk, 5) : null;                    // samedi de la 1re semaine
  if (rachat) trs.r = { nom: "Rachat de frais", date: rachat, o: 2 };
  const sl = []; for (let i = 0; i < nb; i++) sl.push(...weekSlots(addDays(wk, 7 * i)));
  const agg = {};
  sl.forEach(s => {
    const r = R[slotData(s.id).v]; if (!r) return;
    const day = s.id.slice(0, 10);
    r.ing.forEach(([q, u, n, ray]) => {
      const c = rachat && ray === "fl" && FRAGILE.test(n) && day >= rachat ? "r" : "g";
      // « Carotte » et « Carottes », « Riz jasmin » et « Riz » : un seul article
      const norm = n.toLowerCase().replace(/\s*\(.*?\)/g, "").replace(/^(riz|salade|pain de mie)\b.*/, "$1").split(" ").map(w => w.replace(/[sx]$/, "")).join(" ");
      const key = c + "|" + ray + "|" + norm;
      const a = agg[key] || (agg[key] = { c, r: ray, n: cap(n), units: {}, uses: [], frz: false });
      if (n.length > a.n.length && !/\(/.test(n)) a.n = cap(n);
      if (typeof q === "number") a.units[u] = (a.units[u] || 0) + q;
      const use = short(day); if (!a.uses.includes(use)) a.uses.push(use);
      if (ray === "viande" && between(date, day) >= 3) a.frz = true;
    });
  });
  const b = writeBatch(fs), d0 = dt(debut), d1 = dt(fin);
  b.set(fam("periodes", newPid), { nom: "Repas du " + d0.getDate() + " " + MOIS[d0.getMonth()] + " au " + d1.getDate() + " " + MOIS[d1.getMonth()], debut: date, fin, trips: trs, maj: Date.now(), creePar: me });
  let count = 0;
  Object.values(agg).sort((a, b2) => a.n.localeCompare(b2.n, "fr")).forEach((a, i) => {
    const lp = lastPaid(a.n), un = a.units;
    if (un.kg) { un.g = (un.g || 0) + un.kg * 1000; delete un.kg }
    if (un.l) { un.dl = (un.dl || 0) + un.l * 10; delete un.l }
    const q = Object.entries(un).map(([u, n]) => u === "g" && n >= 1000 ? fmtQty(n / 1000) + " kg" : (fmtQty(n) + " " + u).trim()).join(" + ");
    b.set(doc(col("articles")), { n: a.n, q, p: "", prix: lp ? lp.prix : null, c: a.c, r: a.r,
      note: "Pour le " + a.uses.join(", "), frz: a.frz, act: false, coche: false, par: "Claude", liste: newPid, o: (i + 1) * 10, maj: Date.now() });
    count++;
  });
  b.set(fam("config", "app"), { periode: newPid }, { merge: true });
  b.commit().then(() => toast("Liste créée · " + count + " articles")).catch(fail);
  closeSheet(); tab = "courses";
}

// Recettes
function recipe(rid) {
  const r = R[rid]; if (!r) return;
  const q = i => (fmtQty(i[0]) + " " + (i[1] || "")).trim() + " " + i[2];
  openSheet('<div class="sheet-head"><h2>' + esc(r.nom) + '</h2><button class="x" aria-label="Fermer">×</button></div>' +
    '<p class="note num">' + r.actif + ' min actif · ' + r.total + ' min en tout' + (r.kcal ? ' · ≈ ' + r.kcal + ' kcal / adulte' : "") + ' · ' + esc(r.outils) + '</p>' +
    (r.ing.length ? '<h3>Ingrédients · 2 adultes + 2 enfants</h3><ul>' + r.ing.map(i => '<li>' + esc(q(i)) + '</li>').join("") + '</ul>' : "") +
    '<h3>Préparation</h3><ol>' + r.et.map(s => '<li>' + esc(s) + '</li>').join("") + '</ol>' +
    '<div class="lana"><b>Pour Lana :</b> ' + esc(r.lana) + '</div>' + (r.conseil ? '<p class="note">' + esc(r.conseil) + '</p>' : ""));
}
function dessert(k) {
  const x = DESSERTS[k], q = i => (fmtQty(i[0]) + " " + (i[1] || "")).trim() + " " + i[2];
  openSheet('<div class="sheet-head"><h2>' + esc(x.nom) + '</h2><button class="x" aria-label="Fermer">×</button></div><p class="note">' + esc(x.prep) + ' · sans lactose</p><h3>Ingrédients</h3><ul>' + x.ing.map(i => '<li>' + esc(q(i)) + '</li>').join("") + '</ul><h3>Préparation</h3><ol>' + x.et.map(s => '<li>' + esc(s) + '</li>').join("") + '</ol>');
}

sheet.addEventListener("submit", e => {
  e.preventDefault();
  if (budget.submitAny(e.target)) return;
  const f = e.target.dataset.form;
  if (f === "item") submitItem(e.target); else if (f === "meal") submitMeal(e.target); else if (f === "liste") submitList();
});
sheet.addEventListener("change", e => { if (e.target.id === "mPick") $("#libreBox").hidden = e.target.value !== "libre" });
sheet.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (budget.sheetClick(t)) return;
  if (t.id === "del") {
    if (!t.dataset.sure) { t.dataset.sure = "1"; t.textContent = "Confirmer"; return }
    const id = t.closest("form").dataset.id, before = Object.assign({}, items[id]);
    pushUndo("suppression de « " + label(before) + " »", [{ id, before }]);
    delete items[id]; remove(id); closeSheet(); toast("Supprimé : " + label(before), true); return;
  }
  if (t.id === "saveTrips") return saveTrips();
  if (t.id === "addTrip") { saveTripsSilently(); return addTrip() }
  if (t.dataset.delTrip) return deleteTrip(t.dataset.delTrip, t);
  if (t.dataset.closeTrip) { saveTripsSilently(); return closeTrip(t.dataset.closeTrip) }
});
function saveTripsSilently() {
  const t = {};
  sheet.querySelectorAll(".trip-edit").forEach(el => {
    const id = el.dataset.t; if (!per.trips[id]) return;
    t[id] = { nom: el.querySelector("[data-tn]").value.trim() || "Course", date: el.querySelector("[data-td]").value };
    Object.assign(per.trips[id], t[id]);
  });
  if (Object.keys(t).length) savePer({ trips: t });
}

/* ---------- Mode magasin ---------- */
async function keepAwake() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null }) } } catch (e) {}
}
function setStore(on) {
  store = on; ls.set("store", on ? "1" : "0");
  if (on) keepAwake(); else if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null }
  render(); window.scrollTo(0, 0);
}

/* ---------- Toast ---------- */
function toast(t, withUndo) {
  $("#toastText").textContent = t; $("#toastUndo").hidden = !withUndo; $("#toast").hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => $("#toast").hidden = true, withUndo ? 4500 : 2200);
}
$("#toastUndo").addEventListener("click", () => { $("#toast").hidden = true; undo() });

/* ---------- Clics ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button") || e.target.closest("tr[data-fact]"); if (!t || t.closest("#sheet") && !t.dataset.recipe) return;
  const ds = t.dataset;
  if (tab === "budget" && t.id === "add") return budget.add();
  if (tab === "budget" && budget.click(t)) return;
  if (ds.tab) { tab = ds.tab; ls.set("tab", tab); render(); window.scrollTo(0, 0); return }
  if (ds.quick === "add") { tab = "courses"; render(); return editor(null) }
  if (ds.quick === "store") { tab = "courses"; return setStore(true) }
  if (ds.quick === "depense") { tab = "budget"; render(); return budget.add() }
  if (ds.trip) { trip = ds.trip; ls.set("trip", trip); tab = "courses"; render(); return }
  if (ds.filter) { filter = ds.filter; tab = "courses"; render(); return }
  if (ds.dismiss) { const d = dismissed(); d.push(ds.dismiss); ls.set(dismissKey(), JSON.stringify(d)); render(); return }
  if (ds.meal) return mealSheet(ds.meal);
  if (ds.check) {
    const id = ds.check, x = items[id]; if (!x) return;
    const now = !x.coche;
    pushUndo((now ? "coché" : "décoché") + " « " + label(x) + " »", [{ id, before: Object.assign({}, x) }]);
    items[id] = Object.assign({}, x, { coche: now, cochePar: me });
    patch(id, { coche: now, cochePar: me, majCoche: Date.now() });
    render(); toast((now ? "Pris : " : "Remis : ") + label(x), true); return;
  }
  if (ds.edit) return editor(ds.edit);
  if (t.id === "add") return editor(null);
  if (t.id === "tripsBtn" || t.id === "tripsBtn2") return tripsSheet();
  if (t.id === "storeBtn") return setStore(!store);
  if (t.id === "newList") return newListSheet();
  if (t.id === "proposeWeek") return proposeWeek();
  if (ds.wk) { wk = addDays(wk, Number(ds.wk)); wkChosen = true; render(); window.scrollTo(0, 0); return }
  if (ds.per) { setDoc(fam("config", "app"), { periode: ds.per }, { merge: true }).catch(fail); pid = ds.per; connectPeriod(); tab = "courses"; render(); return }
  if (ds.recipe) return recipe(ds.recipe);
  if (ds.dessert) return dessert(ds.dessert);
  if (ds.me) { me = ds.me; ls.set("me", me); render(); return }
  if (t.id === "logout") { unsubs.concat(unsubPer).forEach(u => u()); unsubs = []; unsubPer = []; code = null; ls.set("code", ""); render(); return }
  if (ds.pick) { me = ds.pick; document.querySelectorAll("[data-pick]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pick === me))); return }
  if (t.id === "start") return start();
});

async function start() {
  const c = $("#codeIn").value.trim(), err = $("#err");
  if (!c) { err.textContent = "Entrez le code famille."; err.hidden = false; return }
  if (!me) { err.textContent = "Choisissez Papa ou Maman."; err.hidden = false; return }
  $("#start").textContent = "Vérification…";
  try { await getDocFromServer(doc(fs, "familles", c, "config", "app")) }
  catch (e) { if (e.code === "permission-denied") { err.textContent = "Code incorrect."; err.hidden = false; $("#start").textContent = "Ouvrir la liste"; return } }
  code = c; ls.set("code", c); ls.set("me", me);
  if (!ls.get("seen")) ls.set("seen", String(Date.now()));
  connect(); render();
}

if (code && me) connect();
if (store) keepAwake();
render();

/* ---------- Mises à jour de l'appli ---------- */
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}) });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || $(".update")) return;
    const b = document.createElement("button");
    b.className = "update"; b.textContent = "Nouvelle version de l’appli — toucher pour mettre à jour";
    b.addEventListener("click", () => location.reload());
    document.body.appendChild(b);
  });
}
