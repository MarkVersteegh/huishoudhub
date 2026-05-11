# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

HuishoudHub is a Dutch household task manager — a single-page web app for a family of four (Emmy, Joris, Juliette, Mark). No build step, no dependencies, no package manager. Open `index.html` directly in a browser to run.

## Architecture

Three files, no modules:

- [index.html](index.html) — full DOM structure; all views are pre-rendered in HTML and shown/hidden via CSS classes
- [app.js](app.js) — all logic in one flat script; no classes, no modules
- [styles.css](styles.css) — all styles including dark theme via `[data-theme="dark"]` on `:root`

### State model

All state lives in top-level variables in `app.js`:

- `tasks` — in-memory array; **not persisted** (no localStorage, no backend). Changes are lost on page reload.
- `activeStatusFilters` / `activePersonFilters` — `Set` objects for active filter selections
- `activeView` / `previousView` — current and previous view name (`"today"`, `"week"`, `"list"`, `"form"`)
- `editingTaskId` — `null` or the id of the task being edited in the form
- `expandedTasks` — `Set` of task ids with subtasks currently expanded

### Task schema

Each task has: `id`, `person` (initials: EV/JV/JD/MV), `title`, `due` (display label), `date` (ISO), `day` (Dutch weekday name), `time` (ochtend/middag/avond or empty), `clock` (HH:MM or empty), `note`, `repeat` (ad-hoc/dagelijks/schooldagen/wekelijks/maandelijks), `bucket`, `late`, `done`, optional `subtasks[]`.

`bucket` classifies urgency: `overdue` → `now` → `today` → `soon` → `future`. The today view shows overdue/now/today; week view shows all non-done tasks by `day`; list view groups by open/future/done.

### Rendering

`render()` is the single re-render function — it rebuilds all views and re-attaches all event listeners every call. No virtual DOM, no diffing. `taskCard()` and `compactTaskCard()` return HTML strings that are written via `innerHTML`.

### Views

Views are `<section class="view">` elements. Only one has `class="active"` at a time (set by `updateViewUi()`). The sidebar/bottom nav buttons call `setView(name)`. The form view is reached via `openTaskForm()`.

### Dates

`bucketForDate()` and `dateToDay()` use hardcoded reference dates (currently 2026-05-10 as "today"). When updating to a real date-aware implementation, these functions are the entry point.

## Language

UI and comments are in Dutch (the family's language). Code identifiers are in English.
