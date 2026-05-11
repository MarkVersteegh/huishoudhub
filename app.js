// PocketBase base URL — leeg als de app geserveerd wordt via PocketBase zelf (pb_public/)
const POCKETBASE_URL = "";

const people = {
  EV: { name: "Emmy", avatarClass: "ev" },
  JV: { name: "Joris", avatarClass: "jv" },
  JD: { name: "Juliette", avatarClass: "jd" },
  MV: { name: "Mark", avatarClass: "mv" },
};

let tasks = [];
const activeStatusFilters = new Set();
const activePersonFilters = new Set();
let activeView = "today";
let previousView = "today";
let editingTaskId = null;
const expandedTasks = new Set();

// --- Datumhulpfuncties ---

const dutchDays = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const dutchMonths = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekEndStr() {
  const d = new Date();
  // Einde van de week = aankomende zondag
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().slice(0, 10);
}

function dateToDay(dateStr) {
  return dutchDays[new Date(dateStr + "T00:00:00").getDay()];
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const name = dutchDays[d.getDay()];
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + d.getDate() + " " + dutchMonths[d.getMonth()];
}

function computeBucket(task) {
  const today = todayStr();
  if (task.date < today) return "overdue";
  if (task.date > today) return task.date <= weekEndStr() ? "soon" : "future";
  const hour = new Date().getHours();
  if (task.time === "ochtend" && hour < 12) return "now";
  if (task.time === "middag" && hour >= 12 && hour < 18) return "now";
  if (task.time === "avond" && hour >= 18) return "now";
  return "today";
}

function computeLate(date) {
  const diff = Math.round((new Date(todayStr() + "T00:00:00") - new Date(date + "T00:00:00")) / 86400000);
  if (diff <= 0) return "";
  return diff === 1 ? "1 dag te laat" : diff + " dagen te laat";
}

function computeDue(date, note) {
  if (note) return note;
  if (date === todayStr()) return "vandaag";
  return dateToDay(date);
}

function normalize(record) {
  const subtasks = Array.isArray(record.subtasks) ? record.subtasks : [];
  const bucket = computeBucket(record);
  return {
    id: record.id,
    person: record.person,
    title: record.title,
    date: record.date,
    time: record.time || "",
    clock: record.clock || "",
    note: record.note || "",
    repeat: record.repeat || "ad-hoc",
    done: record.done || false,
    subtasks: subtasks,
    bucket: bucket,
    day: dateToDay(record.date),
    due: computeDue(record.date, record.note),
    late: bucket === "overdue" ? computeLate(record.date) : "",
  };
}

// --- PocketBase API ---
// Vereist: tasks-collectie in PocketBase admin ingesteld op volledig open rechten (geen auth).

async function loadTasks() {
  try {
    const res = await fetch(POCKETBASE_URL + "/api/collections/tasks/records?perPage=500&sort=date");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    tasks = data.items.map(normalize);
  } catch (err) {
    console.error("Taken laden mislukt:", err);
  }
  const indicator = document.getElementById("loadingIndicator");
  if (indicator) indicator.style.display = "none";
  render();
}

async function reloadTasksSilent() {
  try {
    const res = await fetch(POCKETBASE_URL + "/api/collections/tasks/records?perPage=500&sort=date");
    if (!res.ok) return;
    const data = await res.json();
    tasks = data.items.map(normalize);
    render();
  } catch (err) {
    // stil falen bij herverbinding
  }
}

function subscribeRealtime() {
  const src = new EventSource(POCKETBASE_URL + "/api/realtime");

  src.addEventListener("PB_CONNECT", function(e) {
    const clientId = JSON.parse(e.data).clientId;
    // Herlaad taken bij (her)verbinding om gemiste updates op te halen
    reloadTasksSilent();
    fetch(POCKETBASE_URL + "/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: clientId, subscriptions: ["tasks"] }),
    });
  });

  src.addEventListener("tasks", function(e) {
    const payload = JSON.parse(e.data);
    const action = payload.action;
    const record = payload.record;
    if (action === "create") {
      if (!tasks.find(function(t) { return t.id === record.id; })) {
        tasks.push(normalize(record));
      }
    } else if (action === "update") {
      const i = tasks.findIndex(function(t) { return t.id === record.id; });
      if (i !== -1) tasks[i] = normalize(record);
    } else if (action === "delete") {
      tasks = tasks.filter(function(t) { return t.id !== record.id; });
    }
    render();
  });

  src.onerror = function() {
    src.close();
    setTimeout(subscribeRealtime, 3000);
  };
}

