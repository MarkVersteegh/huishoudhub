# Frontend

Drie bestanden, geen buildstap, geen afhankelijkheden:

| Bestand | Inhoud |
|---|---|
| `index.html` | Volledige DOM-structuur; alle views zijn vooraf gerenderd en worden via CSS getoond/verborgen |
| `app.js` | Alle logica in één plat script; geen klassen, geen modules |
| `styles.css` | Alle stijlen inclusief donker thema via `[data-theme="dark"]` op `:root` |

De bestanden in de projectroot zijn de bronbestanden. `pb_public/` bevat dezelfde bestanden en wordt door PocketBase geserveerd. Na een wijziging de bestanden handmatig kopiëren naar `pb_public/`.

## Views

Er zijn vier views, elk een `<section class="view">`. Slechts één heeft tegelijk de class `active`.

| View | ID | Beschrijving |
|---|---|---|
| Vandaag | `todayView` | Taken met bucket `overdue`, `now`, `today` |
| Week | `weekView` | Alle openstaande taken gegroepeerd per weekdag |
| Lijst | `listView` | Open, toekomstig en afgerond — alle taken |
| Formulier | `formView` | Nieuwe taak of bewerken |

`setView(name)` wisselt de actieve view. `render()` wordt na elke wijziging volledig opnieuw aangeroepen — geen virtual DOM, geen diffing.

## Staat

Alle staat staat in module-niveau variabelen:

| Variabele | Type | Inhoud |
|---|---|---|
| `tasks` | `Array` | In-memory taakenlijst; wordt gevuld via PocketBase REST |
| `activeStatusFilters` | `Set` | Actieve bucketfilters (`overdue`, `now`, `today`) |
| `activePersonFilters` | `Set` | Actieve persoonsfilters (`EV`, `JV`, `JD`, `MV`) |
| `activeView` | `string` | Huidige view (`"today"`, `"week"`, `"list"`, `"form"`) |
| `editingTaskId` | `string\|null` | ID van de taak die bewerkt wordt, anders `null` |
| `expandedTasks` | `Set` | IDs van taken waarvan subtaken uitgevouwen zijn |

Er is geen localStorage-persistentie voor taken — alles komt uit PocketBase. Alleen de persoonsvoorkeur (`huishoudhub-person`) en het thema worden lokaal opgeslagen.

## Bucket-systeem

`computeBucket(task)` berekent de urgentie van een taak op basis van `task.date` en het huidige tijdstip:

| Bucket | Wanneer |
|---|---|
| `overdue` | `task.date` ligt vóór vandaag |
| `now` | Vandaag, en de tijdslot (`ochtend`/`middag`/`avond`) is actief |
| `today` | Vandaag, maar tijdslot nog niet actief (of geen tijdslot) |
| `soon` | Na vandaag, binnen de lopende week (t/m aankomende zondag) |
| `future` | Na het einde van de huidige week |

## Realtime synchronisatie

`subscribeRealtime()` opent een `EventSource` op `/api/realtime`. Na het ontvangen van `PB_CONNECT` wordt een POST verstuurd om te abonneren op de `tasks`-collectie. Inkomende SSE-events (`create` / `update` / `delete`) worden direct in de in-memory array verwerkt, waarna `render()` wordt aangeroepen.

Bij een verbindingsfout sluit de EventSource en probeert de app na 3 seconden opnieuw te verbinden.

## iOS 12-compatibiliteit

De app werkt op iOS 12 Safari (oude iPads). Daarom:

- Geen optional chaining (`?.`) of nullish coalescing (`??`)
- Geen arrow functions in event listeners
- `EventSource` en `fetch` zijn beide beschikbaar op iOS 12

## Taakvelden in het formulier

| Veld | Invoer | Opmerking |
|---|---|---|
| Persoon | Radio (EV/JV/JD/MV) | Verplicht |
| Titel | Tekst | Verplicht |
| Datum | Date-input | Standaard: vandaag |
| Tijdslot | Radio (ochtend/middag/avond/leeg) | Optioneel |
| Exacte tijd | Time-input | Optioneel, naast tijdslot |
| Opmerking | Tekst | Optioneel |
| Herhaling | Radio | ad-hoc / dagelijks / om de 2 dagen / schooldagen / wekelijks / maandelijks |
| Subtaken | Dynamische lijst | Toevoegen, verwijderen, volgorde aanpassen |
