/* Démonstration locale uniquement. Le choix Papa/Maman ne protège aucune donnée.
   Ne jamais saisir de données privées dans ce module. */
export function demoTasksModule(ctx) {
  const { me, esc, rerender, toast } = ctx;
  const preview = ctx.preview === true;
  const storageKey = preview ? "cf.preview.todos.v2" : "cf.prototype.todos.v2";
  const profile = () => me() === "Maman" ? "Maman" : "Papa";
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  };
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
  const categories = () => [
    { id: "famille", title: "Famille", css: "family" },
    ...(profile() === "Maman" ? [] : [{ id: "pro", title: "Pro", css: "work" }]),
    { id: "general", title: "Général", css: "general" }
  ];
  let currentFilter = "all";
  let storageWarned = false;
  const empty = () => ({ version: 2, family: [], personal: { Papa: [], Maman: [] } });
  function normalize(list, areas) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter(t => t && typeof t.id === "string" && typeof t.text === "string" && t.text.trim())
      .map(t => ({ id: t.id, text: t.text.slice(0, 180), area: t.area === "perso" ? "general" : t.area || "famille",
        priority: t.priority === "high" ? "high" : "normal", due: validDate(t.due) ? t.due : "",
        done: t.done === true, created: Number.isFinite(t.created) ? t.created : 0, updated: Number.isFinite(t.updated) ? t.updated : 0 }))
      .filter(t => areas.includes(t.area) && !seen.has(t.id) && seen.add(t.id));
  }
  function write(store) {
    try { localStorage.setItem(storageKey, JSON.stringify(store)); return true }
    catch (_) { toast("Stockage local indisponible : modification non enregistrée."); return false }
  }
  function initialStore() {
    const store = empty();
    if (preview) {
      const make = (id, text, area, due = "", priority = "normal") => ({ id, text, area, due, priority, done: false, created: 0, updated: 0 });
      store.family = [make("demo-family", "Préparer le sac pour la sortie", "famille", today(), "high")];
      store.personal.Papa = [make("demo-pro", "Préparer la réunion d’équipe", "pro", today()), make("demo-general-papa", "Classer les papiers du mois", "general")];
      store.personal.Maman = [make("demo-general-maman", "Prendre un rendez-vous personnel", "general")];
    } else {
      // Préserver les anciennes clés du prototype. Aucune migration en prévisualisation.
      for (const person of ["Papa", "Maman"]) {
        let old = [];
        try { old = JSON.parse(localStorage.getItem("cf.prototype.todos.v1." + person) || "[]") } catch (_) { /* ancienne clé conservée */ }
        store.family.push(...normalize(old, ["famille"]));
        store.personal[person] = normalize(old, person === "Papa" ? ["pro", "general"] : ["general"]);
      }
      store.family = normalize(store.family, ["famille"]);
    }
    return store;
  }
  function readStore() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) { const store = initialStore(); write(store); return store }
      const value = JSON.parse(raw);
      if (!value || value.version !== 2 || !Array.isArray(value.family) || !value.personal) throw new Error("Invalid local data");
      return { version: 2, family: normalize(value.family, ["famille"]), personal: {
        Papa: normalize(value.personal.Papa, ["pro", "general"]), Maman: normalize(value.personal.Maman, ["general"])
      } };
    } catch (_) {
      if (!storageWarned) { storageWarned = true; toast("Données locales illisibles. Elles sont conservées ; les modifications sont désactivées.") }
      return null;
    }
  }
  function read() {
    const store = readStore();
    return store ? [...store.family, ...store.personal[profile()]] : [];
  }
  function save(data) {
    const store = readStore();
    if (!store) { toast("Impossible d’enregistrer : les données locales sont illisibles."); return false }
    store.family = normalize(data, ["famille"]);
    store.personal[profile()] = normalize(data, profile() === "Papa" ? ["pro", "general"] : ["general"]);
    return write(store);
  }
  const when = date => validDate(date)
    ? new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" }).format(new Date(date + "T12:00:00")) : "Sans échéance";
  function ordered() {
    return read().sort((a, b) => Number(a.done) - Number(b.done) || Number(b.priority === "high") - Number(a.priority === "high") ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") || a.created - b.created);
  }
  function counts() {
    const all = read(), active = all.filter(t => !t.done);
    return { all: active.length, urgent: active.filter(t => t.priority === "high").length, done: all.length - active.length,
      byCategory: Object.fromEntries(categories().map(c => [c.id, active.filter(t => t.area === c.id).length])) };
  }
  function summary() {
    const c = counts();
    return '<button type="button" class="sk-priority-link sk-card" data-tab="taches" aria-label="Ouvrir Mes priorités : ' + c.all + ' en attente">' +
      '<span class="sk-eyebrow">CENTRE D’ORGANISATION</span><span class="sk-priority-header"><strong>Mes priorités</strong>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '<span class="sk-priority-desc">' + c.all + ' en attente · ' + c.urgent + ' urgente' + (c.urgent !== 1 ? 's' : '') + '</span>' +
      '<span class="sk-counts" style="grid-template-columns:repeat(' + categories().length + ',minmax(0,1fr))">' + categories().map(cat =>
        '<span class="sk-count ' + cat.css + '"><strong>' + c.byCategory[cat.id] + '</strong><span>' + cat.title + '</span></span>').join("") + '</span></button>';
  }
  function row(t) {
    const overdue = !t.done && t.due && t.due < today();
    return '<div class="sk-task-row' + (t.done ? ' done' : '') + '">' +
      '<label class="sk-task-copy" style="display:flex;gap:10px;align-items:start;cursor:pointer;min-height:44px">' +
      '<input type="checkbox" data-todo-check="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + ' aria-label="' + (t.done ? 'Réouvrir' : 'Terminer') + ' la priorité : ' + esc(t.text) + '">' +
      '<span style="flex:1;min-width:0"><strong>' + esc(t.text) + '</strong><small>' +
      (t.priority === "high" ? '<span class="sk-urgent">Urgente</span> · ' : '') + (overdue ? '<span class="sk-urgent">En retard · </span>' : '') + esc(when(t.due)) + '</small></span></label>' +
      '<button class="sk-delete" style="min-width:44px;min-height:44px;flex:none" type="button" data-todo-delete="' + esc(t.id) + '" aria-label="Supprimer la priorité : ' + esc(t.text) + '">×</button></div>';
  }
  function render(main) {
    const all = ordered(), c = counts();
    const selected = all.filter(t => currentFilter === "done" ? t.done : currentFilter === "urgent" ? !t.done && t.priority === "high" :
      currentFilter === "today" ? !t.done && t.due === today() : true);
    const choices = categories();
    main.innerHTML = '<section class="sk-priorities-page"><div class="sk-eyebrow">MON ORGANISATION</div><h2 class="sk-page-title">Mes priorités</h2>' +
      '<p class="sk-subtitle">Un endroit pour agir, sans se disperser.</p>' +
      '<p class="sk-summary-line" role="status"><strong>' + c.all + ' en attente</strong> · ' + c.urgent + ' urgente' + (c.urgent !== 1 ? 's' : '') + ' · ' + c.done + ' terminée' + (c.done !== 1 ? 's' : '') + '</p>' +
      '<div class="sk-priority-filters" role="group" aria-label="Filtrer les priorités">' +
      [['all', 'Toutes'], ['urgent', 'Urgentes'], ['today', "Aujourd’hui"], ['done', 'Terminées']].map(([id, title]) =>
        '<button type="button" data-todo-filter="' + id + '" aria-pressed="' + (currentFilter === id) + '">' + title + '</button>').join("") + '</div><div class="sk-groups">' +
      choices.map(cat => {
        const list = selected.filter(t => t.area === cat.id);
        return '<section class="sk-group sk-card ' + cat.css + '" aria-label="Priorités ' + cat.title + '"><div class="sk-group-header"><strong>' + cat.title +
          '</strong><span class="sk-group-count" aria-label="' + list.length + ' affichées">' + list.length + '</span></div>' +
          (list.length ? list.map(row).join("") : '<div class="sk-group-empty">Aucune priorité pour ce filtre.</div>') + '</section>';
      }).join("") + '</div>' +
      '<button type="button" class="sk-add-task sk-card" data-todo-add aria-controls="todoForm" aria-expanded="false">+ Nouvelle priorité</button>' +
      '<form id="todoForm" class="sk-task-form" hidden><label for="todoTitle">Quelle priorité ?<input id="todoTitle" name="text" required maxlength="180" autocomplete="off" placeholder="Ex. préparer les affaires du week-end"></label>' +
      '<div class="sk-form-grid"><label>Catégorie<select name="area">' + choices.map(cat => '<option value="' + cat.id + '">' + cat.title + '</option>').join("") + '</select></label>' +
      '<label>Importance<select name="priority"><option value="normal">Normale</option><option value="high">Urgente</option></select></label>' +
      '<label>Échéance<input name="due" type="date" min="1900-01-01" max="9999-12-31"></label></div>' +
      '<div class="sk-task-actions"><button class="primary" type="submit">Enregistrer</button><button class="secondary" type="button" data-todo-cancel>Annuler</button></div></form>' +
      '<p class="sk-preview">Démonstration : données fictives enregistrées sur cet appareil. Famille est commun aux deux profils locaux ; Pro est visible dans le profil Papa. Ce choix de profil n’est pas une authentification. Aucune synchronisation ni confidentialité garantie.</p></section>';
  }
  function add(form) {
    const field = name => form.elements.namedItem(name);
    const title = field("text").value.trim(), area = field("area").value, due = field("due").value || "";
    if (!title) { toast("Indique un titre pour cette priorité."); field("text").focus(); return }
    if (!categories().some(c => c.id === area)) { toast("Catégorie indisponible."); return }
    if (due && !validDate(due)) { toast("Indique une date valide."); field("due").focus(); return }
    const data = read();
    if (data.length >= 500) { toast("La limite de 500 priorités d’essai est atteinte. Supprime une priorité avant d’en ajouter."); return }
    const now = Date.now();
    const item = { id: "todo_" + (globalThis.crypto?.randomUUID?.() || now.toString(36) + "_" + Math.random().toString(36).slice(2, 10)),
      text: title.slice(0, 180), area, due, priority: field("priority").value === "high" ? "high" : "normal", done: false, created: now, updated: now };
    if (save([item, ...data])) { currentFilter = "all"; rerender(); toast("Priorité d’essai enregistrée sur cet appareil.") }
  }
  function toggle(id, checked) {
    const data = read(), task = data.find(t => t.id === id);
    if (!task) return false;
    task.done = checked; task.updated = Date.now();
    if (!save(data)) return false;
    rerender(); return true;
  }
  function click(button) {
    if (button.dataset.todoFilter) {
      if (["all", "urgent", "today", "done"].includes(button.dataset.todoFilter)) { currentFilter = button.dataset.todoFilter; rerender() }
      return true;
    }
    if (button.hasAttribute("data-todo-add")) {
      const form = document.querySelector("#todoForm");
      if (form) { form.hidden = false; button.setAttribute("aria-expanded", "true"); form.querySelector("input").focus() }
      return true;
    }
    if (button.hasAttribute("data-todo-cancel")) {
      const form = document.querySelector("#todoForm"), opener = document.querySelector("[data-todo-add]");
      if (form) { form.reset(); form.hidden = true }
      if (opener) { opener.setAttribute("aria-expanded", "false"); opener.focus() }
      return true;
    }
    if (button.dataset.todoDelete) {
      const task = read().find(t => t.id === button.dataset.todoDelete);
      if (task && window.confirm('Supprimer la priorité « ' + task.text + ' » ?')) {
        if (save(read().filter(t => t.id !== task.id))) { rerender(); toast("Priorité d’essai supprimée.") }
      }
      return true;
    }
    return false;
  }
  document.addEventListener("change", e => {
    if (!e.target.matches("[data-todo-check]")) return;
    if (!toggle(e.target.dataset.todoCheck, e.target.checked)) e.target.checked = !e.target.checked;
  });
  document.addEventListener("submit", e => {
    if (e.target.id !== "todoForm") return;
    e.preventDefault(); add(e.target);
  });
  return { summary, render, click, count: () => counts().all };
}
