import { baseUrl, requestJson } from "./pocketbase-test-server.mjs";

// Testdatums zijn relatief, zodat de suite ook morgen nog dezelfde buckets raakt.
export function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA");
}

// Kies het tijdslot dat op dit moment in de "nu"-bucket valt.
export function matchingMoment(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "ochtend";
  if (hour < 18) return "middag";
  return "avond";
}

async function listRecords(collection) {
  const data = await requestJson(baseUrl + "/api/collections/" + collection + "/records?perPage=200");
  return data.items || [];
}

export async function clearCollection(collection) {
  const records = await listRecords(collection);
  for (const record of records) {
    await fetch(baseUrl + "/api/collections/" + collection + "/records/" + record.id, { method: "DELETE" });
  }
}

export async function resetData() {
  await clearCollection("task_events");
  await clearCollection("tasks");
  await clearCollection("series");
}

// Dunne PocketBase helpers houden de tests leesbaar en dicht bij de echte API.
export async function createRecord(collection, data) {
  return requestJson(baseUrl + "/api/collections/" + collection + "/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function patchRecord(collection, id, data) {
  return requestJson(baseUrl + "/api/collections/" + collection + "/records/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function seedHouseholdData() {
  await resetData();
  // Seed bevat bewust elke hoofdstatus: te laat, nu, vandaag, toekomst en afgerond.
  const dailySeries = await createRecord("series", {
    title: "Dagelijkse testreeks",
    persons: ["JV"],
    time: matchingMoment(),
    clock: "",
    note: "testreeks",
    repeat_rule: { type: "daily", interval: 1 },
    start_date: isoDate(0),
    end_date: isoDate(7),
    subtasks_template: [{ title: "Stap een" }, { title: "Stap twee" }],
  });

  const records = {};
  records.overdue = await createRecord("tasks", {
    persons: ["MV"],
    title: "Vaatwasser test",
    date: isoDate(-1),
    time: "avond",
    clock: "",
    note: "gisteren",
    done_at: "",
    done_by: [],
    subtasks: [],
  });
  records.now = await createRecord("tasks", {
    series_id: dailySeries.id,
    persons: ["JV"],
    title: "Konijnen test verzorgen",
    date: isoDate(0),
    time: matchingMoment(),
    clock: "",
    note: "moet nu",
    done_at: "",
    done_by: [],
    subtasks: [{ title: "Water", done_at: null }, { title: "Hooi", done_at: null }],
  });
  records.today = await createRecord("tasks", {
    persons: ["EV"],
    title: "Boodschappenlijst test",
    date: isoDate(0),
    time: "",
    clock: "",
    note: "vandaag",
    done_at: "",
    done_by: [],
    subtasks: [],
  });
  records.future = await createRecord("tasks", {
    persons: ["JD"],
    title: "Handdoeken test draaien",
    date: isoDate(1),
    time: "middag",
    clock: "",
    note: "morgen",
    done_at: "",
    done_by: [],
    subtasks: [],
  });
  records.doneOther = await createRecord("tasks", {
    persons: ["EV"],
    title: "Afgerond door ander test",
    date: isoDate(0),
    time: "",
    clock: "",
    note: "klaar",
    done_at: new Date().toISOString(),
    done_by: ["MV"],
    subtasks: [],
  });
  records.doneLate = await createRecord("tasks", {
    persons: ["JV"],
    title: "Te laat afgerond test",
    date: isoDate(-1),
    time: "",
    clock: "",
    note: "klaar",
    done_at: new Date().toISOString(),
    done_by: ["JV"],
    subtasks: [],
  });

  await createRecord("task_events", {
    event_type: "completed",
    task_id: records.doneOther.id,
    task_title: records.doneOther.title,
    task_date: records.doneOther.date,
    task_persons: records.doneOther.persons,
    actors: records.doneOther.done_by,
    done_at: records.doneOther.done_at,
    done_by: records.doneOther.done_by,
    details: { source: "seed" },
    task_snapshot: records.doneOther,
  });

  return records;
}
