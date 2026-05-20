# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

HuishoudHub is a Dutch household task manager — a single-page web app for a family of four (Emmy, Joris, Juliette, Mark). The app is served by PocketBase from `pb_public/` and persists data in SQLite via PocketBase collections. There is no frontend build step or bundler; npm is used only for the test tooling.

## Architecture

Frontend files are served directly from `pb_public/` with native ES modules and no build step:

- [pb_public/index.html](pb_public/index.html) — full DOM structure; all views are pre-rendered in HTML and shown/hidden via CSS classes
- [pb_public/app.js](pb_public/app.js) — orchestration layer for state, form/detail modal, and event handlers
- [pb_public/js/*.js](pb_public/js) — small modules for config, dates, model helpers, API, audit payloads, and rendering
- [pb_public/styles.css](pb_public/styles.css) — all styles including dark theme via `[data-theme="dark"]` on `:root`

Run locally with:

```powershell
.\pocketbase.exe serve --dir=pb_data --migrationsDir=pb_migrations --publicDir=pb_public
```

Then open `http://localhost:8090`.

### State model

All state lives in top-level variables in `app.js`:

- `tasks` — in-memory array loaded from PocketBase and re-rendered locally after API/realtime changes
- `taskCurrentPage`, `taskTotalPages`, `taskLoadingMore` — pagination state; startup loads all pages so day/week views are complete
- `activeStatusFilters` / `activePersonFilters` — `Set` objects for active filter selections
- `activeView` / `previousView` — current and previous view name (`"today"`, `"week"`, `"list"`, `"form"`)
- `editingTaskId` — `null` or the id of the task being edited in the form
- `expandedTasks` — `Set` of task ids with subtasks currently expanded

### Task schema

The persisted `tasks` collection contains task instances: `id`, `series_id`, `persons` (array of EV/JV/JD/MV), `title`, `date` (ISO), `time` (ochtend/middag/avond or empty), `clock` (HH:MM or empty), `note`, `subtasks[]`, `done_at`, `done_by` (array of initials).

The persisted `series` collection contains reusable repeat definitions: `title`, `persons`, `time`, `clock`, `note`, `repeat_rule`, `start_date`, `end_date`, `subtasks_template[]`.

The persisted `task_events` collection is an append-only audit log written by the frontend after task actions. `/report/` reads this collection.

`normalize(record)` in `js/model.js` converts PocketBase records into render-ready tasks with derived fields such as `day`, `due`, `repeat`, `bucket`, `late`, and `done`.

`bucket` classifies urgency: `overdue` → `now` → `today` → `soon` → `future`. The today view shows overdue/now/today; week view shows all non-done tasks from Monday through Sunday plus completed tasks for that week; list view groups by open/future/done.

### Rendering

`render()` delegates to `js/views.js` and rebuilds views from the current state. No virtual DOM, no diffing. `taskCard()` and `compactTaskCard()` return HTML strings that are written via `innerHTML`; dynamic events are handled mostly through delegated listeners in `app.js`.

### Views

Views are `<section class="view">` elements. Only one has `class="active"` at a time (set by `updateViewUi()`). The sidebar/bottom nav buttons call `setView(name)`. The form view is reached via `openTaskForm()`.

### Dates

`todayStr()`, `weekEndStr()`, `dateToDay()` and `computeBucket()` use the browser's local date/time. `computeBucket()` classifies "now" by the coarse `time` slot (`ochtend`, `middag`, `avond`); `clock` is displayed but does not currently affect the bucket.

### Persistence and API

The app calls PocketBase directly with `fetch()`:

- `GET /api/collections/tasks/records?perPage=100&sort=date&expand=series_id`
- `POST/PATCH/DELETE /api/collections/tasks/records/:id`
- `POST/PATCH /api/collections/series/records/:id`
- `POST /api/collections/task_events/records`
- `GET/POST /api/realtime` for SSE updates on `tasks`

Task data is not stored in `localStorage`; only lightweight UI preferences such as theme (`huishoudhub-theme`) and chosen person (`huishoudhub-person`) can be local.

### Tests

Run the standard local test suite with:

```powershell
npm test
```

## Language

UI and comments are in Dutch (the family's language). Code identifiers are in English.
