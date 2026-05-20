import { POCKETBASE_URL } from "./config.js?v=20260520-filter";

export const TASKS_URL = "/api/collections/tasks/records?perPage=100&sort=date&expand=series_id";
export const EVENTS_URL = "/api/collections/task_events/records?perPage=100&sort=-created";

// Centrale JSON-helper voor mutaties; callsites hoeven alleen het endpoint en payload te kennen.
async function sendJson(url, method, data) {
  const res = await fetch(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.ok) return res.json();
  throw new Error("HTTP " + res.status);
}

export async function fetchTasksPage(page) {
  const res = await fetch(POCKETBASE_URL + TASKS_URL + "&page=" + page);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function fetchAllTasks() {
  const first = await fetchTasksPage(1);
  let items = first.items || [];
  const totalPages = first.totalPages || 1;
  for (let page = 2; page <= totalPages; page++) {
    const data = await fetchTasksPage(page);
    items = items.concat(data.items || []);
  }
  return { items: items, totalPages: totalPages };
}

export async function patchTaskRecord(id, data) {
  return sendJson(POCKETBASE_URL + "/api/collections/tasks/records/" + id, "PATCH", data);
}

export async function patchSeriesRecord(id, data) {
  const res = await fetch(POCKETBASE_URL + "/api/collections/series/records/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function deleteTaskRecord(id) {
  const res = await fetch(POCKETBASE_URL + "/api/collections/tasks/records/" + id, { method: "DELETE" });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

export async function saveTaskRecord(data) {
  return sendJson(POCKETBASE_URL + "/api/collections/tasks/records", "POST", data);
}

export async function createSeriesRecord(data) {
  const res = await fetch(POCKETBASE_URL + "/api/collections/series/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function saveTaskEvent(data) {
  const res = await fetch(POCKETBASE_URL + "/api/collections/task_events/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
