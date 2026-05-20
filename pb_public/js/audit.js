import { parseDoneBy, taskSnapshot } from "./model.js?v=20260520-filter";

// Bouw een append-only auditrecord met zowel samenvattende kolommen als volledige snapshot.
export function buildTaskEvent(task, eventType, details, actors) {
  const snapshot = taskSnapshot(task);
  return {
    event_type: eventType,
    task_id: snapshot.id || "",
    task_title: snapshot.title || "",
    task_date: snapshot.date || "",
    task_persons: snapshot.persons || [],
    actors: parseDoneBy(actors || snapshot.done_by || []),
    done_at: snapshot.done_at || "",
    done_by: parseDoneBy(snapshot.done_by || []),
    details: details || {},
    task_snapshot: snapshot,
  };
}
