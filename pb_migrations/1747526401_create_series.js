/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    try { app.findCollectionByNameOrId("series"); return; } catch (_) {}

    const collection = new Collection({
        name: "series",
        type: "base",
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
    });

    collection.fields.add(
        new TextField({ name: "title",             required: true }),
        new JSONField({ name: "persons" }),
        new TextField({ name: "time" }),
        new TextField({ name: "clock" }),
        new TextField({ name: "note" }),
        new JSONField({ name: "repeat_rule",        required: true }),
        new TextField({ name: "start_date",         required: true }),
        new TextField({ name: "end_date",           required: true }),
        new JSONField({ name: "subtasks_template" }),
    );

    app.save(collection);
}, (app) => {
    try { app.delete(app.findCollectionByNameOrId("series")); } catch (_) {}
});
