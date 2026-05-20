import assert from "node:assert/strict";
import { baseUrl, requestJson, startTestServer, stopTestServer } from "./helpers/pocketbase-test-server.mjs";
import { createRecord, isoDate, patchRecord, resetData } from "./helpers/test-data.mjs";

let server;
try {
  server = await startTestServer();
  await resetData();

  // API-test raakt echte PocketBase endpoints, maar alleen in tests/.tmp/pb_data.
  const created = await createRecord("tasks", {
    persons: ["EV"],
    title: "API test toevoegen",
    date: isoDate(0),
    time: "middag",
    clock: "15:00",
    note: "uit school",
    done_at: "",
    done_by: [],
    subtasks: [{ title: "Stap een", done_at: null }],
  });
  assert.equal(created.title, "API test toevoegen");
  assert.deepEqual(created.persons, ["EV"]);

  const updated = await patchRecord("tasks", created.id, { title: "API test aangepast" });
  assert.equal(updated.title, "API test aangepast");

  const doneAt = new Date().toISOString();
  // Afronden moet zowel done_at als meerdere afronders kunnen vastleggen.
  const completed = await patchRecord("tasks", created.id, { done_at: doneAt, done_by: ["EV", "MV"] });
  assert.equal(completed.done_at, doneAt);
  assert.deepEqual(completed.done_by, ["EV", "MV"]);

  const event = await createRecord("task_events", {
    event_type: "completed",
    task_id: completed.id,
    task_title: completed.title,
    task_date: completed.date,
    task_persons: completed.persons,
    actors: completed.done_by,
    done_at: completed.done_at,
    done_by: completed.done_by,
    details: { source: "api-test" },
    task_snapshot: completed,
  });
  assert.equal(event.event_type, "completed");
  assert.deepEqual(event.actors, ["EV", "MV"]);

  const events = await requestJson(baseUrl + "/api/collections/task_events/records?perPage=100");
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].task_id, completed.id);

  const report = await fetch(baseUrl + "/report/");
  assert.equal(report.status, 200);
  assert.match(await report.text(), /Actierapport/);

  const deleteRes = await fetch(baseUrl + "/api/collections/tasks/records/" + completed.id, { method: "DELETE" });
  assert.equal(deleteRes.status, 204);
  const afterDelete = await requestJson(baseUrl + "/api/collections/tasks/records?perPage=100");
  assert.equal(afterDelete.items.some((item) => item.id === completed.id), false);
} finally {
  await stopTestServer(server);
}

console.log("API tests geslaagd");
