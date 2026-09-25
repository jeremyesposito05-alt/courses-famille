/* ---------- Onglet Budget : factures, prorata des salaires, organisation des paiements ---------- */
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Catégories, dans l'ordre d'affichage du tableau. Les 8 premières ont une couleur fixe dans les graphiques.
export const CATS = {
  "Logement": [], "Maison du Sud": ["Crédit et impôt", "Charges", "Entretien"], "Impôts": [],
  "Enfants": ["Cantine", "Sport", "Vêtements", "École et sorties", "Camps", "Argent de poche", "Anniversaires", "Garde"],
  "Santé": ["Assurance maladie", "Complémentaire", "Médecin", "Pharmacie", "Dentiste", "10 % non remboursés"],
  "Énergie": ["Gaz", "Électricité", "Bois"],
  "Loisirs": ["Voyage", "Ski", "Abonnements", "Sorties"],
  "Alimentation": ["Courses", "Restaurants"],
  "Assurances": [],
  "Maison": ["Internet", "Serafe", "Entretien et réparations", "Équipement", "Eau et déchets"],
  "Voiture": ["Essence", "Entretien et pneus", "Taxe véhicule", "Vignette", "Parking et transports"],
  "Téléphone": [], "Vie courante": ["Coiffeur et soins", "Cadeaux", "Abonnements", "Frais bancaires"],
  "Épargne": [], "Prévoyance": [], "Autre": []
};
const PLAFOND_3A = 7258;   // plafond légal du 3e pilier (salariés avec caisse de pension)
const SHARED = t => t === "commune" || t === "egal";
const TYPE_LBL = { commune: "prorata", egal: "50/50", Papa: "individuelle", Maman: "individuelle" };
const CAT_ORDER = Object.keys(CATS);
const SLOT = { "Logement": 1, "Impôts": 2, "Enfants": 3, "Santé": 4, "Énergie": 5, "Loisirs": 6, "Alimentation": 7, "Assurances": 8 };
const FREQ = { mois: "Mensuelle", an: "Annuelle (lissée par mois)", ponctuel: "Ponctuelle (ce mois-là)" };
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const VIEWS = [["resume", "Résumé"], ["factures", "Factures"], ["paiements", "Paiements"], ["graph", "Graphiques"], ["avenir", "Avenir"]];
const colorOf = c => SLOT[c] ? "var(--s" + SLOT[c] + ")" : "var(--s-other)";

