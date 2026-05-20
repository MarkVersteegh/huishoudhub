import assert from "node:assert/strict";
import { computeBucket } from "../pb_public/js/dates.js";
import { buildTaskEvent } from "../pb_public/js/audit.js";
import { completionClass, markTaskDone, normalize, parseDoneBy, reopenTask } from "../pb_public/js/model.js";
import { countStatusForSelectedPeople, visibleTasks } from "../pb_public/js/views.js";

// Minimale genormaliseerde taak voor pure logica-tests zonder PocketBase.
function task(overrides) {
  return normalize(Object.assign({
    id: "t1",
    persons: ["EV"],
    title: "Testtaak",
    date: "2026-05-12",
    time: "",
    clock: "",
    note: "",
    done_at: "",
    done_by: [],
    subtasks: [],
  }, overrides || {}));
}

// Renderhelpers verwachten dezelfde state-shape als app.js aan views doorgeeft.
function state(tasks, people, status) {
  return {
    tasks: tasks,
    activePersonFilters: new Set(people || []),
    activeStatusFilters: new Set(status || []),
    expandedTasks: new Set(),
    activeView: "today",
    editingTaskId: null,
  };
}

// Buckets sturen vrijwel alle Vandaag/Week/Lijst groeperingen aan.
assert.equal(computeBucket({ date: "2026-05-11", time: "" }, new Date("2026-05-12T08:00:00")), "overdue");
assert.equal(computeBucket({ date: "2026-05-12", time: "ochtend" }, new Date("2026-05-12T08:00:00")), "now");
assert.equal(computeBucket({ date: "2026-05-12", time: "ochtend" }, new Date("2026-05-12T13:00:00")), "today");
assert.equal(computeBucket({ date: "2026-05-15", time: "" }, new Date("2026-05-12T08:00:00")), "soon");
assert.equal(computeBucket({ date: "2026-05-19", time: "" }, new Date("2026-05-12T08:00:00")), "future");

assert.deepEqual(parseDoneBy(["EV", "MV"]), ["EV", "MV"]);
assert.deepEqual(parseDoneBy("EV, MV"), ["EV", "MV"]);
assert.deepEqual(parseDoneBy(""), []);

// Status- en persoonsfilters blijven onafhankelijk en ondersteunen multi-select.
const overdue = Object.assign(task({ id: "overdue", persons: ["MV"] }), { bucket: "overdue" });
const now = Object.assign(task({ id: "now", persons: ["EV"] }), { bucket: "now" });
const today = Object.assign(task({ id: "today", persons: ["JV"] }), { bucket: "today" });
const filtered = state([overdue, now, today], ["EV"], ["today"]);
assert.deepEqual(visibleTasks(filtered).map((t) => t.id), ["now"]);
assert.equal(countStatusForSelectedPeople(filtered, "today"), 1);

const multiFiltered = state([overdue, now, today], ["EV", "MV"], ["overdue", "now"]);
assert.deepEqual(visibleTasks(multiFiltered).map((t) => t.id), ["overdue", "now"]);

// Als iemand anders afrondt, blijft rood leidend boven oranje/te-laat.
const completion = task({ persons: ["EV"], done_at: "2026-05-13T08:00:00.000Z", done_by: ["MV"] });
assert.equal(completionClass(completion), "done-other");

const ownerLate = task({ persons: ["EV"], done_at: "2026-05-13T08:00:00.000Z", done_by: ["EV"] });
assert.equal(completionClass(ownerLate), "done-late");

const redLeading = task({ persons: ["EV"], done_at: "2026-05-13T08:00:00.000Z", done_by: ["MV"] });
assert.equal(completionClass(redLeading), "done-other");

// Subtaken kunnen de parent heropenen; done_at/done_by moeten dan leeg.
const subtaskParent = task({ persons: ["EV"], subtasks: [{ title: "Stap", done_at: null }] });
markTaskDone(subtaskParent, ["EV"]);
assert.equal(subtaskParent.done, true);
reopenTask(subtaskParent);
assert.equal(subtaskParent.done, false);
assert.deepEqual(subtaskParent.done_by, []);

// Auditpayloads bevatten kolommen voor rapportage plus een taak-snapshot.
const eventTask = task({ id: "event", persons: ["EV"] });
markTaskDone(eventTask, ["EV"]);
const event = buildTaskEvent(eventTask, "completed", { source: "test" }, ["EV"]);
assert.equal(event.event_type, "completed");
assert.deepEqual(event.actors, ["EV"]);
assert.equal(event.task_id, "event");
assert.deepEqual(event.task_snapshot.done_by, ["EV"]);

console.log("Unit tests geslaagd");
