import { POCKETBASE_URL, people } from "./js/config.js";
import { addMonths, dutchDays, dutchMonths, formatDateLabel, todayStr } from "./js/dates.js";
import {
  defaultDoneBy,
  esc,
  formatDoneBy,
  markTaskDone,
  normalize,
  parseDoneBy,
  reopenTask,
} from "./js/model.js";
import {
  createSeriesRecord,
  deleteTaskRecord,
  fetchAllTasks,
  fetchTasksPage,
  patchSeriesRecord,
  patchTaskRecord,
  saveTaskEvent,
  saveTaskRecord,
} from "./js/api.js";
import { buildTaskEvent } from "./js/audit.js";
import { render as renderView } from "./js/views.js";

// Centrale UI-state; PocketBase blijft de bron van waarheid voor taakdata.
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
let pendingConfirmResolve = null;

function currentState() {
  return {
    tasks: tasks,
    activeStatusFilters: activeStatusFilters,
    activePersonFilters: activePersonFilters,
    activeView: activeView,
    editingTaskId: editingTaskId,
    expandedTasks: expandedTasks,
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

async function loadTasks() {
  let loadFailed = false;
  try {
    const data = await fetchAllTasks();
    tasks = data.items.map(normalize);
    taskCurrentPage = data.totalPages;
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

// Fallback voor de lijstweergave als er later meer dan de initiele pagina geladen moet worden.
async function loadMoreTasks() {
  if (taskLoadingMore || taskCurrentPage >= taskTotalPages) return;
  taskLoadingMore = true;
  try {
    const data = await fetchTasksPage(taskCurrentPage + 1);
    tasks = tasks.concat(data.items.map(normalize));
    taskCurrentPage++;
  } catch (err) {
    showError("Meer taken laden mislukt — controleer de verbinding.");
  } finally {
    taskLoadingMore = false;
  }
  render();
}

// Realtime-herstel mag geen foutmelding tonen; de gebruiker heeft al een werkende view.
async function reloadTasksSilent() {
  try {
    const data = await fetchAllTasks();
    tasks = data.items.map(normalize);
    taskCurrentPage = data.totalPages;
    taskTotalPages  = data.totalPages;
    render();
  } catch (err) {
    // stil falen bij herverbinding
  }
}

// PocketBase realtime houdt meerdere schermen aan de muur/telefoon synchroon.
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

async function logTaskEvent(task, eventType, details, actors) {
  if (!task || !eventType) return;
  try {
    await saveTaskEvent(buildTaskEvent(task, eventType, details, actors));
  } catch (err) {
    // Auditlogging mag de primaire taakactie niet blokkeren.
  }
}

// Optimistische UI-updates gebeuren vóór deze patch; fouten tonen alleen een verbindingsmelding.
async function patchTask(id, data, eventType, details, actors) {
  try {
    const record = await patchTaskRecord(id, data);
    if (eventType) await logTaskEvent(normalize(record), eventType, details, actors);
  } catch (err) {
    showError("Wijziging niet opgeslagen — controleer de verbinding.");
  }
}

async function patchSeries(id, data) {
  try {
    await patchSeriesRecord(id, data);
  } catch (err) {
    showError("Serie niet bijgewerkt — controleer de verbinding.");
  }
}

async function deleteTask(id, task) {
  try {
    await deleteTaskRecord(id);
    tasks = tasks.filter(function(t) { return t.id !== id; });
    render();
    await logTaskEvent(task, "deleted", {}, []);
  } catch (err) {
    showError("Verwijderen mislukt — controleer de verbinding.");
  }
}

async function saveTask(data) {
  try {
    const record = await saveTaskRecord(data);
    await logTaskEvent(normalize(record), "created", {}, []);
    return record;
  } catch (err) {
    showError("Taak niet opgeslagen — controleer de verbinding.");
    return null;
  }
}

async function createSeries(data) {
  try {
    return await createSeriesRecord(data);
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

// --- Persoonvoorkeur ---

function getMyPerson() {
  return localStorage.getItem("huishoudhub-person");
}

function getThemePreference() {
  return localStorage.getItem("huishoudhub-theme");
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

function selectedDetailDoneBy(task) {
  const selected = Array.from(document.querySelectorAll('input[name="detailDoneBy"]:checked')).map(function(input) {
    return input.value;
  });
  return selected.length ? selected : defaultDoneBy(task);
}

function render() {
  renderView(currentState());
}

// --- Taakdetail ---

function openTaskDetail(task) {
  // Detailmodal is de enige plek waar iemand anders/multiple personen als afronders gekozen worden.
  let defaultCompleters = parseDoneBy(task.done_by);
  if (!defaultCompleters.length) defaultCompleters = defaultDoneBy(task);
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

  const doneByNames = formatDoneBy(task.done_by);
  const doneBanner = task.done
    ? '<div class="task-detail-done-banner">Afgerond' + (doneByNames ? " door " + esc(doneByNames) : "") + (task.done_at ? " om " + new Date(task.done_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "") + "</div>"
    : "";

  const completerPicker = !task.done
    ? '<div class="task-detail-completer">'
      + '<div class="task-detail-completer-label">Afgerond door</div>'
      + '<div class="task-detail-completer-options">'
      + Object.keys(people).map(function(initials) {
          const person = people[initials];
          return '<label class="task-detail-completer-option">'
            + '<input type="checkbox" name="detailDoneBy" value="' + initials + '" ' + (defaultCompleters.indexOf(initials) !== -1 ? "checked" : "") + ">"
            + '<span class="task-detail-completer-choice">'
            + '<span class="avatar ' + person.avatarClass + '">' + initials + "</span>"
            + '<span>' + person.name + "</span>"
            + "</span>"
            + "</label>";
        }).join("")
      + "</div></div>"
    : "";

  document.getElementById("taskDetailContent").innerHTML =
    '<div class="task-detail-title">' + esc(task.title) + "</div>"
    + '<div class="task-detail-persons">' + persons + "</div>"
    + '<div class="task-detail-row"><span class="task-detail-lbl">Datum</span><span>' + formatDateLabel(task.date) + "</span></div>"
    + (task.time ? '<div class="task-detail-row"><span class="task-detail-lbl">Tijdstip</span><span>' + esc(task.time) + (task.clock ? " · " + esc(task.clock) : "") + "</span></div>" : "")
    + (task.repeat ? '<div class="task-detail-row"><span class="task-detail-lbl">Herhaling</span><span>' + esc(task.repeat) + "</span></div>" : "")
    + (task.note ? '<div class="task-detail-note">' + esc(task.note) + "</div>" : "")
    + completerPicker
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
    const wasDone = task.done;
    const actors = wasDone ? [] : selectedDetailDoneBy(task);
    const patch = wasDone ? reopenTask(task) : markTaskDone(task, actors);
    render();
    patchTask(task.id, patch, wasDone ? "reopened" : "completed", {}, actors);
    closeTaskDetail();
  };

  const subtaskPanel = document.getElementById("detailSubtasks");
  if (subtaskPanel) {
    subtaskPanel.addEventListener("click", function(e) {
      const row = e.target.closest(".task-detail-subtask[data-subtask-idx]");
      if (!row) return;
      const idx = parseInt(row.dataset.subtaskIdx, 10);
      if (!task.subtasks[idx]) return;
      const wasDone = task.done;
      const nowDone = !task.subtasks[idx].done_at;
      task.subtasks[idx].done_at = nowDone ? new Date().toISOString() : null;
      const allDone = task.subtasks.every(function(s) { return !!s.done_at; });
      const patch = { subtasks: task.subtasks };
      let eventType = "subtask_updated";
      let actors = [];
      if (allDone && !task.done) {
        actors = selectedDetailDoneBy(task);
        Object.assign(patch, markTaskDone(task, actors));
        eventType = "completed";
      } else if (!allDone && wasDone) {
        Object.assign(patch, reopenTask(task));
        eventType = "reopened";
      }
      render();
      patchTask(task.id, patch, eventType, {
        subtask_index: idx,
        subtask_title: task.subtasks[idx].title,
        subtask_done: nowDone,
      }, actors);
      openTaskDetail(task);
    });
  }
}

function closeTaskDetail() {
  document.getElementById("taskDetailOverlay").classList.remove("open");
}

// Herbruikbare app-modal voor destructieve of brede acties, zonder native browserdialog.
function confirmInApp(options) {
  const overlay = document.getElementById("confirmOverlay");
  const title = document.getElementById("confirmTitle");
  const message = document.getElementById("confirmMessage");
  const list = document.getElementById("confirmList");
  const primary = document.getElementById("confirmPrimaryButton");
  title.textContent = options.title || "Bevestigen";
  message.textContent = options.message || "";
  list.innerHTML = (options.items || []).map(function(item) {
    return "<li>" + esc(item) + "</li>";
  }).join("");
  list.style.display = options.items && options.items.length ? "" : "none";
  primary.textContent = options.confirmText || "OK";
  primary.classList.toggle("danger-button", !!options.danger);
  primary.classList.toggle("primary-button", !options.danger);
  overlay.classList.add("open");
  primary.focus();
  return new Promise(function(resolve) {
    pendingConfirmResolve = resolve;
  });
}

function closeConfirm(result) {
  document.getElementById("confirmOverlay").classList.remove("open");
  if (pendingConfirmResolve) pendingConfirmResolve(!!result);
  pendingConfirmResolve = null;
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

// Hetzelfde formulier wordt gebruikt voor toevoegen en bewerken.
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
    form.querySelectorAll('[name="persons"]').forEach(function(input) {
      input.checked = task.persons.indexOf(input.value) !== -1;
    });
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

  const selectedPersons = formData.getAll("persons").map(function(value) { return String(value); });
  const date = String(formData.get("date"));
  const payload = {
    persons: selectedPersons,
    title: title,
    date: date,
    time: String(formData.get("time") || ""),
    clock: String(formData.get("clock") || ""),
    note: String(formData.get("note") || "").trim(),
    done_at: "",
    done_by: [],
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

      const top5 = allAffected.slice(0, 5).map(function(t) { return formatDateLabel(t.date) + " - " + t.title; });
      if (allAffected.length > 5) top5.push("+ " + (allAffected.length - 5) + " meer...");
      const confirmed = await confirmInApp({
        title: "Taken bijwerken",
        message: allAffected.length + " taken worden bijgewerkt. Wil je doorgaan?",
        items: top5,
        confirmText: "Bijwerken",
      });
      if (!confirmed) return;

      // Huidige taak: volledige payload (inclusief eventuele datumwijziging)
      if (i !== -1) tasks[i] = normalize(Object.assign({}, tasks[i], payload));
      patchTask(id, payload, "updated", { scope: "future", series_id: existingTask.series_id });

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
        patchTask(t.id, futurePayload, "updated", { scope: "future", series_id: existingTask.series_id, source_task_id: existingTask.id });
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
      patchTask(id, payload, "updated", { scope: "instance" });
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
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("huishoudhub-theme", next);
  applyTheme(next);
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function appFullscreenActive() {
  return document.documentElement.dataset.appFullscreen === "true";
}

function setAppFullscreen(active) {
  if (active) {
    document.documentElement.dataset.appFullscreen = "true";
  } else {
    delete document.documentElement.dataset.appFullscreen;
  }
}

function updateFullscreenButton() {
  const btn = document.querySelector("[data-fullscreen-toggle]");
  if (!btn) return;
  const active = !!fullscreenElement() || appFullscreenActive();
  btn.textContent = active ? "×" : "⛶";
  btn.setAttribute("aria-label", active ? "Volledig scherm sluiten" : "Volledig scherm");
  btn.setAttribute("title", active ? "Volledig scherm sluiten" : "Volledig scherm");
}

async function toggleFullscreen() {
  const root = document.documentElement;

  if (appFullscreenActive()) {
    setAppFullscreen(false);
    updateFullscreenButton();
    return;
  }

  if (fullscreenElement()) {
    try {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    } catch (err) {}
    updateFullscreenButton();
    return;
  }

  try {
    const enter = root.requestFullscreen || root.webkitRequestFullscreen;
    if (enter) await enter.call(root);
  } catch (err) {}

  if (!fullscreenElement()) {
    setAppFullscreen(!appFullscreenActive());
  }
  updateFullscreenButton();
}

function scheduledTheme() {
  const h = new Date().getHours();
  return (h >= 7 && h < 20) ? "light" : "dark";
}

// Zonder expliciete voorkeur volgt het thema dag/nacht automatisch.
function scheduleNextThemeSwitch() {
  const now = new Date();
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
  const transitions = [7 * 3600000, 20 * 3600000];
  let next = transitions.find(function(t) { return t > nowMs; });
  if (next === undefined) next = transitions[0] + 86400000; // morgen 7:00
  setTimeout(function() {
    if (!getThemePreference()) applyTheme(scheduledTheme());
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
document.querySelector("[data-fullscreen-toggle]").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
document.querySelector("[data-cancel-form]").addEventListener("click", function() {
  resetTaskForm();
  setView(previousView);
});

document.getElementById("deleteTaskButton").addEventListener("click", async function() {
  const id = editingTaskId;
  if (!id) return;
  const task = tasks.find(function(t) { return t.id === id; });
  const label = task ? "“" + task.title + "”" : "deze taak";
  const confirmed = await confirmInApp({
    title: "Taak verwijderen",
    message: "Wil je " + label + " verwijderen? Dit kan niet ongedaan worden gemaakt.",
    confirmText: "Verwijderen",
    danger: true,
  });
  if (!confirmed) return;
  resetTaskForm();
  setView(previousView);
  deleteTask(id, task);
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
document.getElementById("confirmCancelButton").addEventListener("click", function() { closeConfirm(false); });
document.getElementById("confirmCloseButton").addEventListener("click", function() { closeConfirm(false); });
document.getElementById("confirmPrimaryButton").addEventListener("click", function() { closeConfirm(true); });
document.getElementById("confirmOverlay").addEventListener("click", function(e) {
  if (e.target === e.currentTarget) closeConfirm(false);
});
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" && document.getElementById("confirmOverlay").classList.contains("open")) closeConfirm(false);
});

// --- Event delegation voor dynamische taakinteracties ---
// Eenmalig geregistreerd; werkt voor alle renders zonder opnieuw koppelen.

document.querySelector(".main").addEventListener("click", function(e) {
  // Afvinken
  const checkBtn = e.target.closest(".check");
  if (checkBtn) {
    const card = checkBtn.closest(".task, .compact-task");
    if (!card) return;
    const id = card.dataset.id;
    const task = tasks.find(function(t) { return t.id === id; });
    if (!task) return;
    const wasDone = task.done;
    const actors = wasDone ? [] : defaultDoneBy(task);
    const patch = wasDone ? reopenTask(task) : markTaskDone(task, actors);
    render();
    patchTask(id, patch, wasDone ? "reopened" : "completed", {}, actors);
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
    const wasDone = task.done;
    const nowDone = !task.subtasks[idx].done_at;
    task.subtasks[idx].done_at = nowDone ? new Date().toISOString() : null;
    const allDone = task.subtasks.every(function(s) { return !!s.done_at; });
    const patch = { subtasks: task.subtasks };
    let eventType = "subtask_updated";
    let actors = [];
    if (allDone && !task.done) {
      actors = defaultDoneBy(task);
      Object.assign(patch, markTaskDone(task, actors));
      eventType = "completed";
    } else if (!allDone && wasDone) {
      Object.assign(patch, reopenTask(task));
      eventType = "reopened";
    }
    render();
    patchTask(taskId, patch, eventType, {
      subtask_index: idx,
      subtask_title: task.subtasks[idx].title,
      subtask_done: nowDone,
    }, actors);
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

applyTheme(getThemePreference() || scheduledTheme());
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
