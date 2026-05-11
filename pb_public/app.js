// PocketBase base URL — leeg als de app geserveerd wordt via PocketBase zelf (pb_public/)
const POCKETBASE_URL = "";

const people = {
  EV: { name: "Emmy", avatarClass: "ev" },
  JV: { name: "Joris", avatarClass: "jv" },
  JD: { name: "Juliette", avatarClass: "jd" },
  MV: { name: "Mark", avatarClass: "mv" },
};

let tasks = [];
let taskCurrentPage = 1;
let taskTotalPages  = 1;
let taskLoadingMore = false;
const activeStatusFilters = new Set();
const activePersonFilters = new Set();
let activeView = "today";
let previousView = "today";
let editingTaskId = null;
const expandedTasks = new Set();

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Datumhulpfuncties ---

const dutchDays = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const dutchMonths = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function weekEndStr() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toLocaleDateString("en-CA");
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

function repeatLabel(rule) {
  if (!rule) return "";
  switch (rule.type) {
    case "once":     return "";
    case "daily":    return rule.interval === 1 ? "dagelijks" : "om de " + rule.interval + " dagen";
    case "weekdays": return "schooldagen";
    case "weekly":   return rule.days ? "wekelijks" : "wekelijks";
    case "monthly":  return "maandelijks";
    default:         return rule.type;
  }
}

function normalize(record) {
  const subtasks = Array.isArray(record.subtasks) ? record.subtasks : [];
  const bucket = computeBucket(record);
  const persons = Array.isArray(record.persons) ? record.persons
                : (record.persons ? [record.persons] : []);
  const series = record.expand && record.expand.series_id ? record.expand.series_id : null;
  return {
    id: record.id,
    persons: persons,
    person: persons[0] || "",
    series_id: record.series_id || "",
    title: record.title,
    date: record.date,
    time: record.time || "",
    clock: record.clock || "",
    note: record.note || "",
    repeat: series ? repeatLabel(series.repeat_rule) : "",
    done: !!record.done_at,
    done_at: record.done_at || "",
    done_by: record.done_by || "",
    subtasks: subtasks,
    bucket: bucket,
    day: dateToDay(record.date),
    due: computeDue(record.date, record.note),
    late: bucket === "overdue" ? computeLate(record.date) : "",
  };
}

// --- PocketBase API ---
// Vereist: tasks-collectie in PocketBase admin ingesteld op volledig open rechten (geen auth).

function showError(msg) {
  const indicator = document.getElementById("loadingIndicator");
  if (!indicator) return;
  indicator.textContent = msg;
  indicator.style.display = "";
  indicator.style.color = "var(--danger)";
}

const TASKS_URL = "/api/collections/tasks/records?perPage=100&sort=date&expand=series_id";

async function loadTasks() {
  let loadFailed = false;
  try {
    const res = await fetch(POCKETBASE_URL + TASKS_URL + "&page=1");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    tasks = data.items.map(normalize);
    taskCurrentPage = 1;
    taskTotalPages  = data.totalPages;
  } catch (err) {
    loadFailed = true;
    showError("Kan taken niet laden — is PocketBase bereikbaar? (" + err.message + ")");
  }
  if (!loadFailed) {
    const indicator = document.getElementById("loadingIndicator");
    if (indicator) indicator.style.display = "none";
  }
  render();
}

async function loadMoreTasks() {
  if (taskLoadingMore || taskCurrentPage >= taskTotalPages) return;
  taskLoadingMore = true;
  try {
    const res = await fetch(POCKETBASE_URL + TASKS_URL + "&page=" + (taskCurrentPage + 1));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    tasks = tasks.concat(data.items.map(normalize));
    taskCurrentPage++;
  } catch (err) {
    showError("Meer taken laden mislukt — controleer de verbinding.");
  } finally {
    taskLoadingMore = false;
  }
  render();
}

async function reloadTasksSilent() {
  try {
    const res = await fetch(POCKETBASE_URL + TASKS_URL + "&page=1");
    if (!res.ok) return;
    const data = await res.json();
    tasks = data.items.map(normalize);
    taskCurrentPage = 1;
    taskTotalPages  = data.totalPages;
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
    showError("Wijziging niet opgeslagen — controleer de verbinding.");
  }
}

