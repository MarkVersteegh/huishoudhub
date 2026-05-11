/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    // Sla over als de collectie al bestaat (bijv. bij herstart)
    try { app.findCollectionByNameOrId("tasks"); return; } catch (_) {}

    const collection = new Collection({
        name: "tasks",
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        fields: [
            { name: "person",  type: "text", required: true },
            { name: "title",   type: "text", required: true },
            { name: "date",    type: "text", required: true },
            { name: "time",    type: "text" },
            { name: "clock",   type: "text" },
            { name: "note",    type: "text" },
            { name: "repeat",  type: "text" },
            { name: "done",    type: "bool" },
            { name: "subtasks",type: "json" },
        ],
    });

    app.save(collection);
}, (app) => {
    try {
        const collection = app.findCollectionByNameOrId("tasks");
        app.delete(collection);
    } catch (_) {}
});