export function budgetModule(ctx) {
  const { fs, code, esc, toast, openSheet, closeSheet, rerender, isOpen, me } = ctx;
  const fam = (...p) => doc(fs, "familles", code(), ...p);
  const fref = id => doc(fs, "familles", code(), "factures", id);
  let factures = {}, config = null, loaded = false, showSal = false;
  let ym = ctx.ls.get("bm") || new Date().toISOString().slice(0, 7);
  let view = ctx.ls.get("bv") || "resume";
  const unsubs = [];
  const chf = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fail = () => toast("Modification non enregistrée");
  const refresh = () => { if (ctx.tab() === "budget" && !isOpen()) rerender() };

  function connect() {
    unsubs.forEach(u => u()); unsubs.length = 0;
    unsubs.push(onSnapshot(collection(fs, "familles", code(), "factures"), s => { factures = {}; s.forEach(d => { factures[d.id] = d.data() }); loaded = true; refresh() }, () => {}));
    unsubs.push(onSnapshot(fam("budget", "config"), s => { config = s.exists() ? s.data() : { revenus: { Papa: 0, Maman: 0 } }; refresh() }, () => {}));
  }

  /* ---- Calcul du mois (montants mensuels : les annuelles sont lissées) ---- */
  const ratio = () => { const r = (config && config.revenus) || {}, p = Number(r.Papa) || 0, m = Number(r.Maman) || 0; return p + m ? { Papa: p / (p + m), Maman: m / (p + m), p, m } : { Papa: .5, Maman: .5, p, m } };
  const active = f => (!f.debut || f.debut <= ym) && (!f.fin || f.fin >= ym);
  function month() {
    const rt = ratio(), rows = [];
    Object.entries(factures).forEach(([id, f]) => {
      const amt = Number(f.montant) || 0;
      let budget = 0;
      if (f.freq === "mois" && active(f)) budget = amt;
      else if (f.freq === "an" && active(f)) budget = amt / 12;
      else if (f.freq === "ponctuel" && f.mois === ym) budget = amt;
      if (!budget) return;
      const share = k => f.type === "commune" ? budget * rt[k] : f.type === "egal" ? budget / 2 : f.type === k ? budget : 0;
      rows.push(Object.assign({ id, budget, part: { Papa: share("Papa"), Maman: share("Maman") } }, f));
    });
    const sum = (k, filt) => rows.filter(filt).reduce((a, r) => a + r.part[k], 0);
    const com = { Papa: sum("Papa", r => SHARED(r.type)), Maman: sum("Maman", r => SHARED(r.type)) };
    const ind = { Papa: sum("Papa", r => !SHARED(r.type)), Maman: sum("Maman", r => !SHARED(r.type)) };
    // Comptes communs : dépenses mensuelles d'un côté, factures annuelles (lissées) de l'autre
    const cpt = { mois: { Papa: sum("Papa", r => SHARED(r.type) && r.freq !== "an"), Maman: sum("Maman", r => SHARED(r.type) && r.freq !== "an") },
                  an: { Papa: sum("Papa", r => SHARED(r.type) && r.freq === "an"), Maman: sum("Maman", r => SHARED(r.type) && r.freq === "an") } };
    // Paiements : ce que chacun règle, face à ce qu'il doit ; le reste se compense par un virement
    const paid = { Papa: 0, Maman: 0 }, owed = { Papa: 0, Maman: 0 }; let sansPayeur = 0;
    rows.forEach(r => {
      const payer = SHARED(r.type) ? r.payePar : (r.payePar || r.type);
      if (payer !== "Papa" && payer !== "Maman") { sansPayeur++; return }
      paid[payer] += r.budget; owed.Papa += r.part.Papa; owed.Maman += r.part.Maman;
    });
    return { rt, rows, com, ind, cpt, reste: { Papa: rt.p - com.Papa - ind.Papa, Maman: rt.m - com.Maman - ind.Maman }, paid, owed, virement: paid.Papa - owed.Papa, sansPayeur };
  }

  /* ---- Graphique circulaire (anneau) avec légende chiffrée ---- */
  function donut(parts, label) {
    const total = parts.reduce((a, p) => a + p.v, 0); if (!total) return "";
    const R = 60, r = 38, C = 80; let a0 = -Math.PI / 2, paths = "";
    const pt = (rad, ang) => (C + rad * Math.cos(ang)).toFixed(2) + " " + (C + rad * Math.sin(ang)).toFixed(2);
    parts.forEach(p => {
      const a1 = a0 + 2 * Math.PI * p.v / total, big = a1 - a0 > Math.PI ? 1 : 0;
      const d = "M" + pt(R, a0) + "A" + R + " " + R + " 0 " + big + " 1 " + pt(R, a1) + "L" + pt(r, a1) + "A" + r + " " + r + " 0 " + big + " 0 " + pt(r, a0) + "Z";
      paths += '<path d="' + d + '" fill="' + p.c + '" stroke="var(--surface)" stroke-width="2"><title>' + esc(p.k) + " : " + chf(p.v) + " CHF (" + Math.round(p.v / total * 100) + ' %)</title></path>';
      a0 = a1;
    });
    return '<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="' + esc(label) + '">' + paths +
      '<text x="80" y="76" text-anchor="middle" class="d-big">' + Math.round(total).toLocaleString("fr-CH") + '</text><text x="80" y="94" text-anchor="middle" class="d-small">CHF / mois</text></svg>' +
      '<ul class="legend">' + parts.map(p => '<li><i style="background:' + p.c + '"></i><span>' + esc(p.k) + '</span><b class="num">' + chf(p.v) + '</b><small class="num">' + Math.round(p.v / total * 100) + ' %</small></li>').join("") + '</ul></div>';
  }

  /* ---- En-tête : mois + sous-sections ---- */
  function top() {
    const d = new Date(ym + "-15"), lbl = MOIS_L[d.getMonth()] + " " + d.getFullYear();
    return '<div class="mnav"><button class="x" data-bm="-1" aria-label="Mois précédent">‹</button><b>' + lbl.charAt(0).toUpperCase() + lbl.slice(1) + '</b><button class="x" data-bm="1" aria-label="Mois suivant">›</button></div>' +
      '<div class="seg" role="group" aria-label="Sections du budget">' + VIEWS.map(([k, t]) => '<button data-bv="' + k + '" aria-pressed="' + (view === k) + '"><span class="tn">' + t + '</span></button>').join("") + '</div>';
  }

  function render(main) {
    if (!loaded || !config) { main.innerHTML = '<p class="empty">Chargement du budget…</p>'; return }
    const m = month();
    main.innerHTML = view === "factures" ? viewFactures(m) : view === "paiements" ? viewPaiements(m) : view === "graph" ? viewGraph(m) : view === "avenir" ? viewAvenir(m) : viewResume(m);
    if (view === "avenir") simUpdate();
  }

  function viewResume(m) {
    const rt = m.rt, hide = v => showSal ? chf(v) : "••••";
    return '<section class="card b-sum"><div class="b-head"><h2>Qui paie quoi</h2><button class="lnk" data-b="eye">' + (showSal ? "Masquer les salaires" : "Voir les salaires") + '</button></div>' +
      '<table class="b-tab num"><thead><tr><th></th><th class="Papa">Papa</th><th class="Maman">Maman</th></tr></thead><tbody>' +
      '<tr><td>Salaire net</td><td>' + hide(rt.p) + '</td><td>' + hide(rt.m) + '</td></tr>' +
      '<tr><td>Prorata</td><td>' + (rt.Papa * 100).toFixed(1).replace(".", ",") + ' %</td><td>' + (rt.Maman * 100).toFixed(1).replace(".", ",") + ' %</td></tr>' +
      '<tr><td>Part des communes</td><td>' + chf(m.com.Papa) + '</td><td>' + chf(m.com.Maman) + '</td></tr>' +
      '<tr><td>Individuelles</td><td>' + chf(m.ind.Papa) + '</td><td>' + chf(m.ind.Maman) + '</td></tr>' +
      '<tr><td>Total à charge</td><td>' + chf(m.com.Papa + m.ind.Papa) + '</td><td>' + chf(m.com.Maman + m.ind.Maman) + '</td></tr>' +
      '<tr class="tot"><td>Reste</td><td>' + hide(m.reste.Papa) + '</td><td>' + hide(m.reste.Maman) + '</td></tr></tbody></table>' +
      (showSal ? '<button class="btn wide" data-b="sal">Modifier les salaires</button>' : "") + '</section>' + versementsCard(m) +
      '<div class="b-go">' + VIEWS.slice(1).map(([k, t]) => '<button class="btn" data-bv="' + k + '">' + t + ' ›</button>').join("") + '</div>';
  }

  // Carte « qui finance les dépenses communes »
  function financeCard(m) {
    const tot = m.com.Papa + m.com.Maman;
    return '<section class="card"><h2>Qui finance les dépenses communes</h2>' +
      '<p class="note">Les dépenses communes coûtent <b class="num">' + chf(tot) + ' CHF</b> par mois (les annuelles divisées par 12). Voici la part que chacun en finance : au prorata des salaires, ou 50/50 pour la maison du Sud, le voyage et les montres. C’est ce que chacun doit verser, quelle que soit la personne qui règle la facture.</p>' +
      donut([{ k: "Papa", v: m.com.Papa, c: "var(--papa)" }, { k: "Maman", v: m.com.Maman, c: "var(--maman)" }], "Part de chacun dans les dépenses communes") + '</section>';
  }

  // Tableau : chaque facture, ce qu'elle coûte à Papa et à Maman, par catégorie
  function factRow(r) {
    return '<tr data-fact="' + r.id + '"><td><button class="f-name" data-fact="' + r.id + '"><b>' + esc(r.nom) + '</b><small>' + chf(r.budget) +
      (r.freq === "an" ? " / mois · " + chf(r.montant) + " / an" : r.freq === "ponctuel" ? " · ponctuelle" : "") + ' · ' + TYPE_LBL[r.type] + '</small></button></td>' +
      '<td>' + (r.part.Papa ? chf(r.part.Papa) : "—") + '</td><td>' + (r.part.Maman ? chf(r.part.Maman) : "—") + '</td></tr>';
  }
  function group(title, rs, color, extra) {
    if (!rs.length) return "";
    const sP = rs.reduce((a, r) => a + r.part.Papa, 0), sM = rs.reduce((a, r) => a + r.part.Maman, 0);
    return '<tbody style="--rc:' + color + '"><tr class="f-cat"><th scope="rowgroup">' + esc(title) + (extra || "") + '</th><td>' + chf(sP) + '</td><td>' + chf(sM) + '</td></tr>' +
      rs.sort((a, b) => b.budget - a.budget).map(factRow).join("") + '</tbody>';
  }
  function viewFactures(m) {
    const monthly = m.rows.filter(r => r.freq !== "an"), annual = m.rows.filter(r => r.freq === "an");
    const byCat = {}; monthly.forEach(r => { (byCat[r.cat] = byCat[r.cat] || []).push(r) });
    const cats = Object.keys(byCat).sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
    let h = '<p class="note" style="margin-top:12px">Ce que chaque facture coûte à chacun, par mois. Touchez une ligne pour la modifier.</p>' +
      '<table class="f-tab num"><thead><tr><th>Facture</th><th class="Papa">Papa</th><th class="Maman">Maman</th></tr></thead>';
    cats.forEach(c => { h += group(c, byCat[c], colorOf(c)) });
    const tA = annual.reduce((a, r) => a + (Number(r.montant) || 0), 0);
    h += group("Factures annuelles", annual, "var(--courge)", '<small class="f-sub">' + chf(tA) + ' CHF / an, soit par mois :</small>');
    h += '<tfoot><tr><th>Total par mois</th><td>' + chf(m.com.Papa + m.ind.Papa) + '</td><td>' + chf(m.com.Maman + m.ind.Maman) + '</td></tr></tfoot></table>';
    return h;
  }
  // Versements de chacun vers les comptes communs (repris du Résumé et de Paiements)
  function versementsCard(m, withNote) {
    const c = m.cpt, t = k => c.mois[k] + c.an[k];
    return '<section class="card"><h2>Versements mensuels de chacun</h2>' +
      '<table class="b-tab num"><thead><tr><th></th><th class="Papa">Papa</th><th class="Maman">Maman</th><th>Total</th></tr></thead><tbody>' +
      '<tr><td>Compte des dépenses mensuelles</td><td>' + chf(c.mois.Papa) + '</td><td>' + chf(c.mois.Maman) + '</td><td>' + chf(c.mois.Papa + c.mois.Maman) + '</td></tr>' +
      '<tr><td>Compte des factures annuelles</td><td>' + chf(c.an.Papa) + '</td><td>' + chf(c.an.Maman) + '</td><td>' + chf(c.an.Papa + c.an.Maman) + '</td></tr>' +
      '<tr class="tot"><td>Total à verser</td><td>' + chf(t("Papa")) + '</td><td>' + chf(t("Maman")) + '</td><td>' + chf(t("Papa") + t("Maman")) + '</td></tr></tbody></table>' +
      (withNote ? '<p class="note">Possibilité de verser ces sommes chaque mois sur deux comptes communs : l’un paie les factures du mois, l’autre accumule de quoi régler les factures annuelles quand elles tombent. Plus besoin de virements entre vous.</p>' : "") + '</section>';
  }

  /* ---- Avenir : simulation de l'épargne et de la prévoyance ---- */
  let sim = {}, rate = 0;
  const simLines = () => month().rows.filter(r => (r.cat === "Épargne" || r.cat === "Prévoyance") && r.freq === "mois");
  const fv = (pm, years) => { const i = rate / 100 / 12, n = years * 12; return i ? pm * ((Math.pow(1 + i, n) - 1) / i) : pm * n };
  function viewAvenir(m) {
    const lines = simLines(), ep = lines.filter(r => r.cat === "Épargne"), pv = lines.filter(r => r.cat === "Prévoyance");
    const who = r => r.type === "Papa" || r.type === "Maman" ? ' <span class="tag ' + r.type + '">' + r.type + '</span>' : r.type === "commune" ? ' <span class="tag">prorata</span>' : ' <span class="tag">50/50</span>';
    const input = r => '<input class="t sim" type="number" step="1" min="0" inputmode="decimal" data-sim="' + r.id + '" value="' + (sim[r.id] ?? r.budget) + '" aria-label="Montant mensuel ' + esc(r.nom) + '">';
    const row = r => '<tr><td><b>' + esc(r.nom) + '</b>' + who(r) + '</td><td>' + input(r) + '</td><td id="s1-' + r.id + '"></td><td id="s5-' + r.id + '"></td><td id="s10-' + r.id + '"></td></tr>';
    return '<p class="note" style="margin-top:12px">Changez les montants mensuels pour simuler : tout se recalcule en direct. Rien n’est enregistré tant que vous n’appuyez pas sur « Appliquer au budget ».</p>' +
      '<section class="card"><h2>Épargne</h2>' +
      '<label class="f" for="simRate">Rendement annuel supposé (%)</label><input class="t" id="simRate" type="number" step="0.1" min="0" max="15" inputmode="decimal" value="' + rate + '" style="max-width:120px">' +
      '<p class="note">0 % = argent simplement mis de côté. Un rendement n’est jamais garanti : c’est une hypothèse, pas un conseil de placement.</p>' +
      '<div class="scroll-x"><table class="f-tab num sim-tab"><thead><tr><th>Épargne</th><th>Par mois</th><th>1 an</th><th>5 ans</th><th>10 ans</th></tr></thead><tbody>' + ep.map(row).join("") + '</tbody>' +
      '<tfoot><tr><th>Total</th><td id="sT0"></td><td id="sT1"></td><td id="sT5"></td><td id="sT10"></td></tr></tfoot></table></div></section>' +
      '<section class="card"><h2>3e pilier</h2><p class="obj num">Objectif : ' + chf(PLAFOND_3A) + ' CHF par an chacun, soit ' + chf(PLAFOND_3A / 12) + ' CHF par mois</p>' +
      '<div class="scroll-x"><table class="f-tab num sim-tab"><thead><tr><th></th><th>Par mois</th><th>Sur l’année</th><th>À compléter</th></tr></thead><tbody>' +
      pv.map(r => '<tr><td>' + who(r) + '</td><td>' + input(r) + '</td><td id="p1-' + r.id + '"></td><td id="pg-' + r.id + '"></td></tr>').join("") + '</tbody></table></div>' +
      '<p class="note">« À compléter » : ce qu’il faut verser en plus avant la fin de l’année pour atteindre le plafond.</p>' +
      '<button class="btn wide" data-b="3amax">Régler les deux au plafond (' + chf(PLAFOND_3A / 12) + ' / mois)</button></section>' +
      '<section class="card"><h2>Effet sur le budget</h2><p id="simEffect" class="num"></p>' +
      '<div class="actions"><button class="btn" data-b="simreset">Revenir aux montants actuels</button><button class="btn primary" data-b="simapply">Appliquer au budget</button></div></section>';
  }
  function simUpdate() {
    const lines = simLines(), rt = ratio(); if (!document.getElementById("simEffect")) return;
    const val = r => { const v = Number(sim[r.id] ?? r.budget); return isNaN(v) ? 0 : v };
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v };
    let tot = 0; const d = { Papa: 0, Maman: 0 };
    lines.forEach(r => {
      const v = val(r), delta = v - r.budget;
      if (r.cat === "Épargne") { tot += v; set("s1-" + r.id, chf(fv(v, 1))); set("s5-" + r.id, chf(fv(v, 5))); set("s10-" + r.id, chf(fv(v, 10))) }
      else { const an = v * 12, gap = PLAFOND_3A - an; set("p1-" + r.id, chf(an)); set("pg-" + r.id, gap > 0.5 ? chf(gap) : gap < -0.5 ? "au-dessus de " + chf(-gap) : "✓") }
      if (r.type === "commune") { d.Papa += delta * rt.Papa; d.Maman += delta * rt.Maman } else if (r.type === "egal") { d.Papa += delta / 2; d.Maman += delta / 2 } else if (d[r.type] !== undefined) d[r.type] += delta;
    });
    set("sT0", chf(tot)); set("sT1", chf(fv(tot, 1))); set("sT5", chf(fv(tot, 5))); set("sT10", chf(fv(tot, 10)));
    const fx = k => Math.abs(d[k]) < 0.005 ? "inchangé" : (d[k] > 0 ? "−" : "+") + chf(Math.abs(d[k])) + " CHF par mois";
    document.getElementById("simEffect").innerHTML = 'Reste de Papa : <b>' + fx("Papa") + '</b><br>Reste de Maman : <b>' + fx("Maman") + '</b>';
  }
  document.addEventListener("input", e => {
    if (e.target.dataset && e.target.dataset.sim) { sim[e.target.dataset.sim] = e.target.value === "" ? 0 : Number(String(e.target.value).replace(",", ".")); simUpdate() }
    else if (e.target.id === "simRate") { rate = Math.max(0, Number(String(e.target.value).replace(",", ".")) || 0); simUpdate() }
  });
  function simApply(btn) {
    const changes = simLines().filter(r => sim[r.id] !== undefined && Math.abs(Number(sim[r.id]) - r.budget) > 0.004);
    if (!changes.length) { toast("Aucun montant modifié"); return }
    if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "Confirmer (" + changes.length + " montant" + (changes.length > 1 ? "s" : "") + ")"; return }
    const b = writeBatch(fs);
    changes.forEach(r => { const v = Math.round(Number(sim[r.id]) * 100) / 100; b.update(fref(r.id), { montant: v, maj: Date.now(), modifPar: me() }); factures[r.id].montant = v });
    b.commit().catch(fail); sim = {}; toast("Budget mis à jour"); rerender();
  }
  // Qui règle quelle facture, et le virement mensuel qui en découle
  function viewPaiements(m) {
    const v = Math.round(m.virement * 100) / 100, communes = m.rows.filter(r => SHARED(r.type)).sort((a, b) => b.budget - a.budget);
    let h = '<section class="card"><h2>Virement mensuel</h2>';
    if (m.sansPayeur) h += '<p>Indiquez qui paie chaque facture commune (<b>' + m.sansPayeur + '</b> sans payeur), ou laissez-moi proposer une organisation.</p>';
    else if (Math.abs(v) < 0.05) h += '<p>Pas de virement nécessaire : chacun paie exactement sa part.</p>';
    else h += '<p class="b-solde"><b class="' + (v > 0 ? "Maman" : "Papa") + '">' + (v > 0 ? "Maman" : "Papa") + '</b> envoie <b class="num">' + chf(Math.abs(v)) + ' CHF</b> à <b class="' + (v > 0 ? "Papa" : "Maman") + '">' + (v > 0 ? "Papa" : "Maman") + '</b> chaque mois</p>';
    h += '<button class="btn wide" data-b="propose">Proposer une organisation</button></section>';
    h += '<table class="f-tab num"><thead><tr><th>Facture commune</th><th>Par mois</th><th>Payé par</th></tr></thead><tbody>' +
      communes.map(r => '<tr><td><button class="f-name" data-fact="' + r.id + '"><b>' + esc(r.nom) + '</b><small>' + esc(r.cat) + (r.freq === "an" ? " · " + chf(r.montant) + " / an" : "") + '</small></button></td><td>' + chf(r.budget) + '</td>' +
        '<td><button class="payer ' + (r.payePar || "none") + '" data-payer="' + r.id + '">' + (r.payePar || "?") + '</button></td></tr>').join("") + '</tbody>' +
      '<tfoot><tr><th>Factures réglées par Papa</th><td colspan="2">' + chf(m.paid.Papa) + ' <small>(sa part : ' + chf(m.owed.Papa) + ')</small></td></tr>' +
      '<tr><th>Factures réglées par Maman</th><td colspan="2">' + chf(m.paid.Maman) + ' <small>(sa part : ' + chf(m.owed.Maman) + ')</small></td></tr></tfoot></table>' +
      '<p class="note">Touchez « Papa » ou « Maman » pour changer qui règle la facture. Les factures individuelles sont réglées par leur titulaire.</p>';
    return h + versementsCard(m, true);
  }

  function viewGraph(m) {
    const byCat = {};
    m.rows.filter(r => SHARED(r.type)).forEach(r => { const c = r.cat === "Maison du Sud" ? "Logement" : r.cat, k = SLOT[c] ? c : "Autres"; byCat[k] = (byCat[k] || 0) + r.budget });
    const parts = Object.entries(byCat).sort((a, b) => (SLOT[a[0]] || 99) - (SLOT[b[0]] || 99)).map(([k, v]) => ({ k, v, c: k === "Autres" ? "var(--s-other)" : colorOf(k) }));
    return '<section class="card"><h2>Où va l’argent commun</h2>' + donut(parts, "Répartition des dépenses communes par catégorie") + '</section>' + financeCard(m);
  }

  /* ---- Organisation proposée : chaque facture va à qui a le plus de part restant à couvrir ---- */
  function proposal(m) {
    const communes = m.rows.filter(r => SHARED(r.type) && r.freq !== "ponctuel").sort((a, b) => b.budget - a.budget);
    const target = { Papa: 0, Maman: 0 }; communes.forEach(r => { target.Papa += r.part.Papa; target.Maman += r.part.Maman });
    const got = { Papa: 0, Maman: 0 }, plan = {};
    communes.forEach(r => { const who = (target.Papa - got.Papa) >= (target.Maman - got.Maman) ? "Papa" : "Maman"; plan[r.id] = who; got[who] += r.budget });
    return { communes, plan, got, target, virement: got.Papa - target.Papa };
  }
  function proposeSheet() {
    const p = proposal(month()), v = Math.round(p.virement * 100) / 100;
    const list = who => p.communes.filter(r => p.plan[r.id] === who).map(r => '<li><span>' + esc(r.nom) + '</span><b class="num">' + chf(r.budget) + '</b></li>').join("");
    openSheet('<div class="sheet-head"><h2>Organisation proposée</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
      '<p class="note">Chacun règle directement les factures ci-dessous ; la petite différence se compense par un seul virement mensuel.</p>' +
      '<h3 class="Papa-t">Papa paie · ' + chf(p.got.Papa) + '</h3><ul class="plan">' + list("Papa") + '</ul>' +
      '<h3 class="Maman-t">Maman paie · ' + chf(p.got.Maman) + '</h3><ul class="plan">' + list("Maman") + '</ul>' +
      '<p class="b-solde">' + (Math.abs(v) < 0.05 ? "Aucun virement nécessaire." : '<b class="' + (v > 0 ? "Maman" : "Papa") + '">' + (v > 0 ? "Maman" : "Papa") + '</b> envoie <b class="num">' + chf(Math.abs(v)) + ' CHF</b> à <b class="' + (v > 0 ? "Papa" : "Maman") + '">' + (v > 0 ? "Papa" : "Maman") + '</b> chaque mois') + '</p>' +
      '<p class="note">Les dépenses ponctuelles restent à indiquer au fil du mois. Tout reste modifiable ensuite, facture par facture.</p>' +
      '<div class="actions"><button type="button" class="btn primary" data-b="apply">Appliquer cette organisation</button></div>');
  }
  function applyProposal() {
    const p = proposal(month()), b = writeBatch(fs);
    Object.entries(p.plan).forEach(([id, who]) => { b.update(fref(id), { payePar: who, maj: Date.now(), modifPar: me() }); factures[id].payePar = who });
    b.commit().catch(fail); closeSheet(); toast("Organisation appliquée");
  }

  /* ---- Fiches ---- */
  function editor(id) {
    const f = id ? factures[id] : { nom: "", montant: "", freq: "ponctuel", mois: ym, cat: "Vie courante", sous: "", type: "commune", payePar: me(), note: "" };
    const catOpts = CAT_ORDER.map(c => '<option' + (c === f.cat ? " selected" : "") + '>' + esc(c) + '</option>').join("");
    const sousOpts = c => '<option value="">—</option>' + (CATS[c] || []).map(s => '<option' + (s === f.sous ? " selected" : "") + '>' + esc(s) + '</option>').join("");
    openSheet('<form data-form="facture" data-id="' + (id || "") + '"><div class="sheet-head"><h2>' + (id ? "Modifier" : "Ajouter une dépense") + '</h2><button type="button" class="x" aria-label="Fermer">×</button></div>' +
      '<label class="f" for="bn">Libellé</label><input class="t" id="bn" required value="' + esc(f.nom) + '" placeholder="ex. Essence, dentiste Lana…">' +
      '<div class="two"><div><label class="f" for="bm">Montant CHF</label><input class="t" id="bm" type="number" step="0.05" min="0" inputmode="decimal" required value="' + esc(f.montant) + '"></div>' +
      '<div><label class="f" for="bf">Fréquence</label><select class="t" id="bf">' + Object.entries(FREQ).map(([k, t]) => '<option value="' + k + '"' + (k === f.freq ? " selected" : "") + '>' + t + '</option>').join("") + '</select></div></div>' +
      '<div id="bPonct"' + (f.freq === "ponctuel" ? "" : " hidden") + '><label class="f" for="bmo">Mois</label><input class="t" id="bmo" type="month" value="' + esc(f.mois || ym) + '"></div>' +
      '<div class="two"><div><label class="f" for="bc">Catégorie</label><select class="t" id="bc">' + catOpts + '</select></div>' +
      '<div><label class="f" for="bs">Détail</label><select class="t" id="bs">' + sousOpts(f.cat) + '</select></div></div>' +
      '<div class="two"><div><label class="f" for="bt">Répartition</label><select class="t" id="bt"><option value="commune"' + (f.type === "commune" ? " selected" : "") + '>Commune (prorata)</option><option value="egal"' + (f.type === "egal" ? " selected" : "") + '>Commune (50/50)</option><option value="Papa"' + (f.type === "Papa" ? " selected" : "") + '>Individuelle Papa</option><option value="Maman"' + (f.type === "Maman" ? " selected" : "") + '>Individuelle Maman</option></select></div>' +
      '<div><label class="f" for="bp">Payé par</label><select class="t" id="bp"><option value="">— ?</option><option' + (f.payePar === "Papa" ? " selected" : "") + '>Papa</option><option' + (f.payePar === "Maman" ? " selected" : "") + '>Maman</option></select></div></div>' +
      (f.freq !== "ponctuel" && id ? '<label class="f" for="bfin">Dernier mois (si la facture s’arrête)</label><input class="t" id="bfin" type="month" value="' + esc(f.fin || "") + '">' : "") +
      '<label class="f" for="bno">Note</label><input class="t" id="bno" value="' + esc(f.note || "") + '">' +
      '<div class="actions">' + (id ? '<button type="button" class="btn danger" data-b="del">Supprimer</button>' : "") + '<button class="btn primary">' + (id ? "Enregistrer" : "Ajouter") + '</button></div></form>');
    ctx.sheet.querySelector("#bc").addEventListener("change", e => { ctx.sheet.querySelector("#bs").innerHTML = sousOpts(e.target.value) });
    ctx.sheet.querySelector("#bf").addEventListener("change", e => { ctx.sheet.querySelector("#bPonct").hidden = e.target.value !== "ponctuel" });
  }
  function submit(form) {
    const q = s => ctx.sheet.querySelector(s), id = form.dataset.id;
    const montant = Math.round(parseFloat(String(q("#bm").value).replace(",", ".")) * 100) / 100;
    if (!q("#bn").value.trim() || isNaN(montant)) return;
    const data = { nom: q("#bn").value.trim(), montant, freq: q("#bf").value, cat: q("#bc").value, sous: q("#bs").value, type: q("#bt").value, payePar: q("#bp").value, note: q("#bno").value.trim(), maj: Date.now(), modifPar: me() };
    if (data.freq === "ponctuel") data.mois = q("#bmo").value || ym;
    if (q("#bfin")) data.fin = q("#bfin").value || null;
    const ref = id ? fref(id) : doc(collection(fs, "familles", code(), "factures"));
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
    if (d.bv) { view = d.bv; ctx.ls.set("bv", view); rerender(); window.scrollTo(0, 0); return true }
    if (d.fact) { editor(d.fact); return true }
    if (d.payer) {
      const f = factures[d.payer]; if (!f) return true;
      const next = f.payePar === "Papa" ? "Maman" : "Papa";
      f.payePar = next; updateDoc(fref(d.payer), { payePar: next, maj: Date.now(), modifPar: me() }).catch(fail); rerender(); return true;
    }
    if (d.b === "eye") { showSal = !showSal; rerender(); return true }
    if (d.b === "sal") { salSheet(); return true }
    if (d.b === "propose") { proposeSheet(); return true }
    if (d.b === "simapply") { simApply(t); return true }
    if (d.b === "simreset") { sim = {}; rate = 0; rerender(); return true }
    if (d.b === "3amax") { simLines().filter(r => r.cat === "Prévoyance").forEach(r => { sim[r.id] = Math.round(PLAFOND_3A / 12 * 100) / 100 }); rerender(); return true }
    return false;
  }
  function sheetClick(t) {
    if (t.dataset.b === "apply") { applyProposal(); return true }
    if (t.dataset.b !== "del") return false;
    if (!t.dataset.sure) { t.dataset.sure = "1"; t.textContent = "Confirmer la suppression"; return true }
    const id = t.closest("form").dataset.id; deleteDoc(fref(id)).catch(fail); delete factures[id]; closeSheet(); toast("Facture supprimée"); return true;
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
