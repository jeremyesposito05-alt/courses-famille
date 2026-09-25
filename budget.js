/* ---------- Onglet Budget : factures, prorata des salaires, solde entre Papa et Maman ---------- */
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Catégories : les 8 principales ont une couleur fixe (la couleur suit la catégorie, jamais son rang)
export const CATS = {
  "Logement": [], "Impôts": [],
  "Enfants": ["Cantine", "Sport", "Vêtements", "École et sorties", "Camps", "Argent de poche", "Anniversaires", "Garde"],
  "Santé": ["Assurance maladie", "Complémentaire", "Médecin", "Pharmacie", "Dentiste", "10 % non remboursés"],
  "Énergie": ["Gaz", "Électricité", "Bois"],
  "Loisirs": ["Voyage", "Ski", "Abonnements", "Sorties"],
  "Alimentation": ["Courses", "Restaurants"],
  "Assurances": [],
  "Maison": ["Internet", "Serafe", "Entretien et réparations", "Équipement", "Eau et déchets"],
  "Voiture": ["Essence", "Entretien et pneus", "Taxe véhicule", "Vignette", "Parking et transports"],
  "Téléphone": [], "Vie courante": ["Coiffeur et soins", "Cadeaux", "Abonnements", "Frais bancaires"],
  "Maison du Sud": ["Charges", "Entretien"], "Épargne": [], "Prévoyance": [], "Autre": []
};
const SLOT = { "Logement": 1, "Impôts": 2, "Enfants": 3, "Santé": 4, "Énergie": 5, "Loisirs": 6, "Alimentation": 7, "Assurances": 8 };
const FREQ = { mois: "Mensuelle", an: "Annuelle (lissée par mois)", ponctuel: "Ponctuelle (ce mois-là)" };
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function budgetModule(ctx) {
  const { fs, code, esc, toast, openSheet, closeSheet, rerender, isOpen, me } = ctx;
  const fam = (...p) => doc(fs, "familles", code(), ...p);
  let factures = {}, config = null, soldes = {}, loaded = false, showSal = false;
  let ym = ctx.ls.get("bm") || new Date().toISOString().slice(0, 7);
  const unsubs = [];
  const chf = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fail = () => toast("Modification non enregistrée");

  function connect() {
    unsubs.forEach(u => u()); unsubs.length = 0;
    unsubs.push(onSnapshot(collection(fs, "familles", code(), "factures"), s => { factures = {}; s.forEach(d => { factures[d.id] = d.data() }); loaded = true; if (ctx.tab() === "budget" && !isOpen()) rerender() }, () => {}));
    unsubs.push(onSnapshot(fam("budget", "config"), s => { config = s.exists() ? s.data() : { revenus: { Papa: 0, Maman: 0 } }; if (ctx.tab() === "budget" && !isOpen()) rerender() }, () => {}));
    unsubs.push(onSnapshot(collection(fs, "familles", code(), "budget"), s => { soldes = {}; s.forEach(d => { if (d.id.startsWith("solde-")) soldes[d.id.slice(6)] = d.data() }); if (ctx.tab() === "budget" && !isOpen()) rerender() }, () => {}));
  }

  /* ---- Calcul du mois ---- */
  const ratio = () => { const r = (config && config.revenus) || {}, p = Number(r.Papa) || 0, m = Number(r.Maman) || 0; return p + m ? { Papa: p / (p + m), Maman: m / (p + m), p, m } : { Papa: .5, Maman: .5, p, m } };
  const active = f => (!f.debut || f.debut <= ym) && (!f.fin || f.fin >= ym);
  function month() {
    const rt = ratio(), rows = [];
    let pay = { Papa: 0, Maman: 0 }, owe = { Papa: 0, Maman: 0 }, sansPayeur = 0;
    Object.entries(factures).forEach(([id, f]) => {
      const amt = Number(f.montant) || 0;
      let budget = 0, reel = 0;
      if (f.freq === "mois" && active(f)) { budget = amt; reel = amt }
      else if (f.freq === "an" && active(f)) { budget = amt / 12; reel = Number(f.moisPaiement) === Number(ym.slice(5)) ? amt : 0 }
      else if (f.freq === "ponctuel" && f.mois === ym) { budget = amt; reel = amt }
      if (!budget && !reel) return;
      const part = { Papa: f.type === "commune" ? budget * rt.Papa : f.type === "Papa" ? budget : 0, Maman: f.type === "commune" ? budget * rt.Maman : f.type === "Maman" ? budget : 0 };
      rows.push(Object.assign({ id, budget, reel, part }, f));
      if (reel) {
        if (f.payePar === "Papa" || f.payePar === "Maman") {
          pay[f.payePar] += reel;
          owe.Papa += f.type === "commune" ? reel * rt.Papa : f.type === "Papa" ? reel : 0;
          owe.Maman += f.type === "commune" ? reel * rt.Maman : f.type === "Maman" ? reel : 0;
        } else sansPayeur++;
      }
    });
    const sum = (k, filt) => rows.filter(filt).reduce((a, r) => a + r.part[k], 0);
    const com = { Papa: sum("Papa", r => r.type === "commune"), Maman: sum("Maman", r => r.type === "commune") };
    const ind = { Papa: sum("Papa", r => r.type !== "commune"), Maman: sum("Maman", r => r.type !== "commune") };
    const solde = pay.Papa - owe.Papa; // > 0 : Maman doit à Papa
    return { rt, rows, com, ind, reste: { Papa: rt.p - com.Papa - ind.Papa, Maman: rt.m - com.Maman - ind.Maman }, solde, sansPayeur };
  }

  /* ---- Graphique circulaire (anneau), étiquettes et valeurs dans la légende ---- */
  function donut(parts, label) {
    const total = parts.reduce((a, p) => a + p.v, 0); if (!total) return "";
    const R = 60, r = 38, C = 80; let a0 = -Math.PI / 2, paths = "";
    parts.forEach(p => {
      const a1 = a0 + 2 * Math.PI * p.v / total, big = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad, ang) => (C + rad * Math.cos(ang)).toFixed(2) + " " + (C + rad * Math.sin(ang)).toFixed(2);
      const d = parts.length === 1 ? "M" + pt(R, 0) + "A" + R + " " + R + " 0 1 1 " + pt(R, Math.PI) + "A" + R + " " + R + " 0 1 1 " + pt(R, 0) + "M" + pt(r, 0) + "A" + r + " " + r + " 0 1 0 " + pt(r, Math.PI) + "A" + r + " " + r + " 0 1 0 " + pt(r, 0) + "Z"
        : "M" + pt(R, a0) + "A" + R + " " + R + " 0 " + big + " 1 " + pt(R, a1) + "L" + pt(r, a1) + "A" + r + " " + r + " 0 " + big + " 0 " + pt(r, a0) + "Z";
      paths += '<path d="' + d + '" fill="' + p.c + '" stroke="var(--surface)" stroke-width="2"><title>' + esc(p.k) + " : " + chf(p.v) + " CHF (" + Math.round(p.v / total * 100) + ' %)</title></path>';
      a0 = a1;
    });
    return '<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(label) + '">' + paths +
      '<text x="80" y="76" text-anchor="middle" class="d-big">' + Math.round(total).toLocaleString("fr-CH") + '</text><text x="80" y="94" text-anchor="middle" class="d-small">CHF / mois</text></svg>' +
      '<ul class="legend">' + parts.map(p => '<li><i style="background:' + p.c + '"></i><span>' + esc(p.k) + '</span><b class="num">' + chf(p.v) + '</b><small class="num">' + Math.round(p.v / total * 100) + ' %</small></li>').join("") + '</ul></div>';
  }

  /* ---- Rendu ---- */
  function top() {
    const d = new Date(ym + "-15"), lbl = MOIS_L[d.getMonth()] + " " + d.getFullYear();
    return '<div class="mnav"><button class="x" data-bm="-1" aria-label="Mois précédent">‹</button><b>' + lbl.charAt(0).toUpperCase() + lbl.slice(1) + '</b><button class="x" data-bm="1" aria-label="Mois suivant">›</button></div>';
  }
  function render(main) {
    if (!loaded || !config) { main.innerHTML = '<p class="empty">Chargement du budget…</p>'; return }
    const m = month(), rt = m.rt;
    const sal = k => showSal ? chf(k === "Papa" ? rt.p : rt.m) : "••••";
    let h = '<section class="card b-sum"><div class="b-head"><h2>Qui paie quoi</h2><button class="lnk" data-b="eye">' + (showSal ? "Masquer les salaires" : "Voir les salaires") + '</button></div>' +
      '<table class="b-tab num"><thead><tr><th></th><th class="Papa">Papa</th><th class="Maman">Maman</th></tr></thead><tbody>' +
      '<tr><td>Salaire net</td><td>' + sal("Papa") + '</td><td>' + sal("Maman") + '</td></tr>' +
      '<tr><td>Prorata</td><td>' + (rt.Papa * 100).toFixed(1).replace(".", ",") + ' %</td><td>' + (rt.Maman * 100).toFixed(1).replace(".", ",") + ' %</td></tr>' +
      '<tr><td>Part des communes</td><td>' + chf(m.com.Papa) + '</td><td>' + chf(m.com.Maman) + '</td></tr>' +
      '<tr><td>Individuelles</td><td>' + chf(m.ind.Papa) + '</td><td>' + chf(m.ind.Maman) + '</td></tr>' +
      '<tr class="tot"><td>Reste</td><td>' + (showSal ? chf(m.reste.Papa) : "••••") + '</td><td>' + (showSal ? chf(m.reste.Maman) : "••••") + '</td></tr></tbody></table>' +
      (showSal ? '<button class="btn wide" data-b="sal">Modifier les salaires</button>' : "") + '</section>';
    // Solde du mois
    const s = Math.round(m.solde * 100) / 100, done = soldes[ym];
    h += '<section class="card"><h2>À régler ce mois</h2>' + (Math.abs(s) < 0.05 ? '<p>Vous êtes à l’équilibre.</p>' :
      '<p class="b-solde"><b class="' + (s > 0 ? "Maman" : "Papa") + '">' + (s > 0 ? "Maman" : "Papa") + '</b> envoie <b class="num">' + chf(Math.abs(s)) + ' CHF</b> à <b class="' + (s > 0 ? "Papa" : "Maman") + '">' + (s > 0 ? "Papa" : "Maman") + '</b></p>' +
      (done ? '<p class="note">✓ Remboursé le ' + esc(done.date || "") + ' (' + chf(done.montant) + ' CHF) · <button class="lnk" data-b="undone">annuler</button></p>' : '<button class="btn wide" data-b="done">Marquer comme remboursé</button>')) +
      '<p class="note">Calcul : ce que chacun a payé ce mois, moins sa part au prorata.' + (m.sansPayeur ? ' <b>' + m.sansPayeur + ' facture' + (m.sansPayeur > 1 ? "s" : "") + ' sans « payé par »</b> ne ' + (m.sansPayeur > 1 ? "sont" : "est") + ' pas comptée' + (m.sansPayeur > 1 ? "s" : "") + '.' : "") + '</p></section>';
    // Graphiques
    const byCat = {};
    m.rows.filter(r => r.type === "commune").forEach(r => { const k = SLOT[r.cat] ? r.cat : "Autres"; byCat[k] = (byCat[k] || 0) + r.budget });
    const parts = Object.entries(byCat).sort((a, b) => (SLOT[a[0]] || 99) - (SLOT[b[0]] || 99)).map(([k, v]) => ({ k, v, c: SLOT[k] ? "var(--s" + SLOT[k] + ")" : "var(--s-other)" }));
    h += '<section class="card"><h2>Où va l’argent commun</h2>' + donut(parts, "Répartition des dépenses communes par catégorie") + '</section>';
    h += '<section class="card"><h2>Participation aux communes</h2>' + donut([{ k: "Papa", v: m.com.Papa, c: "var(--papa)" }, { k: "Maman", v: m.com.Maman, c: "var(--maman)" }], "Participation de chacun aux dépenses communes") + '</section>';
    // Listes
    const group = (title, filt, extra) => {
      const rs = m.rows.filter(filt).sort((a, b) => b.budget - a.budget);
      if (!rs.length && !extra) return "";
      return '<section class="b-list"><h2>' + title + '<span class="num">' + chf(rs.reduce((a, r) => a + r.budget, 0)) + '</span></h2>' + rs.map(rowHtml).join("") + (extra || "") + '</section>';
    };
    h += group("Dépenses du mois", r => r.freq === "ponctuel", '<p class="note">Essence, vêtements, santé… touchez + pour ajouter une dépense.</p>');
    h += group("Communes · mensuelles", r => r.type === "commune" && r.freq === "mois");
    h += group("Communes · annuelles, lissées", r => r.type === "commune" && r.freq === "an");
    h += group("Individuelles · Papa", r => r.type === "Papa" && r.freq !== "ponctuel");
    h += group("Individuelles · Maman", r => r.type === "Maman" && r.freq !== "ponctuel");
    main.innerHTML = h;
  }
  function rowHtml(r) {
    const col = SLOT[r.cat] ? "var(--s" + SLOT[r.cat] + ")" : "var(--s-other)";
    return '<button class="b-row" data-fact="' + r.id + '" style="--rc:' + col + '"><span><b>' + esc(r.nom) + '</b><small>' + esc(r.cat + (r.sous ? " · " + r.sous : "")) +
      (r.freq === "an" ? " · " + chf(r.montant) + " / an" : "") + '</small><span class="tags">' +
      (r.type === "commune" ? '<span class="tag">au prorata</span>' : '<span class="tag ' + r.type + '">' + r.type + '</span>') +
      (r.payePar ? '<span class="tag ' + r.payePar + '">payé par ' + r.payePar + '</span>' : '<span class="tag warn">qui paie ?</span>') + '</span></span>' +
      '<span class="num b-amt">' + chf(r.budget) + (r.type === "commune" ? '<small>' + chf(r.part.Papa) + ' / ' + chf(r.part.Maman) + '</small>' : "") + '</span></button>';
  }

  /* ---- Fiches ---- */
  function editor(id) {
    const f = id ? factures[id] : { nom: "", montant: "", freq: "ponctuel", mois: ym, cat: "Vie courante", sous: "", type: "commune", payePar: me(), note: "" };
    const catOpts = Object.keys(CATS).map(c => '<option' + (c === f.cat ? " selected" : "") + '>' + esc(c) + '</option>').join("");
    const sousOpts = c => '<option value="">—</option>' + (CATS[c] || []).map(s => '<option' + (s === f.sous ? " selected" : "") + '>' + esc(s) + '</option>').join("");
    openSheet('<form data-form="facture" data-id="' + (id || "") + '"><div class="sheet-head"><h2>' + (id ? "Modifier" : "Ajouter une dépense") + '</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
      '<label class="f" for="bn">Libellé</label><input class="t" id="bn" required value="' + esc(f.nom) + '" placeholder="ex. Essence, dentiste Lana…">' +
      '<div class="two"><div><label class="f" for="bm">Montant CHF</label><input class="t" id="bm" type="number" step="0.05" min="0" inputmode="decimal" required value="' + esc(f.montant) + '"></div>' +
      '<div><label class="f" for="bf">Fréquence</label><select class="t" id="bf">' + Object.entries(FREQ).map(([k, t]) => '<option value="' + k + '"' + (k === f.freq ? " selected" : "") + '>' + t + '</option>').join("") + '</select></div></div>' +
      '<div id="bPonct"' + (f.freq === "ponctuel" ? "" : " hidden") + '><label class="f" for="bmo">Mois</label><input class="t" id="bmo" type="month" value="' + esc(f.mois || ym) + '"></div>' +
      '<div id="bAn"' + (f.freq === "an" ? "" : " hidden") + '><label class="f" for="bpm">Mois du paiement (pour le solde)</label><select class="t" id="bpm"><option value="">— pas précisé —</option>' + MOIS_L.map((mo, i) => '<option value="' + (i + 1) + '"' + (Number(f.moisPaiement) === i + 1 ? " selected" : "") + '>' + mo + '</option>').join("") + '</select></div>' +
      '<div class="two"><div><label class="f" for="bc">Catégorie</label><select class="t" id="bc">' + catOpts + '</select></div>' +
      '<div><label class="f" for="bs">Détail</label><select class="t" id="bs">' + sousOpts(f.cat) + '</select></div></div>' +
      '<div class="two"><div><label class="f" for="bt">Répartition</label><select class="t" id="bt"><option value="commune"' + (f.type === "commune" ? " selected" : "") + '>Commune (prorata)</option><option value="Papa"' + (f.type === "Papa" ? " selected" : "") + '>Individuelle Papa</option><option value="Maman"' + (f.type === "Maman" ? " selected" : "") + '>Individuelle Maman</option></select></div>' +
      '<div><label class="f" for="bp">Payé par</label><select class="t" id="bp"><option value="">— ?</option><option' + (f.payePar === "Papa" ? " selected" : "") + '>Papa</option><option' + (f.payePar === "Maman" ? " selected" : "") + '>Maman</option></select></div></div>' +
      (f.freq !== "ponctuel" && id ? '<label class="f" for="bfin">Dernier mois (si la facture s’arrête)</label><input class="t" id="bfin" type="month" value="' + esc(f.fin || "") + '">' : "") +
      '<label class="f" for="bno">Note</label><input class="t" id="bno" value="' + esc(f.note || "") + '">' +
      '<div class="actions">' + (id ? '<button type="button" class="btn danger" data-b="del">Supprimer</button>' : "") + '<button class="btn primary">' + (id ? "Enregistrer" : "Ajouter") + '</button></div></form>');
    ctx.sheet.querySelector("#bc").addEventListener("change", e => { ctx.sheet.querySelector("#bs").innerHTML = sousOpts(e.target.value) });
    ctx.sheet.querySelector("#bf").addEventListener("change", e => { ctx.sheet.querySelector("#bPonct").hidden = e.target.value !== "ponctuel"; ctx.sheet.querySelector("#bAn").hidden = e.target.value !== "an" });
  }
  function submit(form) {
    const q = s => ctx.sheet.querySelector(s), id = form.dataset.id;
    const montant = Math.round(parseFloat(String(q("#bm").value).replace(",", ".")) * 100) / 100;
    if (!q("#bn").value.trim() || isNaN(montant)) return;
    const data = { nom: q("#bn").value.trim(), montant, freq: q("#bf").value, cat: q("#bc").value, sous: q("#bs").value, type: q("#bt").value, payePar: q("#bp").value, note: q("#bno").value.trim(), maj: Date.now(), modifPar: me() };
    if (data.freq === "ponctuel") data.mois = q("#bmo").value || ym;
    if (data.freq === "an") data.moisPaiement = q("#bpm").value ? Number(q("#bpm").value) : null;
    if (q("#bfin")) data.fin = q("#bfin").value || null;
    const ref = id ? doc(fs, "familles", code(), "factures", id) : doc(collection(fs, "familles", code(), "factures"));
    if (!id) data.debut = data.freq === "ponctuel" ? data.mois : ym;
    (id ? updateDoc(ref, data) : setDoc(ref, Object.assign(data, { par: me() }))).catch(fail);
    factures[ref.id] = Object.assign({}, factures[ref.id] || {}, data);
    closeSheet(); toast(id ? "Facture modifiée" : "Dépense ajoutée");
  }
  function salSheet() {
    const r = (config && config.revenus) || {};
    openSheet('<form data-form="salaires"><div class="sheet-head"><h2>Salaires nets mensuels</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
      '<p class="note">Le prorata se recalcule aussitôt pour toutes les factures communes.</p>' +
      '<div class="two"><div><label class="f" for="sp">Papa</label><input class="t" id="sp" type="number" step="1" inputmode="decimal" value="' + esc(r.Papa || "") + '"></div>' +
      '<div><label class="f" for="sm">Maman</label><input class="t" id="sm" type="number" step="1" inputmode="decimal" value="' + esc(r.Maman || "") + '"></div></div>' +
      '<div class="actions"><button class="btn primary">Enregistrer</button></div></form>');
  }

  /* ---- Actions ---- */
  function click(t) {
    const d = t.dataset;
    if (d.bm) { const x = new Date(ym + "-15"); x.setMonth(x.getMonth() + Number(d.bm)); ym = x.toISOString().slice(0, 7); ctx.ls.set("bm", ym); rerender(); return true }
    if (d.fact) { editor(d.fact); return true }
    if (d.b === "eye") { showSal = !showSal; rerender(); return true }
    if (d.b === "sal") { salSheet(); return true }
    if (d.b === "done") { const m = month(); setDoc(fam("budget", "solde-" + ym), { fait: true, montant: Math.abs(Math.round(m.solde * 100) / 100), de: m.solde > 0 ? "Maman" : "Papa", date: new Date().toLocaleDateString("fr-CH"), par: me() }).catch(fail); soldes[ym] = { montant: Math.abs(m.solde), date: new Date().toLocaleDateString("fr-CH") }; rerender(); toast("Remboursement noté"); return true }
    if (d.b === "undone") { deleteDoc(fam("budget", "solde-" + ym)).catch(fail); delete soldes[ym]; rerender(); return true }
    return false;
  }
  function sheetClick(t) {
    if (t.dataset.b !== "del") return false;
    if (!t.dataset.sure) { t.dataset.sure = "1"; t.textContent = "Confirmer la suppression"; return true }
    const id = t.closest("form").dataset.id; deleteDoc(doc(fs, "familles", code(), "factures", id)).catch(fail); delete factures[id]; closeSheet(); toast("Facture supprimée"); return true;
  }
  function submitAny(form) {
    if (form.dataset.form === "facture") { submit(form); return true }
    if (form.dataset.form === "salaires") {
      const p = Number(ctx.sheet.querySelector("#sp").value) || 0, m = Number(ctx.sheet.querySelector("#sm").value) || 0;
      config = Object.assign({}, config, { revenus: { Papa: p, Maman: m } });
      setDoc(fam("budget", "config"), { revenus: { Papa: p, Maman: m }, maj: Date.now() }, { merge: true }).catch(fail);
      closeSheet(); toast("Salaires enregistrés"); return true;
    }
    return false;
  }
  return { connect, render, top, click, sheetClick, submitAny, add: () => editor(null) };
}
