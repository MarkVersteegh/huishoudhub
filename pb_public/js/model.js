import { people } from "./config.js?v=20260520-filter";
import { computeBucket, computeDue, computeLate, dateToDay, repeatLabel } from "./dates.js?v=20260520-filter";

// Kleine escape-helper omdat taakgegevens als HTML-string worden gerenderd.
export function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// `done_by` is nu een array, maar lezen blijft tolerant voor oude comma-strings.
export function parseDoneBy(value) {
  if (Array.isArray(value)) {
    return value.map(function(part) { return String(part).trim(); }).filter(Boolean);
  }
  return String(value || "").split(",").map(function(part) {
    return part.trim();
  }).filter(Boolean);
}

export function defaultDoneBy(task) {
  return (task.persons || []).slice();
}

export function formatDoneBy(value) {
  const initials = parseDoneBy(value);
  if (!initials.length) return "";
  return initials.map(function(initial) {
    return people[initial] ? people[initial].name : initial;
  }).join(" + ");
}

export function normalize(record) {
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
    done_by: parseDoneBy(record.done_by),
    subtasks: subtasks,
    bucket: bucket,
    day: dateToDay(record.date),
    due: computeDue(record.date, record.note),
    late: bucket === "overdue" ? computeLate(record.date) : "",
  };
}

// Compacte metadataregel onder de titel van een taak.
export function taskMeta(task) {
  return [task.due, task.clock, task.repeat].filter(Boolean).join(" · ");
}

export function taskPersonNames(task) {
  if (!task.persons.length) return "Geen eigenaar";
  return task.persons.map(function(p) {
    const person = people[p];
    return person ? person.name : p;
  }).join(" + ");
}

export function taskPersonAvatars(task) {
  const persons = task.persons.length ? task.persons : [""];
  return '<span class="avatar-stack">' + persons.map(function(p) {
    const person = people[p] || { name: "Geen eigenaar", avatarClass: "" };
    const label = p || "?";
    return '<span class="avatar ' + person.avatarClass + '" title="' + esc(person.name) + '">' + esc(label) + "</span>";
  }).join("") + "</span>";
}

export function markTaskDone(task, doneBy) {
  task.done = true;
  task.done_at = new Date().toISOString();
  task.done_by = parseDoneBy(doneBy && doneBy.length ? doneBy : defaultDoneBy(task));
  return { done_at: task.done_at, done_by: task.done_by };
}

// Heropenen wist zowel tijdstip als afronders, zodat de taak weer echt open is.
export function reopenTask(task) {
  task.done = false;
  task.done_at = "";
  task.done_by = [];
  return { done_at: "", done_by: [] };
}

// Rood (door ander afgerond) is leidend boven oranje (te laat afgerond).
export function completionClass(task) {
  if (!task.done) return "";
  const owners = task.persons || [];
  const completers = parseDoneBy(task.done_by);
  if (completers.length && completers.some(function(person) { return owners.indexOf(person) === -1; })) {
    return "done-other";
  }

  const doneDate = task.done_at ? new Date(task.done_at).toLocaleDateString("en-CA") : "";
  if (doneDate && task.date && doneDate > task.date) return "done-late";
  return "";
}

// Audit-events bewaren een stabiele snapshot van de taak op het actiemoment.
export function taskSnapshot(task) {
  if (!task) return {};
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    persons: (task.persons || []).slice(),
    time: task.time || "",
    clock: task.clock || "",
    note: task.note || "",
    series_id: task.series_id || "",
    done_at: task.done_at || "",
    done_by: parseDoneBy(task.done_by),
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
  };
}
