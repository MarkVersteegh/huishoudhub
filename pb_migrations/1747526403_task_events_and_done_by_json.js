/// <reference path="../pb_data/types.d.ts" />

function parseDoneBy(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value).split(",").map((part) => part.trim()).filter(Boolean);
}

migrate((app) => {
    const tasks = app.findCollectionByNameOrId("tasks");

    // Converteer done_by van legacy tekst naar JSON-array, met behoud van bestaande waarden.
    try {
        const doneByField = tasks.fields.getByName("done_by");
        if (doneByField && doneByField.type !== "json") {
            const existing = app.findAllRecords("tasks").map((record) => ({
                id: record.id,
                done_by: parseDoneBy(record.get("done_by")),
            }));

            tasks.fields.removeByName("done_by");
            tasks.fields.add(new JSONField({ name: "done_by" }));
            app.save(tasks);

            existing.forEach((item) => {
                const record = app.findRecordById("tasks", item.id);
                record.set("done_by", item.done_by);
                app.save(record);
            });
        }
    } catch (_) {}

    try { app.findCollectionByNameOrId("task_events"); return; } catch (_) {}

    const events = new Collection({
        name: "task_events",
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
    });

    events.fields.add(
        new TextField({ name: "event_type", required: true }),
        new TextField({ name: "task_id" }),
        new TextField({ name: "task_title" }),
        new TextField({ name: "task_date" }),
        new JSONField({ name: "task_persons" }),
        new JSONField({ name: "actors" }),
        new TextField({ name: "done_at" }),
        new JSONField({ name: "done_by" }),
        new JSONField({ name: "details" }),
        new JSONField({ name: "task_snapshot" }),
    );

    app.save(events);
}, (app) => {
    try { app.delete(app.findCollectionByNameOrId("task_events")); } catch (_) {}
    try {
        const tasks = app.findCollectionByNameOrId("tasks");
        const doneByField = tasks.fields.getByName("done_by");
        if (doneByField && doneByField.type === "json") {
            const existing = app.findAllRecords("tasks").map((record) => ({
                id: record.id,
                done_by: parseDoneBy(record.get("done_by")).join(","),
            }));

            tasks.fields.removeByName("done_by");
            tasks.fields.add(new TextField({ name: "done_by" }));
            app.save(tasks);

            existing.forEach((item) => {
                const record = app.findRecordById("tasks", item.id);
                record.set("done_by", item.done_by);
                app.save(record);
            });
        }
    } catch (_) {}
});
