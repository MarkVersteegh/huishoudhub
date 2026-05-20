import { people } from "./config.js?v=20260520-filter";
import { formatDateLabel, getWeekDates, weekRange } from "./dates.js?v=20260520-filter";
import { completionClass, esc, taskMeta, taskPersonAvatars, taskPersonNames } from "./model.js?v=20260520-filter";

// Statusfilters en persoonsfilters zijn onafhankelijk en worden hier gecombineerd.
export function visibleTasks(state) {
  return state.tasks.filter(function(task) {
    const matchesStatus =
      state.activeStatusFilters.size === 0 ||
      (state.activeStatusFilters.has("now") && task.bucket === "now") ||
      (state.activeStatusFilters.has("overdue") && task.bucket === "overdue") ||
      (state.activeStatusFilters.has("today") && ["overdue", "now", "today"].includes(task.bucket));
    const matchesPerson = state.activePersonFilters.size === 0 || task.persons.some(function(p) { return state.activePersonFilters.has(p); }) || (task.persons.length === 0);
    return matchesStatus && matchesPerson;
  });
}

export function matchesSelectedPeople(state, task) {
  return state.activePersonFilters.size === 0 || task.persons.some(function(p) { return state.activePersonFilters.has(p); }) || (task.persons.length === 0);
}

export function countStatusForSelectedPeople(state, filter) {
  return state.tasks.filter(function(task) {
    if (task.done || !matchesSelectedPeople(state, task)) return false;
    if (filter === "overdue") return task.bucket === "overdue";
    if (filter === "now") return task.bucket === "now";
    return ["overdue", "now", "today"].includes(task.bucket);
  }).length;
}

function taskCard(state, task) {
  const statusClass = task.bucket === "overdue" ? "overdue" : task.bucket === "now" ? "now" : (task.bucket === "soon" || task.bucket === "future") ? "soon" : "today";
  const doneClass = completionClass(task);
  const latePill = task.bucket === "overdue" ? '<span class="pill alert">' + task.late + "</span>" : "";
  const nowPill = task.bucket === "now" ? '<span class="pill now">moet nu</span>' : "";
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(function(s) { return !!s.done_at; }).length;
  const isExpanded = state.expandedTasks.has(task.id);
  const subtaskToggle = subtasks.length
    ? '<button class="subtask-toggle" type="button" data-task-id="' + task.id + '" aria-expanded="' + isExpanded + '" aria-label="Subtaken ' + (isExpanded ? "inklappen" : "uitklappen") + '">' + completedSubtasks + "/" + subtasks.length + " stappen</button>"
    : "";
  const subtaskPanel = subtasks.length && isExpanded
    ? '<div class="subtasks" data-task-id="' + task.id + '">' + subtasks.map(function(s, i) {
        const done = !!s.done_at;
        return '<div class="subtask ' + (done ? "done" : "") + '" data-subtask-idx="' + i + '"><span class="subtask-dot">' + (done ? "✓" : "") + "</span><span>" + esc(s.title) + "</span></div>";
      }).join("") + "</div>"
    : "";
  return '<article class="task ' + statusClass + " " + (task.done ? "done" : "") + " " + doneClass + " " + (subtasks.length ? "has-subtasks" : "") + " " + (isExpanded ? "expanded" : "") + '" data-id="' + task.id + '">'
    + taskPersonAvatars(task)
    + '<div class="task-main">'
    + '<span class="task-name">' + esc(task.title) + "</span>"
    + '<div class="task-meta">' + esc(taskPersonNames(task)) + " · " + taskMeta(task) + "</div>"
    + '<div class="task-status">'
    + latePill + nowPill
    + (task.time ? '<span class="pill time">' + esc(task.time) + "</span>" : "")
    + (task.clock ? '<span class="pill time">' + esc(task.clock) + "</span>" : "")
    + '<span class="pill">' + esc(task.repeat) + "</span>"
    + subtaskToggle
    + "</div></div>"
    + '<div class="task-actions"><button class="check" type="button" aria-label="' + (task.done ? "Taak opnieuw openen" : "Taak afvinken") + '">' + (task.done ? "✓" : "") + "</button></div>"
    + subtaskPanel
    + "</article>";
}

