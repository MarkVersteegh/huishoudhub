/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const tasks = app.findCollectionByNameOrId("tasks");

    // Idempotentiecheck: al gemigreerd als series_id bestaat
    if (tasks.fields.getByName("series_id")) return;

    const series = app.findCollectionByNameOrId("series");

    // Verwijder verouderde velden
    tasks.fields.removeByName("person");
    tasks.fields.removeByName("repeat");
    tasks.fields.removeByName("done");

    // Voeg nieuwe velden toe
    tasks.fields.add(
        new RelationField({ name: "series_id", collectionId: series.id, maxSelect: 1, cascadeDelete: false }),
        new JSONField({ name: "persons" }),
        new TextField({ name: "done_at" }),
        new TextField({ name: "done_by" }),
    );

    app.save(tasks);
}, (app) => {
    try {
        const tasks = app.findCollectionByNameOrId("tasks");
        if (!tasks.fields.getByName("person")) {
            tasks.fields.removeByName("series_id");
            tasks.fields.removeByName("persons");
            tasks.fields.removeByName("done_at");
            tasks.fields.removeByName("done_by");
            tasks.fields.add(
                new TextField({ name: "person", required: true }),
                new TextField({ name: "repeat" }),
                new BoolField({ name: "done" }),
            );
            app.save(tasks);
        }
    } catch (_) {}
});