async function patchTask(id, data) {
  try {
    await fetch(POCKETBASE_URL + "/api/collections/tasks/records/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("Taak bijwerken mislukt:", err);
  }
}

async function saveTask(data) {
  try {
    await fetch(POCKETBASE_URL + "/api/collections/tasks/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("Taak opslaan mislukt:", err);
  }
}

// --- Persoonvoorkeur ---

function getMyPerson() {
  return localStorage.getItem("huishoudhub-person");
}

function applyMyPerson(initials) {
  localStorage.setItem("huishoudhub-person", initials);
  activePersonFilters.clear();
  activePersonFilters.add(initials);
  const avatar = document.getElementById("myPersonAvatar");
  if (avatar && people[initials]) {
    avatar.textContent = initials;
    avatar.className = "avatar " + people[initials].avatarClass;
  }
}

function showPersonPicker() {
  document.getElementById("personPickerOverlay").style.display = "flex";
}

function hidePersonPicker() {
  document.getElementById("personPickerOverlay").style.display = "none";
}

// --- Filterhulpfuncties ---

function visibleTasks() {
  return tasks.filter(function(task) {
    const matchesStatus =
      activeStatusFilters.size === 0 ||
      (activeStatusFilters.has("now") && task.bucket === "now") ||
      (activeStatusFilters.has("overdue") && task.bucket === "overdue") ||
      (activeStatusFilters.has("today") && ["overdue", "now", "today"].includes(task.bucket));
    const matchesPerson = activePersonFilters.size === 0 || activePersonFilters.has(task.person);
    return matchesStatus && matchesPerson;
  });
}

function matchesSelectedPeople(task) {
  return activePersonFilters.size === 0 || activePersonFilters.has(task.person);
}

function countStatusForSelectedPeople(filter) {
  return tasks.filter(function(task) {
    if (task.done || !matchesSelectedPeople(task)) return false;
    if (filter === "overdue") return task.bucket === "overdue";
    if (filter === "now") return task.bucket === "now";
    return ["overdue", "now", "today"].includes(task.bucket);
  }).length;
}

function taskMeta(task) {
  return [task.due, task.clock, task.repeat].filter(Boolean).join(" · ");
}

// --- Taakkaarten ---

function taskCard(task) {
  const person = people[task.person];
  const statusClass = task.bucket === "overdue" ? "overdue" : task.bucket === "now" ? "now" : (task.bucket === "soon" || task.bucket === "future") ? "soon" : "today";
  const latePill = task.bucket === "overdue" ? '<span class="pill alert">' + task.late + "</span>" : "";
  const nowPill = task.bucket === "now" ? '<span class="pill now">moet nu</span>' : "";
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(function(s) { return s.done; }).length;
  const isExpanded = expandedTasks.has(task.id);
  const subtaskToggle = subtasks.length
    ? '<button class="subtask-toggle" type="button" data-task-id="' + task.id + '" aria-expanded="' + isExpanded + '" aria-label="Subtaken ' + (isExpanded ? "inklappen" : "uitklappen") + '">' + completedSubtasks + "/" + subtasks.length + " stappen</button>"
    : "";
  const subtaskPanel = subtasks.length && isExpanded
    ? '<div class="subtasks">' + subtasks.map(function(s) {
        return '<div class="subtask ' + (s.done ? "done" : "") + '"><span class="subtask-dot">' + (s.done ? "✓" : "") + "</span><span>" + s.title + "</span></div>";
      }).join("") + "</div>"
    : "";
  return '<article class="task ' + statusClass + " " + (task.done ? "done" : "") + " " + (subtasks.length ? "has-subtasks" : "") + " " + (isExpanded ? "expanded" : "") + '" data-id="' + task.id + '">'
    + '<span class="avatar ' + person.avatarClass + '" title="' + person.name + '">' + task.person + "</span>"
    + '<div class="task-main">'
    + '<span class="task-name">' + task.title + "</span>"
    + '<div class="task-meta">' + person.name + " · " + taskMeta(task) + "</div>"
    + '<div class="task-status">'
    + latePill + nowPill
    + (task.time ? '<span class="pill time">' + task.time + "</span>" : "")
    + (task.clock ? '<span class="pill time">' + task.clock + "</span>" : "")
    + '<span class="pill">' + task.repeat + "</span>"
    + subtaskToggle
    + "</div></div>"
    + '<div class="task-actions"><button class="check" type="button" aria-label="' + (task.done ? "Taak opnieuw openen" : "Taak afvinken") + '">' + (task.done ? "✓" : "") + "</button></div>"
    + subtaskPanel
    + "</article>";
}

function compactTaskCard(task, options) {
  const opts = options || {};
  const showEdit = opts.showEdit !== false;
  const person = people[task.person];
  const statusClass = task.bucket === "overdue" ? "overdue" : task.bucket === "now" ? "now" : (task.bucket === "soon" || task.bucket === "future") ? "soon" : "today";
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(function(s) { return s.done; }).length;
  const subtaskText = subtasks.length ? '<span class="mini-pill neutral">' + completedSubtasks + "/" + subtasks.length + "</span>" : "";
  const stateText = task.done ? "klaar" : task.bucket === "overdue" ? "te laat" : task.bucket === "now" ? "nu" : task.bucket === "future" ? "later" : task.bucket === "soon" ? "deze week" : "open";
  const stateClass = task.done ? "done" : task.bucket === "overdue" ? "danger" : task.bucket === "now" ? "now" : (task.bucket === "future" || task.bucket === "soon") ? "soon" : "open";
  return '<article class="compact-task ' + statusClass + " " + (task.done ? "done" : "") + '">'
    + '<span class="avatar ' + person.avatarClass + '" title="' + person.name + '">' + task.person + "</span>"
    + '<div class="compact-main">'
    + '<span class="compact-name">' + task.title + "</span>"
    + '<div class="compact-meta">' + person.name + " · " + (task.day || "vandaag") + " · " + taskMeta(task) + "</div>"
    + "</div>"
    + '<div class="compact-status">'
    + subtaskText
    + '<span class="mini-pill ' + stateClass + '">' + stateText + "</span>"
    + (showEdit ? '<button class="edit-task" type="button" data-edit-task="' + task.id + '">Bewerk</button>' : "")
    + "</div></article>";
}

// --- Render ---

function renderBucket(bucket, targetId, labelId) {
  const list = visibleTasks().filter(function(t) { return t.bucket === bucket && !t.done; });
  document.getElementById(labelId).textContent = "";
  document.getElementById(targetId).innerHTML = list.length ? list.map(taskCard).join("") : '<div class="empty">Geen taken in deze groep</div>';
}

function renderDone() {
  const list = visibleTasks().filter(function(t) { return t.done; });
  document.getElementById("doneLabel").textContent = "";
  document.getElementById("doneTasks").innerHTML = list.length ? list.map(taskCard).join("") : '<div class="empty">Nog niets afgevinkt</div>';
}

function personFilteredTasks() {
  return tasks.filter(function(t) { return activePersonFilters.size === 0 || activePersonFilters.has(t.person); });
}

function renderCompactList(targetId, labelId, list, emptyText, options) {
  document.getElementById(labelId).textContent = list.length + " taken";
  document.getElementById(targetId).innerHTML = list.length ? list.map(function(t) { return compactTaskCard(t, options); }).join("") : '<div class="empty">' + emptyText + "</div>";
}

function getWeekDates() {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return [
    { name: "maandag", targetId: "weekMondayTasks", labelId: "weekMondayLabel" },
    { name: "dinsdag", targetId: "weekTuesdayTasks", labelId: "weekTuesdayLabel" },
    { name: "woensdag", targetId: "weekWednesdayTasks", labelId: "weekWednesdayLabel" },
    { name: "donderdag", targetId: "weekThursdayTasks", labelId: "weekThursdayLabel" },
    { name: "vrijdag", targetId: "weekFridayTasks", labelId: "weekFridayLabel" },
  ].map(function(g, i) {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    return { name: g.name, targetId: g.targetId, labelId: g.labelId, date: d.toISOString().slice(0, 10) };
  });
}

function renderWeekView() {
  const source = personFilteredTasks().filter(function(t) { return !t.done; });
  getWeekDates().forEach(function(g) {
    document.querySelector('[data-day-title="' + g.name + '"]').textContent = formatDateLabel(g.date);
    renderCompactList(g.targetId, g.labelId, source.filter(function(t) { return t.date === g.date; }), "Geen taken op deze dag", { showEdit: false });
  });
}

function renderListView() {
  const source = personFilteredTasks();
  renderCompactList("listOpenTasks", "listOpenLabel", source.filter(function(t) { return !t.done && ["overdue", "now", "today"].includes(t.bucket); }), "Geen openstaande taken");
  renderCompactList("listFutureTasks", "listFutureLabel", source.filter(function(t) { return !t.done && ["soon", "future"].includes(t.bucket); }), "Geen toekomstige taken");
  renderCompactList("listDoneTasks", "listDoneLabel", source.filter(function(t) { return t.done; }), "Nog niets afgerond");
}

function renderPeopleSummary() {
  document.getElementById("peopleSummary").innerHTML = Object.keys(people).map(function(initials) {
    const person = people[initials];
    const open = tasks.filter(function(t) { return t.person === initials && !t.done; }).length;
    const late = tasks.filter(function(t) { return t.person === initials && t.bucket === "overdue" && !t.done; }).length;
    return '<button class="person" type="button" data-person="' + initials + '">'
      + '<span class="avatar ' + person.avatarClass + '">' + initials + "</span>"
      + "<span><strong>" + person.name + "</strong><span>" + open + " open · " + late + " te laat</span></span>"
      + "</button>";
  }).join("");
}

function updateFilterUi() {
  const main = document.querySelector(".main");
  main.classList.toggle("has-status-filter", activeStatusFilters.size > 0);
  main.classList.toggle("has-person-filter", activePersonFilters.size > 0);
  document.querySelectorAll(".filter").forEach(function(btn) {
    const f = btn.dataset.personFilter;
    btn.classList.toggle("active", f === "all" ? activePersonFilters.size === 0 : activePersonFilters.has(f));
  });
  document.querySelectorAll(".metric").forEach(function(btn) {
    const f = btn.dataset.filter;
    btn.classList.toggle("active", f === "today" ? activeStatusFilters.size === 0 : activeStatusFilters.has(f));
  });
  document.querySelectorAll(".person").forEach(function(btn) {
    btn.classList.toggle("active", activePersonFilters.has(btn.dataset.person));
  });
}

function updateViewUi() {
  const labels = { today: "Vandaag", week: "Deze week", list: "Lijst", form: editingTaskId ? "Taak bewerken" : "Nieuwe taak" };
  const main = document.querySelector(".main");
  main.classList.toggle("form-mode", activeView === "form");
  main.classList.toggle("today-mode", activeView === "today");
  main.classList.toggle("list-mode", activeView === "list");
  document.querySelector("h1").textContent = labels[activeView] || activeView;
  document.querySelectorAll(".view").forEach(function(v) { v.classList.toggle("active", v.id === activeView + "View"); });
  document.querySelectorAll("[data-view-button]").forEach(function(btn) { btn.classList.toggle("active", btn.dataset.viewButton === activeView); });
}

function render() {
  document.getElementById("nowCount").textContent = countStatusForSelectedPeople("now");
  document.getElementById("overdueCount").textContent = countStatusForSelectedPeople("overdue");
  document.getElementById("todayCount").textContent = countStatusForSelectedPeople("today");
  renderBucket("now", "nowTasks", "nowLabel");
  renderBucket("overdue", "overdueTasks", "overdueLabel");
  renderBucket("today", "todayTasks", "todayLabel");
  renderDone();
  renderPeopleSummary();
  renderWeekView();
  renderListView();
  updateViewUi();
  updateFilterUi();

  // Event listeners die na elke render opnieuw worden gekoppeld (dynamische DOM)
  document.querySelectorAll(".check").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const id = btn.closest(".task").dataset.id;
      const task = tasks.find(function(t) { return t.id === id; });
      if (!task) return;
      task.done = !task.done;
      render();
      patchTask(id, { done: task.done });
    });
  });

  document.querySelectorAll(".subtask-toggle").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const id = btn.dataset.taskId;
      if (expandedTasks.has(id)) expandedTasks.delete(id);
      else expandedTasks.add(id);
      render();
    });
  });

  document.querySelectorAll(".person").forEach(function(btn) {
    btn.addEventListener("click", function() { setPersonFilter(btn.dataset.person); });
  });

  document.querySelectorAll("[data-edit-task]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const task = tasks.find(function(t) { return t.id === btn.dataset.editTask; });
      if (task) openTaskForm(task);
    });
  });
}