// Compacte kaarten worden gebruikt in week/lijst, waar veel meer taken zichtbaar zijn.
function compactTaskCard(task, options) {
  const opts = options || {};
  const showEdit = opts.showEdit !== false;
  const statusClass = task.bucket === "overdue" ? "overdue" : task.bucket === "now" ? "now" : (task.bucket === "soon" || task.bucket === "future") ? "soon" : "today";
  const doneClass = completionClass(task);
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(function(s) { return !!s.done_at; }).length;
  const subtaskText = subtasks.length ? '<span class="mini-pill neutral">' + completedSubtasks + "/" + subtasks.length + "</span>" : "";
  const dateText = String(task.date || "").slice(8, 10) + "-" + String(task.date || "").slice(5, 7);
  return '<article class="compact-task ' + statusClass + " " + (task.done ? "done" : "") + " " + doneClass + '" data-id="' + task.id + '">'
    + '<span class="compact-date">' + esc(dateText) + "</span>"
    + taskPersonAvatars(task)
    + '<div class="compact-main">'
    + '<span class="compact-name">' + esc(task.title) + "</span>"
    + '<div class="compact-meta">' + esc(taskPersonNames(task)) + " · " + (task.day || "vandaag") + " · " + taskMeta(task) + "</div>"
    + "</div>"
    + '<div class="compact-status">'
    + subtaskText
    + '<button class="check compact-check" type="button" aria-label="' + (task.done ? "Taak opnieuw openen" : "Taak afvinken") + '">' + (task.done ? "✓" : "") + "</button>"
    + (showEdit ? '<button class="edit-task" type="button" data-edit-task="' + task.id + '">Bewerk</button>' : "")
    + "</div></article>";
}

function renderBucket(state, bucket, targetId, labelId) {
  const list = visibleTasks(state).filter(function(t) { return t.bucket === bucket && !t.done; });
  const target = document.getElementById(targetId);
  const title = document.getElementById(labelId).closest(".section-title");
  const hideEmptyFilteredSection = state.activeStatusFilters.size > 0 || state.activePersonFilters.size > 0;
  title.style.display = hideEmptyFilteredSection && !list.length ? "none" : "";
  target.style.display = hideEmptyFilteredSection && !list.length ? "none" : "";
  document.getElementById(labelId).textContent = "";
  target.innerHTML = list.length ? list.map(function(t) { return taskCard(state, t); }).join("") : '<div class="empty">Geen taken in deze groep</div>';
}

function renderDone(state) {
  const list = visibleTasks(state).filter(function(t) { return t.done; }).sort(function(a, b) {
    return String(b.done_at || "").localeCompare(String(a.done_at || ""));
  });
  const target = document.getElementById("doneTasks");
  const title = document.getElementById("doneLabel").closest(".section-title");
  title.style.display = "";
  target.style.display = "";
  document.getElementById("doneLabel").textContent = "";
  target.innerHTML = list.length ? list.map(function(t) { return taskCard(state, t); }).join("") : '<div class="empty">Nog niets afgevinkt</div>';
}

function personFilteredTasks(state) {
  return state.tasks.filter(function(t) {
    return state.activePersonFilters.size === 0 || t.persons.some(function(p) { return state.activePersonFilters.has(p); }) || t.persons.length === 0;
  });
}

function listSearchText(task) {
  const subtasks = (task.subtasks || []).map(function(s) { return s.title || ""; }).join(" ");
  return [
    task.title,
    task.note,
    task.date,
    task.day,
    task.time,
    task.clock,
    task.repeat,
    taskPersonNames(task),
    (task.persons || []).join(" "),
    subtasks,
  ].filter(Boolean).join(" ").toLowerCase();
}

function listFilteredTasks(state) {
  const query = String(state.listTextFilter || "").trim().toLowerCase();
  const source = personFilteredTasks(state);
  if (!query) return source;
  return source.filter(function(task) {
    return listSearchText(task).indexOf(query) !== -1;
  });
}

function renderCompactList(targetId, labelId, list, emptyText, options) {
  document.getElementById(labelId).textContent = list.length + " taken";
  document.getElementById(targetId).innerHTML = list.length ? list.map(function(t) { return compactTaskCard(t, options); }).join("") : '<div class="empty">' + emptyText + "</div>";
}

function renderWeekView(state) {
  const source = personFilteredTasks(state).filter(function(t) { return !t.done; });
  getWeekDates().forEach(function(g) {
    document.querySelector('[data-day-title="' + g.name + '"]').textContent = formatDateLabel(g.date);
    renderCompactList(g.targetId, g.labelId, source.filter(function(t) { return t.date === g.date; }), "Geen taken op deze dag", { showEdit: false });
  });
  const range = weekRange();
  const doneThisWeek = personFilteredTasks(state).filter(function(t) {
    return t.done && t.date >= range.start && t.date <= range.end;
  });
  renderCompactList("weekDoneTasks", "weekDoneLabel", doneThisWeek, "Nog niets afgerond deze week", { showEdit: false });
}

