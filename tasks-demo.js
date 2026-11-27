/* Priorites V2, demo locale uniquement.
   Le code famille / choix Papa-Maman n'est pas une authentification.
   Ne jamais saisir de donnees reelles sensibles ou CABS ici. */
export function demoTasksModule(ctx) {
  const { me, esc, rerender, toast } = ctx;
  const storageKey = () => "cf.prototype.todos.v1." + (me() === "Maman" ? "Maman" : "Papa");
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  };
  const categories = () => [
    { id: "famille", title: "Famille", icon: "⌂", css: "family" },
    ...(me() === "Maman" ? [] : [{ id: "pro", title: "Pro", icon: "▣", css: "work" }]),
    { id: "general", title: "Général", icon: "✧", css: "general" }
  ];
  let currentFilter = "open";

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey()) || "[]");
      if (!Array.isArray(v)) return [];
      return v.filter(t => t && typeof t.id === "string" && typeof t.text === "string").slice(0, 500)
        .map(t => ({ ...t, area: t.area === "perso" ? "general" : (t.area || "famille") }))
        .filter(t => categories().some(c => c.id === t.area));
    } catch (_) { return [] }
  }

  function save(data) {
    try { localStorage.setItem(storageKey(), JSON.stringify(data)); return true }
    catch (_) { toast("Stockage local indisponible : modification non enregistrée"); return false }
  }

  const when = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "Sans échéance";
    const d = new Date(date + "T12:00:00");
    return new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" }).format(d);
  };

  function ordered() {
    return read().sort((a,b) =>
      Number(a.done) - Number(b.done) ||
      Number(b.priority === "high") - Number(a.priority === "high") ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") ||
      (a.created || 0) - (b.created || 0)
    );
  }

  function counts() {
    const active = ordered().filter(t => !t.done);
    return {
      all: active.length,
      urgent: active.filter(t => t.priority === "high").length,
      done: ordered().filter(t => t.done).length,
      byCategory: Object.fromEntries(categories().map(c => [c.id, active.filter(t => t.area === c.id).length]))
    };
  }

  function summary() {
    const c = counts();
    return '<button class="sk-priority-link sk-card" data-tab="taches" aria-label="Ouvrir les priorités : ' + c.all + ' tâches en attente">' +
      '<span class="sk-eyebrow">CENTRE D’ORGANISATION</span>' +
      '<span class="sk-priority-header"><strong>✎ Mes priorités</strong>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18 19 5M9 5h10v10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '<span class="sk-priority-desc">' + c.all + ' tâche' + (c.all !== 1 ? 's' : '') + ' en attente · ' + c.urgent + ' urgente' + (c.urgent !== 1 ? 's' : '') + '</span>' +
      '<span class="sk-counts">' + categories().map(cat =>
      '<span class="sk-count ' + cat.css + '"><strong>' + c.byCategory[cat.id] + '</strong><span>' + cat.title + '</span></span>').join("") + '</span>' +
      '</button>';
  }

  function row(t) {
    return '<div class="sk-task-row' + (t.done ? ' done' : '') + '">' +
      '<label class="sk-task-copy" style="display:flex;gap:10px;align-items:start;cursor:pointer">' +
      '<input type="checkbox" data-todo-check="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + ' aria-label="Terminer la priorité ' + esc(t.text) + '">' +
      '<span style="flex:1"><strong>' + esc(t.text) + '</strong><small>' +
      (t.priority === "high" ? '<span class="sk-urgent">Urgent</span> · ' : '') + esc(when(t.due)) + '</small></span></label>' +
      '<button class="sk-delete" type="button" data-todo-delete="' + esc(t.id) + '" aria-label="Supprimer la tâche ' + esc(t.text) + '">×</button>' +
      '</div>';
  }

  function render(main) {
    const all = ordered();
    const c = counts();
    const selected = all.filter(t => {
      if (currentFilter === "done") return !!t.done;
      if (t.done) return false;
      if (currentFilter === "urgent") return t.priority === "high";
      if (currentFilter === "today") return !!t.due && t.due <= today();
      return true;
    });
    const choices = categories();
    main.innerHTML = '<section class="sk-priorities-page">' +
      '<div class="sk-eyebrow">MON ORGANISATION</div><h2 class="sk-page-title">Mes priorités ✎</h2>' +
      '<p class="sk-subtitle">Un endroit pour agir, sans se disperser.</p>' +
      '<p class="sk-summary-line"><strong>' + c.all + ' tâches</strong> à traiter · ' + c.urgent + ' urgente' + (c.urgent !== 1 ? 's' : '') + '</p>' +
      '<div class="sk-priority-filters" role="group" aria-label="Filtrer les priorités">' +
      [['open','Toutes'],['urgent','Urgentes'],['today',"Aujourd'hui"],['done','Terminées']].map(([id,title]) =>
      '<button data-todo-filter="' + id + '" aria-pressed="' + (currentFilter === id) + '">' + title + '</button>').join("") +
      '</div><div class="sk-groups">' +
      choices.map(cat => {
        const list = selected.filter(t => t.area === cat.id);
        return '<section class="sk-group sk-card ' + cat.css + '" aria-label="Priorités ' + cat.title + '">' +
          '<div class="sk-group-header"><strong>' + cat.icon + ' ' + cat.title + '</strong><span class="sk-group-count">' + list.length + '</span></div>' +
          (list.length ? list.map(row).join("") : '<div class="sk-group-empty">Rien à signaler ici.</div>') +
          '</section>';
      }).join("") + '</div>' +
      '<button type="button" class="sk-add-task sk-card" data-todo-add aria-expanded="false">＋ Nouvelle priorité</button>' +
      '<form id="todoForm" class="sk-task-form" hidden>' +
      '<label for="todoTitle">Quelle priorité ?<input id="todoTitle" name="text" required maxlength="180" autocomplete="off" placeholder="Ex. préparer les affaires du week-end"></label>' +
      '<div class="sk-form-grid"><label>Thème<select name="area">' + choices.map(cat =>
      '<option value="' + cat.id + '">' + cat.title + '</option>').join("") + '</select></label>' +
      '<label>Importance<select name="priority"><option value="normal">Normale</option><option value="high">Urgente</option></select></label>' +
      '<label>Échéance<input name="due" type="date"></label></div>' +
      '<div class="sk-task-actions"><button class="primary" type="submit">Enregistrer</button>' +
      '<button class="secondary" type="button" data-todo-cancel>Annuler</button></div></form>' +
      '<p class="sk-preview">Prototype local uniquement. Les tâches ne sont pas synchronisées ni protégées par un compte. N’y saisis pas de données sensibles, notamment CABS.</p>' +
      '</section>';
  }

  function add(form) {
    const title = form.elements.namedItem("text").value.trim();
    if (!title) return;
    const available = categories().map(c => c.id);
    const area = form.elements.namedItem("area").value;
    if (!available.includes(area)) { toast("Catégorie indisponible"); return }
    const data = ordered();
    const item = {
      id: "todo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,9),
      text: title.slice(0,180), area,
      priority: form.elements.namedItem("priority").value === "high" ? "high" : "normal",
      due: form.elements.namedItem("due").value || "",
      done:false, created:Date.now(), updated:Date.now()
    };
    if (save([item,...data].slice(0,500))) {
      currentFilter = "open";
      rerender(); toast("Priorité d’essai ajoutée localement");
    }
  }

  function toggle(id, checked) {
    const data = read(), t = data.find(x => x.id === id);
    if (!t) return;
    t.done = checked; t.updated = Date.now();
    if (save(data)) rerender();
  }

  function click(button) {
    if (button.dataset.todoFilter) {
      currentFilter = button.dataset.todoFilter;
      rerender(); return true;
    }
    if (button.hasAttribute("data-todo-add")) {
      const form = document.querySelector("#todoForm");
      if (!form) return true;
      form.hidden = false;
      button.setAttribute("aria-expanded","true");
      form.querySelector("input").focus();
      return true;
    }
    if (button.hasAttribute("data-todo-cancel")) {
      const form = document.querySelector("#todoForm");
      if (form) form.hidden = true;
      const btn = document.querySelector("[data-todo-add]");
      if (btn) btn.setAttribute("aria-expanded","false");
      return true;
    }
    if (button.dataset.todoDelete) {
      if (!button.dataset.confirmDelete) {
        button.dataset.confirmDelete = "1";
        button.textContent = "Confirmer";
        return true;
      }
      if (save(read().filter(t => t.id !== button.dataset.todoDelete))) {
        rerender(); toast("Priorité d’essai supprimée");
      }
      return true;
    }
    return false;
  }

  document.addEventListener("change", e => {
    if (!e.target.matches("[data-todo-check]")) return;
    toggle(e.target.dataset.todoCheck, e.target.checked);
  });
  document.addEventListener("submit", e => {
    if (e.target.id !== "todoForm") return;
    e.preventDefault(); add(e.target);
  });

  return { summary, render, click, count: () => counts().all };
}
