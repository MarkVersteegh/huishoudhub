# Frontend

De frontend is een single-page app zonder buildstap en zonder npm-afhankelijkheden. PocketBase serveert de bestanden direct uit `pb_public/`. De app gebruikt native ES-modules.

| Bestand | Inhoud |
|---|---|
| `pb_public/index.html` | Volledige DOM-structuur; alle views staan vooraf in HTML |
| `pb_public/app.js` | Orchestration-laag: state, formulier, detailmodal en event handlers |
| `pb_public/js/*.js` | Modules voor config, datums, modelhelpers, API, audit en rendering |
| `pb_public/styles.css` | Alle styling inclusief dark theme via `[data-theme="dark"]` |

`pb_public/` is de bronlocatie voor frontend-wijzigingen. Er is geen kopieerstap vanuit de projectroot meer.

## Views

Er zijn vier views, elk een `<section class="view">`. Slechts één heeft tegelijk de class `active`.

| View | ID | Beschrijving |
|---|---|---|
| Vandaag | `todayView` | Open taken met bucket `overdue`, `now`, `today` |
| Week | `weekView` | Open taken gegroepeerd per dag van maandag t/m zondag, plus afgerond deze week |
| Lijst | `listView` | Open, toekomstig en afgerond — alle geladen taken |
| Formulier | `formView` | Nieuwe taak of bestaande taak bewerken |
| Report | `/report/` | Losse rapportpagina met alle audit-events in een sorteerbare/filterbare tabel |

`setView(name)` wisselt de actieve view. Bij het verlaten van de lijst wordt `taskLoadingMore` gereset zodat infinite scroll niet blijft hangen.

De reportpagina staat in `pb_public/report/` en gebruikt Grid.js via CDN voor zoeken, sorteren en paginering. De filters boven de tabel werken lokaal op alle opgehaalde `task_events`-records.

## Module-indeling

| Module | Verantwoordelijkheid |
|---|---|
| `js/config.js` | PocketBase-base URL en personenconfiguratie |
| `js/dates.js` | Datumhelpers, bucketberekening en weekranges |
| `js/model.js` | Normalisatie, escaping, done-by arrays, completion styling en snapshots |
| `js/api.js` | PocketBase REST-calls voor taken, series en audit-events |
| `js/audit.js` | Bouwt `task_events` payloads |
| `js/views.js` | Rendering van Vandaag, Week, Lijst, filters en kaarten |

## Staat

Alle runtime-staat staat in top-level variabelen in `app.js`:

| Variabele | Type | Inhoud |
|---|---|---|
| `tasks` | `Array` | In-memory takenlijst, gevuld vanuit PocketBase |
| `taskCurrentPage` / `taskTotalPages` | number | Pagineringstatus van de geladen PocketBase-records |
| `taskLoadingMore` | bool | Guard tegen dubbele infinite-scroll verzoeken; blijft aanwezig als fallback |
| `activeStatusFilters` | `Set` | Actieve bucketfilters (`overdue`, `now`, `today`) |
| `activePersonFilters` | `Set` | Actieve persoonsfilters (`EV`, `JV`, `JD`, `MV`) |
| `activeView` / `previousView` | string | Huidige en vorige view |
| `editingTaskId` | string/null | ID van de taak die bewerkt wordt |
| `expandedTasks` | `Set` | Taak-IDs waarvan subtaken uitgevouwen zijn |

Taken worden niet in `localStorage` opgeslagen. Alleen voorkeuren zoals thema (`huishoudhub-theme`) en gekozen persoon (`huishoudhub-person`) worden lokaal bewaard.

## Dataflow

Bij het laden:

1. `loadTasks()` haalt alle pagina's op via `/api/collections/tasks/records`, zodat Vandaag en Deze week compleet zijn zonder eerst door Lijst te scrollen.
2. Records worden genormaliseerd met `normalize(record)`.
3. `render()` tekent de actieve view.
4. `subscribeRealtime()` opent een SSE-verbinding op `/api/realtime`.

`render()` bouwt alleen de actieve view opnieuw op. Event listeners zijn grotendeels gedelegeerd via `.main`, zodat ze niet na elke render opnieuw per taakkaart hoeven te worden gekoppeld.

## PocketBase API

De frontend gebruikt:

| Methode | Endpoint | Functie |
|---|---|---|
| `GET` | `/api/collections/tasks/records?perPage=100&sort=date&expand=series_id` | Taken laden, alle pagina's achter elkaar |
| `POST` | `/api/collections/tasks/records` | Taakinstantie maken |
| `PATCH` | `/api/collections/tasks/records/:id` | Taak bijwerken of afvinken |
| `DELETE` | `/api/collections/tasks/records/:id` | Taak verwijderen |
| `POST` | `/api/collections/series/records` | Nieuwe herhalingsserie maken |
| `PATCH` | `/api/collections/series/records/:id` | Serie bijwerken |
| `POST` | `/api/collections/task_events/records` | Audit-event vastleggen |
| `GET`/`POST` | `/api/realtime` | Realtime updates |

