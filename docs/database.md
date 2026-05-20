# Database

## Collecties

De database gebruikt drie PocketBase-collecties:

| Collectie | Functie |
|---|---|
| `tasks` | Concrete taakinstanties op een specifieke datum |
| `series` | Herhalingsreeksen waaruit taakinstanties worden gegenereerd |
| `task_events` | Auditlog van taakacties voor rapportage |

PocketBase voegt zelf velden toe zoals `id`, `collectionId`, `collectionName`, `created` en `updated`. De frontend gebruikt alleen de inhoudsvelden hieronder.

## `tasks`

| Veld | Type | Verplicht | Beschrijving |
|---|---|---|---|
| `id` | text (PB intern) | ja | Unieke PocketBase-id |
| `series_id` | relation -> `series` | nee | Koppeling naar de herhalingsreeks, leeg voor losse taken |
| `persons` | json | nee | Array met initialen van verantwoordelijken: `EV`, `JV`, `JD`, `MV` |
| `title` | text | ja | Naam van de taak |
| `date` | text | ja | ISO-datum (`YYYY-MM-DD`) waarop deze taak verwacht wordt |
| `time` | text | nee | Tijdslot: `ochtend`, `middag`, `avond` of leeg |
| `clock` | text | nee | Exacte tijd (`HH:MM`) of leeg |
| `note` | text | nee | Vrije opmerking, bijvoorbeeld `voor school` of `woensdag uit school` |
| `subtasks` | json | nee | Array met subtaken |
| `done_at` | text | nee | ISO-tijdstip waarop de taak afgerond is, leeg als openstaand |
| `done_by` | json | nee | Array met initialen van degene(n) die de taak hebben afgerond, bijvoorbeeld `["EV"]` of `["EV","MV"]` |

`done_at` vervangt het oude boolean-veld `done`. Een taak geldt als afgerond wanneer `done_at` gevuld is.

## `series`

| Veld | Type | Verplicht | Beschrijving |
|---|---|---|---|
| `id` | text (PB intern) | ja | Unieke PocketBase-id |
| `title` | text | ja | Naam voor alle taken in de reeks |
| `persons` | json | nee | Array met verantwoordelijken |
| `time` | text | nee | Standaard tijdslot |
| `clock` | text | nee | Standaard exacte tijd |
| `note` | text | nee | Standaard opmerking |
| `repeat_rule` | json | ja | Herhalingsregel |
| `start_date` | text | ja | Eerste datum van de reeks |
| `end_date` | text | ja | Laatste datum van de reeks |
| `subtasks_template` | json | nee | Subtaaksjabloon voor gegenereerde taken |

De backend voert de herhalingslogica niet automatisch uit. `scripts/seed.ps1` genereert taakinstanties uit `series`-records. Bij bewerken kan de frontend een serie bijwerken en bestaande toekomstige taakinstanties patchen.

## `task_events`

| Veld | Type | Beschrijving |
|---|---|---|
| `event_type` | text | Type actie: `created`, `updated`, `completed`, `reopened`, `subtask_updated`, `deleted` |
| `task_id` | text | ID van de taakinstantie op het moment van de actie |
| `task_title` | text | Taaktitel op het moment van de actie |
| `task_date` | text | Taakdatum op het moment van de actie |
| `task_persons` | json | Verantwoordelijken op het moment van de actie |
| `actors` | json | Personen die de actie uitvoerden of afronding claimden |
| `done_at` | text | Afrondmoment na de actie, indien van toepassing |
| `done_by` | json | Afronders na de actie, indien van toepassing |
| `details` | json | Kleine actie-specifieke metadata, zoals scope of subtaakindex |
| `task_snapshot` | json | Snapshot van de taak na de actie |

`task_events` is append-only vanuit de frontend: wijzigen en verwijderen is technisch nog open zolang de API-regels open zijn, maar de app zelf gebruikt alleen `POST`.

## Herhalingsregels

`repeat_rule` is JSON. De huidige frontend en seed-scripts ondersteunen:

| Voorbeeld | Betekenis |
|---|---|
| `{ "type": "once" }` | Eenmalig |
| `{ "type": "daily", "interval": 1 }` | Dagelijks |
| `{ "type": "daily", "interval": 2 }` | Om de 2 dagen |
| `{ "type": "weekdays" }` | Schooldagen / doordeweeks |
| `{ "type": "weekly", "interval": 1 }` | Wekelijks |
| `{ "type": "weekly", "days": [3] }` | Wekelijks op specifieke weekdagen |
| `{ "type": "monthly" }` | Maandelijks |

Weekdagen volgen JavaScript-conventie: zondag `0`, maandag `1`, enzovoort.

## Datumconventie

Het veld `tasks.date` is de concrete uitvoerdatum van die taakinstantie. De frontend berekent daaruit de bucket:

| Bucket | Wanneer |
|---|---|
| `overdue` | `date < vandaag` |
| `now` | `date == vandaag` en het tijdslot is op dit moment actief |
| `today` | `date == vandaag`, maar nog niet `now` |
| `soon` | Na vandaag, binnen de lopende week (maandag t/m zondag) |
| `future` | Na de lopende week |

De frontend gebruikt lokale tijd via `toLocaleDateString("en-CA")` om tijdzoneproblemen rond middernacht te vermijden.

## Migraties

Migraties staan in `pb_migrations/`:

| Bestand | Functie |
|---|---|
| `1715000000_create_tasks.js` | Maakt de oorspronkelijke `tasks`-collectie aan |
| `1747526401_create_series.js` | Maakt de `series`-collectie aan |
| `1747526402_refactor_tasks.js` | Vervangt oude velden door `series_id`, `persons`, `done_at`, `done_by` |
| `1747526403_task_events_and_done_by_json.js` | Zet `done_by` om naar JSON-array en maakt `task_events` |

De migraties zijn idempotent en worden automatisch uitgevoerd bij het starten van PocketBase.

## Seed

`data/series-seed.json` bevat de actuele bron voor initiële reeksen. Importeren:

```powershell
.\scripts\seed.ps1          # Slaat over als er al taken zijn
.\scripts\seed.ps1 -Force   # Voegt toe ook als er al taken zijn
.\scripts\seed.ps1 -Clear   # Verwijdert eerst alle taken en series
```

De oude losse seeddata is verwijderd. De huidige seed-flow gebruikt alleen `data/series-seed.json`.

## Backup en export

| Commando | Resultaat |
|---|---|
| `.\scripts\backup.ps1` | Zip van de volledige SQLite-database in `pb_data/backups/`; gebruikt `PB_ADMIN_EMAIL` en `PB_ADMIN_PASSWORD` |
| `.\scripts\export.ps1` | JSON-export van taken in `exports/` |

De export bevat taakinstanties in het actuele schema (`series_id`, `persons`, `done_at`, `done_by`) en is bedoeld voor inspectie of losse data-overdracht. Voor een volledige herstelbare backup blijft `backup.ps1` / `backup.sh` leidend, omdat die de hele SQLite-database inclusief `series` bewaart.

`pb_data/` en `exports/` staan in `.gitignore`.