// --- Filters & view ---

function setStatusFilter(filter) {
  if (filter === "today") activeStatusFilters.clear();
  else if (activeStatusFilters.has(filter)) activeStatusFilters.delete(filter);
  else activeStatusFilters.add(filter);
  render();
}

function setPersonFilter(filter) {
  if (filter === "all") activePersonFilters.clear();
  else if (activePersonFilters.has(filter)) activePersonFilters.delete(filter);
  else activePersonFilters.add(filter);
  render();
}

function setView(view) {
  if (view !== "form") previousView = view;
  activeView = view;
  render();
}

// --- Formulier ---

function clearSubtaskEditor() {
  document.getElementById("subtaskEditor").innerHTML = "";
}

function addSubtaskRow(title) {
  const t = title || "";
  const row = document.createElement("div");
  row.className = "subtask-row";
  row.draggable = true;
  row.innerHTML = '<button class="drag-handle" type="button" aria-label="Subtaak verslepen">≡</button>'
    + '<input type="text" value="' + t.replace(/"/g, "&quot;") + '" placeholder="Stap">'
    + '<button class="icon-button" type="button" data-move-subtask="up" aria-label="Omhoog">↑</button>'
    + '<button class="icon-button" type="button" data-remove-subtask aria-label="Verwijderen">×</button>';
  document.getElementById("subtaskEditor").appendChild(row);
}

function resetTaskForm() {
  editingTaskId = null;
  const form = document.getElementById("taskForm");
  form.reset();
  form.elements.date.value = todayStr();
  clearSubtaskEditor();
  document.getElementById("formSubmitButton").textContent = "Taak toevoegen";
}

function openTaskForm(task) {
  previousView = activeView === "form" ? previousView : activeView;
  resetTaskForm();
  if (task) {
    editingTaskId = task.id;
    const form = document.getElementById("taskForm");
    form.elements.title.value = task.title;
    form.elements.date.value = task.date || todayStr();
    form.elements.clock.value = task.clock || "";
    form.elements.note.value = task.note || "";
    form.querySelector('[name="person"][value="' + task.person + '"]').checked = true;
    form.querySelector('[name="time"][value="' + (task.time || "") + '"]').checked = true;
    form.querySelector('[name="repeat"][value="' + task.repeat + '"]').checked = true;
    (task.subtasks || []).forEach(function(s) { addSubtaskRow(s.title); });
    document.getElementById("formSubmitButton").textContent = "Wijzigingen opslaan";
  }
  activeView = "form";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addTaskFromForm(form) {
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const subtasks = Array.from(document.querySelectorAll("#subtaskEditor input"))
    .map(function(input) { return input.value.trim(); })
    .filter(Boolean)
    .map(function(line) { return { title: line, done: false }; });

  const payload = {
    person: String(formData.get("person")),
    title: title,
    date: String(formData.get("date")),
    time: String(formData.get("time") || ""),
    clock: String(formData.get("clock") || ""),
    note: String(formData.get("note") || "").trim(),
    repeat: String(formData.get("repeat")),
    done: false,
    subtasks: subtasks,
  };

  if (editingTaskId) {
    const id = editingTaskId;
    const i = tasks.findIndex(function(t) { return t.id === id; });
    if (i !== -1) tasks[i] = normalize(Object.assign({}, tasks[i], payload));
    render();
    patchTask(id, payload);
  } else {
    saveTask(payload);
    // SSE voegt de nieuwe taak toe aan de lijst
  }

  resetTaskForm();
  setView("list");
}

// --- Thema ---

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.querySelector("[data-theme-toggle]");
  btn.textContent = theme === "dark" ? "☀" : "☾";
  btn.setAttribute("aria-label", theme === "dark" ? "Licht thema" : "Donker thema");
  localStorage.setItem("huishoudhub-theme", theme);
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

// --- Statische event listeners (eenmalig gekoppeld bij opstarten) ---

document.querySelectorAll(".filter").forEach(function(btn) {
  btn.addEventListener("click", function() { setPersonFilter(btn.dataset.personFilter); });
});
document.querySelectorAll("button.metric").forEach(function(btn) {
  btn.addEventListener("click", function() { setStatusFilter(btn.dataset.filter); });
});
document.querySelectorAll("[data-view-button]").forEach(function(btn) {
  btn.addEventListener("click", function() { setView(btn.dataset.viewButton); });
});

document.querySelector("[data-open-form]").addEventListener("click", function() { openTaskForm(); });
document.querySelector("[data-theme-toggle]").addEventListener("click", toggleTheme);
document.querySelector("[data-cancel-form]").addEventListener("click", function() {
  resetTaskForm();
  setView(previousView);
});
document.getElementById("taskForm").addEventListener("submit", function(e) {
  e.preventDefault();
  addTaskFromForm(e.currentTarget);
});
document.querySelector("[data-add-subtask]").addEventListener("click", function() { addSubtaskRow(); });

document.getElementById("subtaskEditor").addEventListener("click", function(e) {
  if (!(e.target instanceof HTMLElement)) return;
  const row = e.target.closest(".subtask-row");
  if (!row) return;
  if (e.target.matches("[data-remove-subtask]")) row.remove();
  if (e.target.matches("[data-move-subtask='up']") && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
});
document.getElementById("subtaskEditor").addEventListener("dragstart", function(e) {
  const r = e.target.closest(".subtask-row");
  if (r) r.classList.add("dragging");
});
document.getElementById("subtaskEditor").addEventListener("dragend", function(e) {
  const r = e.target.closest(".subtask-row");
  if (r) r.classList.remove("dragging");
});
document.getElementById("subtaskEditor").addEventListener("dragover", function(e) {
  e.preventDefault();
  const editor = document.getElementById("subtaskEditor");
  const dragging = editor.querySelector(".dragging");
  if (!dragging) return;
  const after = Array.from(editor.querySelectorAll(".subtask-row:not(.dragging)")).find(function(r) {
    const box = r.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2;
  });
  if (after) editor.insertBefore(dragging, after);
  else editor.appendChild(dragging);
});

// Persoon-picker
document.querySelectorAll("[data-pick-person]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    applyMyPerson(btn.dataset.pickPerson);
    hidePersonPicker();
    render();
  });
});
document.getElementById("showPersonPicker").addEventListener("click", showPersonPicker);

// --- Initialisatie ---

function updateDateDisplay() {
  const today = new Date();
  const name = dutchDays[today.getDay()];
  document.querySelector(".date").textContent = name.charAt(0).toUpperCase() + name.slice(1) + " " + today.getDate() + " " + dutchMonths[today.getMonth()];
}

applyTheme(localStorage.getItem("huishoudhub-theme") || "light");
updateDateDisplay();

const myPerson = getMyPerson();
if (myPerson) {
  applyMyPerson(myPerson);
} else {
  showPersonPicker();
}

loadTasks().then(function() { subscribeRealtime(); });