async function patchSeries(id, data) {
  try {
    await fetch(POCKETBASE_URL + "/api/collections/series/records/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    showError("Serie niet bijgewerkt — controleer de verbinding.");
  }
}

async function deleteTask(id) {
  try {
    await fetch(POCKETBASE_URL + "/api/collections/tasks/records/" + id, { method: "DELETE" });
    tasks = tasks.filter(function(t) { return t.id !== id; });
    render();
  } catch (err) {
    showError("Verwijderen mislukt — controleer de verbinding.");
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
    showError("Taak niet opgeslagen — controleer de verbinding.");
  }
}

async function createSeries(data) {
  try {
    const res = await fetch(POCKETBASE_URL + "/api/collections/series/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    showError("Serie niet opgeslagen — controleer de verbinding.");
    return null;
  }
}

function repeatRuleFromForm(value) {
  switch (value) {
    case "dagelijks":     return { type: "daily",   interval: 1 };
    case "om de 2 dagen": return { type: "daily",   interval: 2 };
    case "schooldagen":   return { type: "weekdays" };
    case "wekelijks":     return { type: "weekly",  interval: 1 };
    case "maandelijks":   return { type: "monthly", interval: 1 };
    default:              return null;
  }
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("en-CA");
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
    const matchesPerson = activePersonFilters.size === 0 || task.persons.some(function(p) { return activePersonFilters.has(p); }) || (task.persons.length === 0);
    return matchesStatus && matchesPerson;
  });
}

