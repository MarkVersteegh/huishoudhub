# Aanbevelingen

Status: ✅ Opgelost · ⚠️ Gedeeltelijk · ❌ Open

---

## Reviewpunten uitgevoerd

- ✅ Paginering: Vandaag/Deze week laden nu alle taakpagina's bij start en stille herlaadacties.
- ✅ Auditlog: nieuwe `task_events` collectie plus `/report/` op audit-events.
- ✅ `done_by`: nieuwe writes gebruiken arrays; legacy comma-strings blijven leesbaar en de migratie converteert bestaande waarden.
- ✅ Subtaaksync: een afgeronde taak wordt heropend als een subtaak weer opengezet wordt.
- ✅ Tests: `npm test` dekt static checks, unitlogica, API-integratie en een browser-smoke-test.
- ✅ Frontendstructuur: `app.js` is opgesplitst met modules onder `pb_public/js/`.

---

## 1. Credentials uit version control ✅

Opgelost: `.env` bevat admin-credentials, `.gitignore` sluit het uit. `docker-compose.yml` leest via `env_file` + `${PB_ADMIN_*}`. `.env.example` staat als template in de repo.

---

## 2. XSS in taakrendering ✅

Opgelost: `esc(str)` helper escapet `&`, `<`, `>`, `"`. Alle `innerHTML`-constructies in `taskCard()`, `compactTaskCard()` en `openTaskDetail()` gebruiken `esc()`.

---

## 3. Geen foutmelding naar de gebruiker ✅

Opgelost: `showError(msg)` hergebruikt `#loadingIndicator` met rode tekst. Aangeroepen bij API-fouten in `loadTasks()`, `loadMoreTasks()`, `saveTask()` en `deleteTask()`.

---

## 4. Form-naar-API mismatch bij herhaling ✅

Opgelost: `repeatRuleFromForm(value)` mapt Dutch form-strings naar `repeat_rule`-JSON. `addTaskFromForm()` maakt eerst een serie aan via `createSeries()` en koppelt de taak via `series_id`.

---

## 5. `pb_public/` handmatig synchroniseren ✅

Opgelost: root-kopieën verwijderd. Frontend-bestanden staan uitsluitend in `pb_public/`. `docs/setup.md` bijgewerkt.

---

## 6. Hard-gelimiteerde paginering ✅

Opgelost: `loadTasks()` en stille herlaadacties halen nu alle PocketBase-pagina's op, zodat Vandaag en Deze week compleet zijn zonder dat de gebruiker eerst door Lijst hoeft te scrollen. `loadMoreTasks()` en `IntersectionObserver` blijven aanwezig als lichte fallback, maar normaal zijn alle taken al geladen.

---

## 7. Volledig opnieuw renderen bij elke wijziging ⚠️

Gedeeltelijk opgelost:
- `render()` slaat inactieve views over — alleen de actieve view wordt herbouwd
- Event listeners zijn verplaatst naar event delegation op `.main` (één blok, buiten `render()`)

Nog open: de actieve view bouwt nog steeds de volledige `innerHTML` opnieuw op bij elke interactie. Op een oude iPad met 200+ geladen taken kan dit bij snelle vinkacties merkbaar zijn. Verdere optimalisatie (diffing, partiële updates) is pas zinvol als dit daadwerkelijk een probleem blijkt.

---

## 8. Tijdzoneprobleem in datumberekening ✅

Opgelost: `todayStr()` en `weekEndStr()` gebruiken `toLocaleDateString("en-CA")` (lokale tijdzone, YYYY-MM-DD formaat).

---

## 9. `repeatLabel()` incompleet voor `weekly.days` ❌

Open: `case "weekly": return rule.days ? "wekelijks" : "wekelijks"` — beide branches geven dezelfde tekst. Een taak die alleen op maandag/vrijdag herhaalt, toont gewoon "wekelijks" zonder de specifieke dagen te benoemen.

---

## 10. Verwijderen van taken ✅

Opgelost: "Verwijderen"-knop op het bewerkingsformulier. Vraagt bevestiging via `confirm()` met taaknaam. `deleteTask(id)` stuurt DELETE naar de API en verwijdert de taak uit de lokale `tasks[]`.

---

## 11. Scope-keuze UI bij bewerken ✅

Opgelost: bij het bewerken van een taak die deel uitmaakt van een serie verschijnt een keuzeoptie "Alleen deze taak" / "Deze en toekomstige". Bij "Deze en toekomstige" toont een `confirm()`-dialoog het aantal taken plus de eerste 5 (datum + titel). Na bevestiging worden alle toekomstige taken gepatcht (titel/personen/tijdstip/opmerking/subtaaksjabloon) en de serie zelf bijgewerkt. De datum van elke taak blijft ongewijzigd; subtaken worden gereset naar ongedaan.

---

## 12. Open API-regels ❌

Open: de `tasks`- en `series`-collecties hebben volledig open rechten. Acceptabel zolang de app alleen binnen het thuisnetwerk bereikbaar is; blocker voor publieke toegang.

---

## Nieuwe issues

### Issue A: Ad-hoc taak naar herhalend bij bewerken ✅

Opgelost: in `addTaskFromForm()` wordt bij bewerken gecontroleerd of de taak geen `series_id` heeft én een herhalingsregel is geselecteerd. In dat geval wordt alsnog een nieuwe serie aangemaakt en `series_id` meegegeven in de PATCH. Taken die al een serie hebben, gebruiken de scope-keuze uit issue #11.

### Issue B: IntersectionObserver guard mist reset bij wisselen van view ✅

Opgelost: `taskLoadingMore = false` wordt gereset in `setView()` wanneer de gebruiker de Lijst-view verlaat.

### Issue C: Subtaken konden afgeronde hoofdtaak openbreken zonder heropenen ✅

Opgelost: als een subtaak weer open wordt gezet terwijl de hoofdtaak afgerond was, wordt de hoofdtaak opnieuw geopend en worden `done_at` en `done_by` leeggemaakt.

### Issue D: Weekweergave miste weekenddagen ✅

Opgelost: de weektab toont nu maandag t/m zondag. Het blok "Afgerond deze week" gebruikt dezelfde maandag-zondag weekrange.