## Bucket-systeem

`computeBucket(task)` berekent urgentie op basis van `task.date`, `task.time` en het lokale huidige tijdstip:

| Bucket | Wanneer |
|---|---|
| `overdue` | Datum ligt vóór vandaag |
| `now` | Vandaag en tijdslot is nu actief |
| `today` | Vandaag, maar niet nu |
| `soon` | Binnen de lopende week |
| `future` | Na de lopende week |

De datumhelpers gebruiken lokale tijd (`toLocaleDateString("en-CA")`) zodat taken niet per ongeluk een dag verschuiven door UTC.

## Formulier en bewerken

Het formulier ondersteunt:

| Veld | Invoer | Opmerking |
|---|---|---|
| Personen | Multi-select via persoonchips | Eén of meer verantwoordelijken |
| Titel | Tekst | Verplicht |
| Datum | Date-input | Standaard vandaag |
| Tijdslot | Radio | leeg / ochtend / middag / avond |
| Exacte tijd | Time-input | Optioneel |
| Opmerking | Tekst | Optioneel |
| Herhaling | Radio | ad-hoc / dagelijks / om de 2 dagen / schooldagen / wekelijks / maandelijks |
| Subtaken | Dynamische lijst | Toevoegen, verwijderen, volgorde aanpassen |

Bij het bewerken van een taak uit een serie verschijnt een scope-keuze:

| Scope | Effect |
|---|---|
| Alleen deze taak | Patcht alleen de huidige taakinstantie |
| Deze en toekomstige | Patcht toekomstige open taakinstanties en werkt de serie bij |

Voor series-updates toont de app eerst een `confirm()` met aantal geraakte taken en enkele voorbeelden.

## Auditlogging

De app schrijft na geslaagde taakacties een record naar `task_events`. Gelogde types zijn:

| Type | Wanneer |
|---|---|
| `created` | Nieuwe taakinstantie aangemaakt |
| `updated` | Taak bewerkt, inclusief bulk-update naar toekomstige taken |
| `completed` | Taak afgerond, inclusief afronding via alle subtaken |
| `reopened` | Taak opnieuw geopend |
| `subtask_updated` | Subtaak afgevinkt of heropend zonder parent-statuswijziging |
| `deleted` | Taak verwijderd |

Auditlogging blokkeert de primaire actie niet. Als `task_events` tijdelijk niet beschikbaar is, blijft de taakactie zelf doorgaan en wordt er alleen geen event geschreven.

## Realtime synchronisatie

`subscribeRealtime()` opent een `EventSource`. Na `PB_CONNECT` laadt de app stil alle taken opnieuw en abonneert daarna op `tasks`. Events worden verwerkt als:

| Action | Effect |
|---|---|
| `create` | Nieuwe taak toevoegen aan `tasks[]` |
| `update` | Bestaande taak vervangen na `normalize()` |
| `delete` | Taak uit `tasks[]` verwijderen |

Bij verbindingsverlies wordt na 3 seconden opnieuw verbonden.

## iOS 12-compatibiliteit

De app moet werken op oude iPads. Vermijd daarom:

- optional chaining (`?.`)
- nullish coalescing (`??`)
- moderne syntax die iOS 12 Safari niet ondersteunt

`fetch`, `EventSource`, `Set`, `Promise` en `IntersectionObserver` worden gebruikt.

## Tests

De frontend heeft een herhaalbare testset die zonder handmatige browseractie draait:

```powershell
npm test
```

De standaardtest combineert static checks, unit tests, API-integratie en een smoke-test in Chrome. Voor grote UI-aanpassingen:

```powershell
npm run test:all
```

Belangrijke dekking:

- module-MIME en syntax, zodat `.mjs`/`text/plain` regressies direct falen;
- filters, aantallen, multi-select en select-all gedrag;
- taak toevoegen, bewerken, verwijderen, afvinken en heropenen;
- `done_at`, multi-person `done_by` en audit-events;
- detailscherm, subtaken, weekweergave, lijstweergave, reportpagina;
- dark theme en responsive viewports voor desktop, tablet en mobiel.

De tests raken daarmee zowel de kleine berekeningen in `js/*.js` als de echte browserervaring tegen een aparte PocketBase op poort `8091`. Ze zijn bedoeld als vaste check na wijzigingen, zodat laadproblemen, kapotte filters, foutieve afrondstatussen en regressies in de hoofdflows zonder handmatige klikronde zichtbaar worden.
