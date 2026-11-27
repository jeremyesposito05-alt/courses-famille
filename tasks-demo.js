/* Tâches V1, prototype local.
   Pas de stockage Firestore ni de données confidentielles avant l'authentification individuelle.
   Chaque profil sur chaque navigateur dispose de ses propres tâches d'essai. */
export function demoTasksModule(ctx) {
  const { me, esc, rerender, toast } = ctx;
  const storageKey = () => "cf.prototype.todos.v1." + (me() === "Maman" ? "Maman" : "Papa");
  let currentFilter = "open";

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey()) || "[]");
      return Array.isArray(value) ? value.filter(t => t && typeof t.id === "string" && typeof t.text === "string").slice(0, 500) : [];
    } catch (_) { return [] }
  }

  function save(tasks) {
    try { localStorage.setItem(storageKey(), JSON.stringify(tasks)); return true }
    catch (_) { toast("Stockage local indisponible : modification non enregistrée"); return false }
  }

  const when = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "";
    return new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "numeric", month: "short" });
  };

  function ordered() {
    return read().sort((a, b) => Number(a.done) - Number(b.done) ||
      Number(b.priority === "high") - Number(a.priority === "high") ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") ||
      (a.created || 0) - (b.created || 0));
  }

  function row(t, compact) {
    const meta = [t.area === "perso" ? "Personnel" : "Famille", t.priority === "high" ? "Priorité haute" : "", when(t.due)].filter(Boolean).join(" · ");
    return '<div class="todo-item' + (t.done ? ' is-done' : '') + '">' +
      '<label class="todo-control"><input type="checkbox" data-todo-check="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '><span class="todo-text">' + esc(t.text) + '</span></label>' +
      '<div class="todo-meta">' + esc(meta) + '</div>' +
      (compact ? '' : '<button class="todo-remove" data-todo-delete="' + esc(t.id) + '" aria-label="Supprimer cette tâche">×</button>') +
      '</div>';
  }

  function summary() {
    const all = ordered(), waiting = all.filter(t => !t.done), top = waiting.slice(0, 3);
    return '<section class="hub-tasks" aria-label="Tâches à faire">' +
      '<div class="hub-section-head"><div><span class="hub-kicker">MES PRIORITÉS</span><h2>Tâches à faire</h2></div>' +
      '<button class="hub-text-link" data-tab="taches">Tout voir <span aria-hidden="true">→</span></button></div>' +
      '<div class="hub-task-wrap"><p class="hub-task-count">' + waiting.length + ' tâche' + (waiting.length > 1 ? 's' : '') + ' en attente</p>' +
      (top.length ? top.map(t => row(t, true)).join("") : '<p class="hub-empty">Aucune tâche d’essai en attente. Ajoute ta première tâche.</p>') +
      '<button class="hub-task-add" data-tab="taches">+ Ajouter une tâche</button>' +
      '<p class="hub-preview-note">Version d’essai locale : les tâches ne sont pas synchronisées entre téléphones.</p></div></section>';
  }

  function render(main) {
    const all = ordered(), shown = all.filter(t => currentFilter === "all" || (currentFilter === "open" ? !t.done : t.done));
    const pending = all.filter(t => !t.done).length;
    main.innerHTML = '<section class="todo-page">' +
      '<div class="hub-hero mini"><span class="hub-kicker">ORGANISATION</span><h2>Mes tâches</h2>' +
      '<p>' + pending + ' tâche' + (pending > 1 ? 's' : '') + ' en attente. Concentre-toi sur l’essentiel.</p></div>' +
      '<div class="todo-warning" role="note">Prototype local. Aucune synchronisation Firebase pour le moment. Ne saisis pas d’informations confidentielles.</div>' +
      '<form id="todoForm" class="todo-form">' +
      '<label for="todoTitle">Nouvelle tâche</label><div class="todo-add-line"><input id="todoTitle" name="text" required maxlength="180" placeholder="Ex. réserver le contrôle technique" autocomplete="off">' +
      '<button type="submit" aria-label="Ajouter la tâche">Ajouter</button></div>' +
      '<div class="todo-fields"><label>Catégorie<select name="area"><option value="famille">Famille</option><option value="perso">Personnel</option></select></label>' +
      '<label>Priorité<select name="priority"><option value="normal">Normale</option><option value="high">Haute</option></select></label>' +
      '<label>Échéance<input name="due" type="date"></label></div></form>' +
      '<div class="todo-filter-row" role="group" aria-label="Filtrer les tâches">' +
      [['open', 'À faire'], ['all', 'Toutes'], ['done', 'Terminées']].map(([id, title]) =>
      '<button data-todo-filter="' + id + '" aria-pressed="' + (currentFilter === id) + '">' + title + '</button>').join("") +
      '</div><div class="todo-list">' +
      (shown.length ? shown.map(t => row(t, false)).join("") : '<p class="hub-empty">Aucune tâche dans cette sélection.</p>') +
      '</div></section>';
  }

  function add(form) {
    const title = form.elements.namedItem("text").value.trim();
    if (!title) return;
    const tasks = read();
    const item = {
      id: "todo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9),
      text: title.slice(0, 180), area: form.elements.namedItem("area").value === "perso" ? "perso" : "famille",
      priority: form.elements.namedItem("priority").value === "high" ? "high" : "normal",
      due: form.elements.namedItem("due").value || "", done: false, created: Date.now(), updated: Date.now()
    };
    if (save([item, ...tasks].slice(0, 500))) { currentFilter = "open"; rerender(); toast("Tâche d’essai ajoutée sur cet appareil") }
  }

  function toggle(id, value) {
    const tasks = read(), task = tasks.find(t => t.id === id);
    if (!task) return;
    task.done = value; task.updated = Date.now();
    if (save(tasks)) rerender();
  }

  function click(button) {
    if (button.dataset.todoFilter) {
      currentFilter = button.dataset.todoFilter; rerender(); return true;
    }
    if (button.dataset.todoDelete) {
      if (!button.dataset.confirmDelete) { button.dataset.confirmDelete = "1"; button.textContent = "Confirmer"; return true }
      if (save(read().filter(t => t.id !== button.dataset.todoDelete))) { rerender(); toast("Tâche d’essai supprimée") }
      return true;
    }
    return false;
  }

  document.addEventListener("change", event => {
    const field = event.target;
    if (!field.matches('[data-todo-check]')) return;
    toggle(field.dataset.todoCheck, field.checked);
  });
  document.addEventListener("submit", event => {
    if (event.target.id !== "todoForm") return;
    event.preventDefault();
    add(event.target);
  });
  return { render, summary, click, count: () => read().filter(t => !t.done).length };
}