// Lijst groepeert alle geladen taken in operationele buckets.
function renderListView(state) {
  const source = listFilteredTasks(state);
  renderCompactList("listOpenTasks", "listOpenLabel", source.filter(function(t) { return !t.done && ["overdue", "now", "today"].includes(t.bucket); }), "Geen openstaande taken");
  renderCompactList("listFutureTasks", "listFutureLabel", source.filter(function(t) { return !t.done && ["soon", "future"].includes(t.bucket); }), "Geen toekomstige taken");
  renderCompactList("listDoneTasks", "listDoneLabel", source.filter(function(t) { return t.done; }), "Nog niets afgerond");
}

function renderPeopleSummary(state) {
  document.getElementById("peopleSummary").innerHTML = Object.keys(people).map(function(initials) {
    const person = people[initials];
    const open = state.tasks.filter(function(t) { return t.persons.indexOf(initials) !== -1 && !t.done; }).length;
    const late = state.tasks.filter(function(t) { return t.persons.indexOf(initials) !== -1 && t.bucket === "overdue" && !t.done; }).length;
    return '<button class="person" type="button" data-person="' + initials + '">'
      + '<span class="avatar ' + person.avatarClass + '">' + initials + "</span>"
      + "<span><strong>" + person.name + "</strong><span>" + open + " open · " + late + " te laat</span></span>"
      + "</button>";
  }).join("");
}

function updateFilterUi(state) {
  const main = document.querySelector(".main");
  main.classList.toggle("has-status-filter", state.activeStatusFilters.size > 0);
  main.classList.toggle("has-person-filter", state.activePersonFilters.size > 0);
  document.querySelectorAll(".filter").forEach(function(btn) {
    const f = btn.dataset.personFilter;
    btn.classList.toggle("active", f === "all" ? state.activePersonFilters.size === 0 : state.activePersonFilters.has(f));
  });
  document.querySelectorAll(".metric").forEach(function(btn) {
    const f = btn.dataset.filter;
    btn.classList.toggle("active", f === "today" ? state.activeStatusFilters.size === 0 : state.activeStatusFilters.has(f));
  });
  document.querySelectorAll(".person").forEach(function(btn) {
    btn.classList.toggle("active", state.activePersonFilters.has(btn.dataset.person));
  });
}

// Eén view tegelijk zichtbaar houden; de CSS gebruikt deze classes voor contextuele UI.
function updateViewUi(state) {
  const labels = { today: "Vandaag", week: "Deze week", list: "Lijst", form: state.editingTaskId ? "Taak bewerken" : "Nieuwe taak" };
  const main = document.querySelector(".main");
  main.classList.toggle("form-mode", state.activeView === "form");
  main.classList.toggle("today-mode", state.activeView === "today");
  main.classList.toggle("list-mode", state.activeView === "list");
  document.querySelector("h1").textContent = labels[state.activeView] || state.activeView;
  document.querySelectorAll(".view").forEach(function(v) { v.classList.toggle("active", v.id === state.activeView + "View"); });
  document.querySelectorAll("[data-view-button]").forEach(function(btn) { btn.classList.toggle("active", btn.dataset.viewButton === state.activeView); });
}

// Publieke render-entrypoint: telt bovenin en tekent daarna alleen de actieve view.
export function render(state) {
  document.getElementById("nowCount").textContent = countStatusForSelectedPeople(state, "now");
  document.getElementById("overdueCount").textContent = countStatusForSelectedPeople(state, "overdue");
  document.getElementById("todayCount").textContent = countStatusForSelectedPeople(state, "today");

  updateViewUi(state);
  updateFilterUi(state);

  if (state.activeView === "today") {
    renderBucket(state, "now", "nowTasks", "nowLabel");
    renderBucket(state, "overdue", "overdueTasks", "overdueLabel");
    renderBucket(state, "today", "todayTasks", "todayLabel");
    renderDone(state);
    renderPeopleSummary(state);
  } else if (state.activeView === "week") {
    renderWeekView(state);
  } else if (state.activeView === "list") {
    renderListView(state);
  }
}
