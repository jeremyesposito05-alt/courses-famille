/* ---------- Emploi du temps de la famille : un jour en portrait, plusieurs jours en paysage ---------- */
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Les thèmes, dans l'ordre du modèle papier (« Activités » est devenu « Transports »)
export const ACATS = [
  ["repas", "Repas", "🍴"],
  ["prep", "À préparer", "🎒"],
  ["transport", "Transports", "🚗"],
  ["ecole", "École / devoirs", "📚"],
  ["sport", "Sport", "⚽"],
  ["famille", "Famille", "🏠"],
  ["important", "Important", "⭐"]
];
const PERS = ["Papa", "Maman", "Lana", "Logan"];
const REP = { une: "Une seule fois", sem: "Chaque semaine", deux: "Toutes les 2 semaines", an: "Chaque année" };
const JL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const JC = ["D", "L", "M", "M", "J", "V", "S"];
const ML = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function agendaModule(ctx) {
  const { fs, code, esc, toast, openSheet, closeSheet, rerender, isOpen, me } = ctx;
  const { iso, dt, addDays, mondayOf, today } = ctx;
  let evts = {}, notes = {}, day = today();
  const unsubs = [];
  const aref = id => doc(fs, "familles", code(), "agenda", id);
  const fail = () => toast("Modification non enregistrée");
  const refresh = () => { if (ctx.tab() === "accueil" && !isOpen()) rerender() };

  function connect() {
    unsubs.forEach(u => u()); unsubs.length = 0;
    unsubs.push(onSnapshot(collection(fs, "familles", code(), "agenda"), s => { evts = {}; s.forEach(d => { evts[d.id] = d.data() }); refresh() }, () => {}));
    unsubs.push(onSnapshot(collection(fs, "familles", code(), "agendaNotes"), s => { notes = {}; s.forEach(d => { notes[d.id] = d.data().texte || "" }); refresh() }, () => {}));
  }

  /* ---- Une information a-t-elle lieu ce jour-là ? (répétitions comprises) ---- */
  const diff = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  function occurs(e, d) {
    if (!e.date || d < e.date || (e.fin && d > e.fin) || (e.sauf || []).includes(d)) return false;
    if (e.rep === "sem") return diff(e.date, d) % 7 === 0;
    if (e.rep === "deux") return diff(e.date, d) % 14 === 0;
    if (e.rep === "an") return e.date.slice(5) === d.slice(5);
    return e.date === d;
  }
  const itemsOf = (d, cat) => Object.entries(evts).filter(([, e]) => e.cat === cat && occurs(e, d))
    .sort((a, b) => (a[1].heure || "99").localeCompare(b[1].heure || "99") || a[1].texte.localeCompare(b[1].texte, "fr"));

  /* ---- Rendu ---- */
  const wide = () => innerWidth >= 700 && innerWidth > innerHeight;
  const nbCols = () => !wide() ? 1 : innerWidth >= 1000 ? 7 : 3;
  const fmtLong = d => JL[dt(d).getDay()] + " " + dt(d).getDate() + " " + ML[dt(d).getMonth()];

  function itemHtml(id, e, d) {
    return '<button class="ag-it" data-agedit="' + id + '" data-agday="' + d + '">' + (e.heure ? '<span class="ag-h num">' + esc(e.heure) + '</span>' : "") +
      '<span class="ag-tx">' + esc(e.texte) + (e.rep && e.rep !== "une" ? ' <span class="ag-rep" title="' + esc(REP[e.rep]) + '">↻</span>' : "") + '</span>' +
      (e.qui && e.qui.length ? '<span class="ag-qui">' + e.qui.map(p => '<i class="p-' + p + '" title="' + p + '">' + p[0] + (p === "Logan" ? "o" : p === "Lana" ? "a" : "") + '</i>').join("") + '</span>' : "") + '</button>';
  }
  function repasHtml(d) {
    const sl = ctx.weekSlots(mondayOf(d)).filter(s => s.id.startsWith(d));
    return sl.map(s => { const t = ctx.slotTitle(s.id), empty = !ctx.slotData(s.id).v && !ctx.slotData(s.id).note;
      return '<button class="ag-it ag-meal' + (empty ? " ag-empty" : "") + '" data-meal="' + s.id + '"><span class="ag-h">' + esc(s.repas) + '</span><span class="ag-tx">' + esc(t) + '</span></button>' }).join("");
  }
  function dayCol(d, compact) {
    let h = "";
    ACATS.forEach(([k, lbl, ic]) => {
      const inner = k === "repas" ? repasHtml(d) : itemsOf(d, k).map(([id, e]) => itemHtml(id, e, d)).join("");
      const empty = !inner;
      h += '<div class="ag-row ag-' + k + (empty ? " is-empty" : "") + '"><div class="ag-lbl"><span aria-hidden="true">' + ic + '</span>' + lbl + '</div>' +
        '<div class="ag-items">' + inner + '</div>' +
        (k !== "repas" ? '<button class="ag-add" data-agadd="' + k + '" data-agday="' + d + '" aria-label="Ajouter : ' + lbl + '">+</button>' : "") + '</div>';
    });
    return h;
  }
  function html() {
    const t0 = today(), n = nbCols(), mon = mondayOf(day);
    // bande de la semaine
    let strip = '<div class="ag-strip" role="group" aria-label="Jours de la semaine">';
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), has = ACATS.some(([k]) => k !== "repas" && itemsOf(d, k).length);
      strip += '<button class="ag-dayb' + (d === day ? " on" : "") + (d === t0 ? " today" : "") + '" data-agjump="' + d + '"><span>' + JC[dt(d).getDay()] + '</span><b class="num">' + dt(d).getDate() + '</b>' + (has ? "<i></i>" : "") + '</button>';
    }
    strip += '</div>';
    let h = '<section class="ag" aria-label="Emploi du temps">' +
      '<div class="ag-nav"><button class="x" data-agmove="-' + (n === 7 ? 7 : 1) + '" aria-label="Précédent">‹</button><div><b>' + (day === t0 ? "Aujourd’hui · " : "") + fmtLong(day) + '</b>' +
      (day !== t0 ? '<button class="lnk" data-agjump="' + t0 + '">revenir à aujourd’hui</button>' : '<span class="note">Glissez pour changer de jour</span>') + '</div>' +
      '<button class="x" data-agmove="' + (n === 7 ? 7 : 1) + '" aria-label="Suivant">›</button></div>' + (n === 1 ? strip : "");
    if (n === 1) h += '<div class="ag-day ag-swipe">' + dayCol(day) + '</div>';
    else {
      const first = n === 7 ? mon : addDays(day, -1);
      h += '<div class="ag-grid ag-swipe" style="--n:' + n + '">';
      for (let i = 0; i < n; i++) { const d = addDays(first, i); h += '<div class="ag-col' + (d === t0 ? " today" : "") + (d === day ? " sel" : "") + '"><button class="ag-colh" data-agjump="' + d + '">' + JL[dt(d).getDay()].slice(0, 3) + ' <b class="num">' + dt(d).getDate() + '</b></button>' + dayCol(d, true) + '</div>' }
      h += '</div>';
    }
    h += '<label class="ag-notes"><span>📝 Remarques de la semaine</span><textarea class="t" id="agNote" data-agnote="' + mon + '" rows="2" placeholder="À ne pas oublier cette semaine…">' + esc(notes[mon] || "") + '</textarea></label></section>';
    return h;
  }

  /* ---- Fiche d'ajout / de modification ---- */
  function sheet(id, cat, d) {
    const e = id ? evts[id] : { cat, texte: "", date: d, heure: "", qui: [], rep: "une", fin: "" };
    openSheet('<form data-form="agenda" data-id="' + (id || "") + '" data-day="' + d + '"><div class="sheet-head"><h2>' + (id ? "Modifier" : "Ajouter") + '</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
      '<label class="f" for="agT">Quoi</label><input class="t" id="agT" required value="' + esc(e.texte) + '" placeholder="' + (e.cat === "prep" ? "ex. sac de tennis, livre de bibliothèque" : e.cat === "transport" ? "ex. déposer Logan au tennis" : "ex. anniversaire de Mamie") + '">' +
      '<div class="two"><div><label class="f" for="agC">Thème</label><select class="t" id="agC">' + ACATS.filter(([k]) => k !== "repas").map(([k, l]) => '<option value="' + k + '"' + (k === e.cat ? " selected" : "") + '>' + l + '</option>').join("") + '</select></div>' +
      '<div><label class="f" for="agH">Heure (facultatif)</label><input class="t" id="agH" type="time" value="' + esc(e.heure || "") + '"></div></div>' +
      '<label class="f">Pour qui</label><div class="ag-pick">' + PERS.map(p => '<label class="p-' + p + '"><input type="checkbox" value="' + p + '"' + ((e.qui || []).includes(p) ? " checked" : "") + '> ' + p + '</label>').join("") + '</div>' +
      '<div class="two"><div><label class="f" for="agD">' + (id && e.rep !== "une" ? "À partir du" : "Date") + '</label><input class="t" id="agD" type="date" value="' + esc(e.date) + '"></div>' +
      '<div><label class="f" for="agR">Répéter</label><select class="t" id="agR">' + Object.entries(REP).map(([k, l]) => '<option value="' + k + '"' + (k === (e.rep || "une") ? " selected" : "") + '>' + l + '</option>').join("") + '</select></div></div>' +
      '<div id="agFinBox"' + ((e.rep || "une") === "une" ? " hidden" : "") + '><label class="f" for="agF">Jusqu’au (facultatif)</label><input class="t" id="agF" type="date" value="' + esc(e.fin || "") + '"></div>' +
      '<div class="actions">' + (id ? '<button type="button" class="btn danger" data-agdel="' + id + '">Supprimer</button>' : "") + '<button class="btn primary">' + (id ? "Enregistrer" : "Ajouter") + '</button></div>' +
      (id && e.rep && e.rep !== "une" ? '<button type="button" class="btn wide" data-agskip="' + id + '">Retirer seulement le ' + fmtLong(d).toLowerCase() + '</button>' : "") + '</form>');
    ctx.sheet.querySelector("#agR").addEventListener("change", ev => { ctx.sheet.querySelector("#agFinBox").hidden = ev.target.value === "une" });
  }
  function submit(form) {
    const q = s => ctx.sheet.querySelector(s), id = form.dataset.id;
    const texte = q("#agT").value.trim(); if (!texte) return;
    const data = { texte, cat: q("#agC").value, heure: q("#agH").value || "", qui: [...ctx.sheet.querySelectorAll(".ag-pick input:checked")].map(i => i.value),
      date: q("#agD").value || day, rep: q("#agR").value, fin: q("#agR").value === "une" ? "" : (q("#agF").value || ""), maj: Date.now(), modifPar: me() };
    const ref = id ? aref(id) : doc(collection(fs, "familles", code(), "agenda"));
    if (!id) Object.assign(data, { par: me(), sauf: [] });
    evts[ref.id] = Object.assign({}, evts[ref.id] || {}, data);
    (id ? updateDoc(ref, data) : setDoc(ref, data)).catch(fail);
    closeSheet(); toast(id ? "Modifié" : "Ajouté au " + fmtLong(data.date).toLowerCase());
  }

  /* ---- Gestes ---- */
  function move(n) { day = addDays(day, n); rerender() }
  function click(t) {
    const d = t.dataset;
    if (d.agmove) { move(Number(d.agmove)); return true }
    if (d.agjump) { day = d.agjump; rerender(); return true }
    if (d.agadd) { sheet(null, d.agadd, d.agday); return true }
    if (d.agedit) { sheet(d.agedit, null, d.agday); return true }
    return false;
  }
  function sheetClick(t) {
    const d = t.dataset;
    if (d.agdel) {
      if (!t.dataset.sure) { t.dataset.sure = "1"; t.textContent = evts[d.agdel] && evts[d.agdel].rep !== "une" ? "Confirmer (toutes les fois)" : "Confirmer"; return true }
      deleteDoc(aref(d.agdel)).catch(fail); delete evts[d.agdel]; closeSheet(); toast("Supprimé"); return true;
    }
    if (d.agskip) {
      const dd = t.closest("form").dataset.day, e = evts[d.agskip];
      e.sauf = (e.sauf || []).concat(dd); updateDoc(aref(d.agskip), { sauf: arrayUnion(dd) }).catch(fail); closeSheet(); toast("Retiré pour ce jour seulement"); return true;
    }
    return false;
  }
  // Glisser à gauche / à droite pour changer de jour
  let x0 = null, y0 = null;
  document.addEventListener("touchstart", e => { if (e.target.closest(".ag-swipe")) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY } else x0 = null }, { passive: true });
  document.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) move(dx < 0 ? (nbCols() === 7 ? 7 : 1) : -(nbCols() === 7 ? 7 : 1));
  }, { passive: true });
  // Remarques de la semaine : enregistrées quand on quitte le champ
  document.addEventListener("change", e => {
    if (e.target.id !== "agNote") return;
    const mon = e.target.dataset.agnote; notes[mon] = e.target.value;
    setDoc(doc(fs, "familles", code(), "agendaNotes", mon), { texte: e.target.value, maj: Date.now(), par: me() }).catch(fail); toast("Remarques enregistrées");
  });
  let lastWide = null;
  addEventListener("resize", () => { const w = nbCols(); if (w !== lastWide) { lastWide = w; refresh() } });

  return { connect, html, click, sheetClick, submitAny: f => f.dataset.form === "agenda" ? (submit(f), true) : false };
}