function matchesSelectedPeople(task) {
  return activePersonFilters.size === 0 || task.persons.some(function(p) { return activePersonFilters.has(p); }) || (task.persons.length === 0);
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
  const completedSubtasks = subtasks.filter(function(s) { return !!s.done_at; }).length;
  const isExpanded = expandedTasks.has(task.id);
  const subtaskToggle = subtasks.length
    ? '<button class="subtask-toggle" type="button" data-task-id="' + task.id + '" aria-expanded="' + isExpanded + '" aria-label="Subtaken ' + (isExpanded ? "inklappen" : "uitklappen") + '">' + completedSubtasks + "/" + subtasks.length + " stappen</button>"
    : "";
  const subtaskPanel = subtasks.length && isExpanded
    ? '<div class="subtasks" data-task-id="' + task.id + '">' + subtasks.map(function(s, i) {
        const done = !!s.done_at;
        return '<div class="subtask ' + (done ? "done" : "") + '" data-subtask-idx="' + i + '"><span class="subtask-dot">' + (done ? "✓" : "") + "</span><span>" + esc(s.title) + "</span></div>";
      }).join("") + "</div>"
    : "";
  return '<article class="task ' + statusClass + " " + (task.done ? "done" : "") + " " + (subtasks.length ? "has-subtasks" : "") + " " + (isExpanded ? "expanded" : "") + '" data-id="' + task.id + '">'
    + '<span class="avatar ' + person.avatarClass + '" title="' + esc(person.name) + '">' + task.person + "</span>"
    + '<div class="task-main">'
    + '<span class="task-name">' + esc(task.title) + "</span>"
    + '<div class="task-meta">' + person.name + " · " + taskMeta(task) + "</div>"
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

function compactTaskCard(task, options) {
  const opts = options || {};
  const showEdit = opts.showEdit !== false;
  const person = people[task.person];
  const statusClass = task.bucket === "overdue" ? "overdue" : task.bucket === "now" ? "now" : (task.bucket === "soon" || task.bucket === "future") ? "soon" : "today";
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(function(s) { return !!s.done_at; }).length;
  const subtaskText = subtasks.length ? '<span class="mini-pill neutral">' + completedSubtasks + "/" + subtasks.length + "</span>" : "";
  const stateText = task.done ? "klaar" : task.bucket === "overdue" ? "te laat" : task.bucket === "now" ? "nu" : task.bucket === "future" ? "later" : task.bucket === "soon" ? "deze week" : "open";
  const stateClass = task.done ? "done" : task.bucket === "overdue" ? "danger" : task.bucket === "now" ? "now" : (task.bucket === "future" || task.bucket === "soon") ? "soon" : "open";
  return '<article class="compact-task ' + statusClass + " " + (task.done ? "done" : "") + '">'
    + '<span class="avatar ' + person.avatarClass + '" title="' + esc(person.name) + '">' + task.person + "</span>"
    + '<div class="compact-main">'
    + '<span class="compact-name">' + esc(task.title) + "</span>"
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
  return tasks.filter(function(t) {
    return activePersonFilters.size === 0 || t.persons.some(function(p) { return activePersonFilters.has(p); }) || t.persons.length === 0;
  });
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
    return { name: g.name, targetId: g.targetId, labelId: g.labelId, date: d.toLocaleDateString("en-CA") };
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
    const open = tasks.filter(function(t) { return t.persons.indexOf(initials) !== -1 && !t.done; }).length;
    const late = tasks.filter(function(t) { return t.persons.indexOf(initials) !== -1 && t.bucket === "overdue" && !t.done; }).length;
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
  // Tellers zijn altijd zichtbaar in de header
  document.getElementById("nowCount").textContent = countStatusForSelectedPeople("now");
  document.getElementById("overdueCount").textContent = countStatusForSelectedPeople("overdue");
  document.getElementById("todayCount").textContent = countStatusForSelectedPeople("today");

  updateViewUi();
  updateFilterUi();

  // Bouw alleen de actieve weergave opnieuw — de andere zijn niet zichtbaar
  if (activeView === "today") {
    renderBucket("now", "nowTasks", "nowLabel");
    renderBucket("overdue", "overdueTasks", "overdueLabel");
    renderBucket("today", "todayTasks", "todayLabel");
    renderDone();
    renderPeopleSummary();
  } else if (activeView === "week") {
    renderWeekView();
  } else if (activeView === "list") {
    renderListView();
  }
}

// --- Taakdetail ---

function openTaskDetail(task) {
  const persons = task.persons.length
    ? task.persons.map(function(p) {
        const info = people[p] || { name: p, avatarClass: "" };
        return '<span class="avatar ' + info.avatarClass + '" title="' + info.name + '">' + p + "</span>";
      }).join("")
    : '<span class="avatar" title="Geen eigenaar">?</span>';

  const subtasksHtml = task.subtasks && task.subtasks.length
    ? '<div class="task-detail-subtasks" id="detailSubtasks" data-task-id="' + task.id + '">'
      + task.subtasks.map(function(s, i) {
          const done = !!s.done_at;
          return '<div class="task-detail-subtask ' + (done ? "done" : "") + '" data-subtask-idx="' + i + '">'
            + '<span class="task-detail-subtask-dot">' + (done ? "✓" : "") + "</span>"
            + "<span>" + esc(s.title) + "</span>"
            + "</div>";
        }).join("")
      + "</div>"
    : "";

  const doneBanner = task.done
    ? '<div class="task-detail-done-banner">Afgerond' + (task.done_by ? " door " + (people[task.done_by] ? people[task.done_by].name : task.done_by) : "") + (task.done_at ? " om " + new Date(task.done_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "") + "</div>"
    : "";

  document.getElementById("taskDetailContent").innerHTML =
    '<div class="task-detail-title">' + esc(task.title) + "</div>"
    + '<div class="task-detail-persons">' + persons + "</div>"
    + '<div class="task-detail-row"><span class="task-detail-lbl">Datum</span><span>' + formatDateLabel(task.date) + "</span></div>"
    + (task.time ? '<div class="task-detail-row"><span class="task-detail-lbl">Tijdstip</span><span>' + esc(task.time) + (task.clock ? " · " + esc(task.clock) : "") + "</span></div>" : "")
    + (task.repeat ? '<div class="task-detail-row"><span class="task-detail-lbl">Herhaling</span><span>' + esc(task.repeat) + "</span></div>" : "")
    + (task.note ? '<div class="task-detail-note">' + esc(task.note) + "</div>" : "")
    + subtasksHtml
    + doneBanner
    + '<div class="task-detail-actions">'
    + '<button class="secondary-button" type="button" id="detailEditBtn">Bewerken</button>'
    + '<button class="primary-button" type="button" id="detailCheckBtn">' + (task.done ? "Heropenen" : "Afvinken") + "</button>"
    + "</div>";

  const overlay = document.getElementById("taskDetailOverlay");
  overlay.classList.add("open");

  document.getElementById("taskDetailClose").onclick = closeTaskDetail;
  overlay.addEventListener("click", function handler(e) {
    if (e.target === overlay) { closeTaskDetail(); overlay.removeEventListener("click", handler); }
  });

  document.getElementById("detailEditBtn").onclick = function() {
    closeTaskDetail();
    openTaskForm(task);
  };

  document.getElementById("detailCheckBtn").onclick = function() {
    const nowDone = !task.done;
    task.done = nowDone;
    task.done_at = nowDone ? new Date().toISOString() : "";
    task.done_by = nowDone ? (getMyPerson() || "") : "";
    render();
    patchTask(task.id, { done_at: task.done_at, done_by: task.done_by });
    closeTaskDetail();
  };

  const subtaskPanel = document.getElementById("detailSubtasks");
  if (subtaskPanel) {
    subtaskPanel.addEventListener("click", function(e) {
      const row = e.target.closest(".task-detail-subtask[data-subtask-idx]");
      if (!row) return;
      const idx = parseInt(row.dataset.subtaskIdx, 10);
      if (!task.subtasks[idx]) return;
      const nowDone = !task.subtasks[idx].done_at;
      task.subtasks[idx].done_at = nowDone ? new Date().toISOString() : null;
      const allDone = task.subtasks.every(function(s) { return !!s.done_at; });
      const patch = { subtasks: task.subtasks };
      if (allDone && !task.done) {
        task.done = true;
        task.done_at = new Date().toISOString();
        task.done_by = getMyPerson() || "";
        patch.done_at = task.done_at;
        patch.done_by = task.done_by;
      }
      render();
      patchTask(task.id, patch);
      openTaskDetail(task);
    });
  }
}

function closeTaskDetail() {
  document.getElementById("taskDetailOverlay").classList.remove("open");
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
  if (activeView === "list" && view !== "list") taskLoadingMore = false;
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
  document.getElementById("deleteTaskButton").style.display = "none";
  document.getElementById("scopeField").style.display = "none";
}

function openTaskForm(task) {
  previousView = activeView === "form" ? previousView : activeView;
  resetTaskForm();
  if (task) {
    editingTaskId = task.id;
    document.getElementById("deleteTaskButton").style.display = "";
    const scopeField = document.getElementById("scopeField");
    scopeField.style.display = task.series_id ? "" : "none";
    if (task.series_id) scopeField.querySelector('[name="scope"][value="instance"]').checked = true;
    const form = document.getElementById("taskForm");
    form.elements.title.value = task.title;
    form.elements.date.value = task.date || todayStr();
    form.elements.clock.value = task.clock || "";
    form.elements.note.value = task.note || "";
    form.querySelector('[name="person"][value="' + (task.persons[0] || "") + '"]').checked = true;
    form.querySelector('[name="time"][value="' + (task.time || "") + '"]').checked = true;
    const repeatVal = task.repeat || "ad-hoc";
    const repeatEl = form.querySelector('[name="repeat"][value="' + repeatVal + '"]');
    if (repeatEl) repeatEl.checked = true;
    (task.subtasks || []).forEach(function(s) { addSubtaskRow(s.title); });
    document.getElementById("formSubmitButton").textContent = "Wijzigingen opslaan";
  }
  activeView = "form";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function addTaskFromForm(form) {
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const subtasks = Array.from(document.querySelectorAll("#subtaskEditor input"))
    .map(function(input) { return input.value.trim(); })
    .filter(Boolean)
    .map(function(line) { return { title: line, done_at: null }; });

  const selectedPerson = String(formData.get("person") || "");
  const date = String(formData.get("date"));
  const payload = {
    persons: selectedPerson ? [selectedPerson] : [],
    title: title,
    date: date,
    time: String(formData.get("time") || ""),
    clock: String(formData.get("clock") || ""),
    note: String(formData.get("note") || "").trim(),
    done_at: "",
    done_by: "",
    subtasks: subtasks,
  };

  if (editingTaskId) {
    const id = editingTaskId;
    const i = tasks.findIndex(function(t) { return t.id === id; });
    const existingTask = i !== -1 ? tasks[i] : null;
    const repeatRule = repeatRuleFromForm(String(formData.get("repeat") || ""));
    const scope = String(formData.get("scope") || "instance");

    if (existingTask && existingTask.series_id && scope === "future") {
      // Scope: deze en toekomstige taken
      const futureTasks = tasks.filter(function(t) {
        return t.series_id === existingTask.series_id && t.date > existingTask.date && !t.done;
      });
      futureTasks.sort(function(a, b) { return a.date.localeCompare(b.date); });
      const allAffected = [existingTask].concat(futureTasks);

      const top5 = allAffected.slice(0, 5).map(function(t) { return "• " + formatDateLabel(t.date) + " — " + t.title; });
      const extra = allAffected.length > 5 ? "\n+ " + (allAffected.length - 5) + " meer…" : "";
      if (!confirm(allAffected.length + " taken worden bijgewerkt:\n\n" + top5.join("\n") + extra + "\n\nDoorgaan?")) return;

      // Huidige taak: volledige payload (inclusief eventuele datumwijziging)
      if (i !== -1) tasks[i] = normalize(Object.assign({}, tasks[i], payload));
      patchTask(id, payload);

      // Toekomstige taken: titel/personen/tijdstip/opmerking bijwerken, datum laten staan, subtaken resetten
      const futurePayload = {
        persons: payload.persons,
        title: title,
        time: payload.time,
        clock: payload.clock,
        note: payload.note,
        subtasks: subtasks.map(function(s) { return { title: s.title, done_at: null }; }),
      };
      futureTasks.forEach(function(t) {
        const idx = tasks.findIndex(function(tt) { return tt.id === t.id; });
        if (idx !== -1) tasks[idx] = normalize(Object.assign({}, tasks[idx], futurePayload));
        patchTask(t.id, futurePayload);
      });

      // Serie bijwerken zodat nieuwe instanties de nieuwe instellingen krijgen
      const seriesPatch = {
        title: title,
        persons: payload.persons,
        time: payload.time,
        clock: payload.clock,
        note: payload.note,
        subtasks_template: subtasks.map(function(s) { return { title: s.title }; }),
      };
      if (repeatRule) seriesPatch.repeat_rule = repeatRule;
      patchSeries(existingTask.series_id, seriesPatch);

      render();
    } else {
      // Scope: alleen deze instantie
      if (repeatRule && existingTask && !existingTask.series_id) {
        // Ad-hoc taak wordt herhalend: maak een nieuwe serie aan
        const series = await createSeries({
          title: title,
          persons: payload.persons,
          time: payload.time,
          clock: payload.clock,
          note: payload.note,
          repeat_rule: repeatRule,
          start_date: date,
          end_date: addMonths(date, 1),
          subtasks_template: subtasks.map(function(s) { return { title: s.title }; }),
        });
        if (series) payload.series_id = series.id;
      }
      if (i !== -1) tasks[i] = normalize(Object.assign({}, tasks[i], payload));
      render();
      patchTask(id, payload);
    }
  } else {
    const repeatRule = repeatRuleFromForm(String(formData.get("repeat") || ""));
    if (repeatRule) {
      const series = await createSeries({
        title: title,
        persons: payload.persons,
        time: payload.time,
        clock: payload.clock,
        note: payload.note,
        repeat_rule: repeatRule,
        start_date: date,
        end_date: addMonths(date, 1),
        subtasks_template: subtasks.map(function(s) { return { title: s.title }; }),
      });
      if (series) payload.series_id = series.id;
    }
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
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function scheduledTheme() {
  const h = new Date().getHours();
  return (h >= 7 && h < 20) ? "light" : "dark";
}

function scheduleNextThemeSwitch() {
  const now = new Date();
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
  const transitions = [7 * 3600000, 20 * 3600000];
  let next = transitions.find(function(t) { return t > nowMs; });
  if (next === undefined) next = transitions[0] + 86400000; // morgen 7:00
  setTimeout(function() {
    applyTheme(scheduledTheme());
    scheduleNextThemeSwitch();
  }, next - nowMs);
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

document.getElementById("deleteTaskButton").addEventListener("click", function() {
  const id = editingTaskId;
  if (!id) return;
  const task = tasks.find(function(t) { return t.id === id; });
  const label = task ? "“" + task.title + "”" : "deze taak";
  if (!confirm("Wil je " + label + " verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
  resetTaskForm();
  setView(previousView);
  deleteTask(id);
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

// --- Event delegation voor dynamische taakinteracties ---
// Eenmalig geregistreerd; werkt voor alle renders zonder opnieuw koppelen.

document.querySelector(".main").addEventListener("click", function(e) {
  // Afvinken
  const checkBtn = e.target.closest(".check");
  if (checkBtn) {
    const id = checkBtn.closest(".task").dataset.id;
    const task = tasks.find(function(t) { return t.id === id; });
    if (!task) return;
    const nowDone = !task.done;
    task.done = nowDone;
    task.done_at = nowDone ? new Date().toISOString() : "";
    task.done_by = nowDone ? (getMyPerson() || "") : "";
    render();
    patchTask(id, { done_at: task.done_at, done_by: task.done_by });
    return;
  }

  // Subtaken uitklappen/inklappen
  const toggleBtn = e.target.closest(".subtask-toggle");
  if (toggleBtn) {
    const id = toggleBtn.dataset.taskId;
    if (expandedTasks.has(id)) expandedTasks.delete(id);
    else expandedTasks.add(id);
    render();
    return;
  }

  // Subtaak afvinken
  const subtaskRow = e.target.closest(".subtask[data-subtask-idx]");
  if (subtaskRow) {
    const panel = subtaskRow.closest(".subtasks");
    if (!panel) return;
    const taskId = panel.dataset.taskId;
    const idx = parseInt(subtaskRow.dataset.subtaskIdx, 10);
    const task = tasks.find(function(t) { return t.id === taskId; });
    if (!task || !task.subtasks[idx]) return;
    const nowDone = !task.subtasks[idx].done_at;
    task.subtasks[idx].done_at = nowDone ? new Date().toISOString() : null;
    const allDone = task.subtasks.every(function(s) { return !!s.done_at; });
    const patch = { subtasks: task.subtasks };
    if (allDone && !task.done) {
      task.done = true;
      task.done_at = new Date().toISOString();
      task.done_by = getMyPerson() || "";
      patch.done_at = task.done_at;
      patch.done_by = task.done_by;
    }
    render();
    patchTask(taskId, patch);
    return;
  }

  // Persoonfilter (persoonsstrip in vandaag-weergave)
  const personBtn = e.target.closest(".person[data-person]");
  if (personBtn) {
    setPersonFilter(personBtn.dataset.person);
    return;
  }

  // Bewerken
  const editBtn = e.target.closest("[data-edit-task]");
  if (editBtn) {
    const task = tasks.find(function(t) { return t.id === editBtn.dataset.editTask; });
    if (task) openTaskForm(task);
    return;
  }

  // Taakkaart aanklikken → detailweergave
  const card = e.target.closest(".task[data-id], .compact-task[data-id]");
  if (card && !e.target.closest("button") && !e.target.closest(".subtasks")) {
    const task = tasks.find(function(t) { return t.id === card.dataset.id; });
    if (task) openTaskDetail(task);
  }
});

// --- Initialisatie ---

function updateDateDisplay() {
  const today = new Date();
  const name = dutchDays[today.getDay()];
  document.querySelector(".date").textContent = name.charAt(0).toUpperCase() + name.slice(1) + " " + today.getDate() + " " + dutchMonths[today.getMonth()];
}

applyTheme(scheduledTheme());
scheduleNextThemeSwitch();
updateDateDisplay();

const myPerson = getMyPerson();
if (myPerson) {
  applyMyPerson(myPerson);
} else {
  showPersonPicker();
}

loadTasks().then(function() { subscribeRealtime(); });

new IntersectionObserver(function(entries) {
  if (entries[0].isIntersecting && activeView === "list") loadMoreTasks();
}, { rootMargin: "200px" }).observe(document.getElementById("listSentinel"));
