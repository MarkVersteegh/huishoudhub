# Setup

HuishoudHub is een huishoudtakenbeheerder voor een gezin van vier (EV, JV, JD, MV).
De frontend is een enkelvoudige HTML/CSS/JS-pagina zonder buildstap. De backend is PocketBase — een enkelvoudig Go-binair bestand met SQLite en ingebouwde REST-API.

## Architectuuroverzicht

```
browser (iOS/desktop/mobiel)
        │  HTTP + SSE
        ▼
  PocketBase :8090
  ├── REST API   /api/collections/tasks/records
  ├── REST API   /api/collections/series/records
  ├── REST API   /api/collections/task_events/records
  ├── Realtime   /api/realtime  (Server-Sent Events)
  ├── Admin UI   /_/
  └── Statische bestanden uit /pb_public/
        │
        ▼
  SQLite — /pb_data/data.db  (gemount als Docker volume)
```

## Lokaal draaien (aanbevolen: PocketBase binary)

Download `pocketbase.exe` (Windows AMD64) van [github.com/pocketbase/pocketbase/releases](https://github.com/pocketbase/pocketbase/releases) en zet het in de projectmap. Start daarna:

```powershell
.\pocketbase.exe serve --dir=pb_data --migrationsDir=pb_migrations --publicDir=pb_public
```

De app is bereikbaar op http://localhost:8090, het rapport op http://localhost:8090/report/ en de admin-interface op http://localhost:8090/_.

Migraties worden automatisch uitgevoerd bij elke start. Na de eerste keer de reeksen en taakinstanties seeden:

```powershell
.\scripts\seed.ps1
```

Frontend-bestanden (`index.html`, `app.js`, `styles.css` en `js/*.js`) staan rechtstreeks in `pb_public/`. Bewerk ze daar; er is geen buildstap en geen kopieerstap nodig.

> Zorg dat de versie van `pocketbase.exe` overeenkomt met de Docker image die op de NAS draait:
> ```powershell
> .\pocketbase.exe --version
> docker run --rm ghcr.io/muchobien/pocketbase:latest --version
> ```

## Lokaal draaien via Docker

Vereiste: Docker Desktop.

```powershell
docker compose up -d
```

## Deployment op NAS (Synology)

Aanbevolen: zet de code op GitHub, clone de repo op de NAS en laat Synology Taakplanner periodiek `scripts/update.sh` draaien. Zo wordt een `git push` vanaf je laptop automatisch live op de NAS.

Zie [NAS Deployment](nas-deployment.md) voor het volledige stappenplan.

## Volumes en datapersistentie

| Host-pad | Container-pad | Inhoud |
|---|---|---|
| `./pb_data` | `/pb_data` | SQLite-database, backups |
| `./pb_public` | `/pb_public` | Frontend-bestanden (HTML/CSS/JS) |
| `./pb_migrations` | `/pb_migrations` | Schema-migraties (JS) |

Data overleeft `docker compose down` + `docker compose up`. Gebruik **nooit** `docker compose down -v` — dit verwijdert het volume inclusief alle data.

## Beheerscripts

| Script | Functie |
|---|---|
| `scripts/seed.ps1` | Initiële reeksen en taken importeren uit `data/series-seed.json` |
| `scripts/export.ps1` / `.sh` | Alle taakinstanties exporteren naar JSON in het actuele schema |
| `scripts/backup.ps1` / `.sh` | PocketBase DB-backup aanmaken via de API; gebruikt `PB_ADMIN_EMAIL` en `PB_ADMIN_PASSWORD` |
| `scripts/update.sh` | NAS-update: `git pull`, optionele backup, `docker compose up -d` en healthcheck |

Zie de interne help van elk script (`Get-Help .\scripts\seed.ps1`) voor alle parameters.

## Tests

De herhaalbare testset gebruikt een geïsoleerde PocketBase testdatabase in `tests/.tmp/pb_data` op poort `8091`. De echte `pb_data` en de draaiende app op `8090` worden niet gebruikt of aangepast.

Playwright gebruikt de lokaal geïnstalleerde Chrome (`channel: chrome`). Er is dus geen aparte browserdownload nodig zolang Chrome aanwezig is.

Hoogover controleert de suite vier lagen:

- **Static checks**: JavaScript-syntax, correcte modulebestanden en het juiste MIME-type voor browsermodules. Dit vangt regressies zoals `.mjs` als `text/plain`.
- **Unit tests**: pure frontendlogica zoals datumbuckets, filters, multi-select, `done_by`, afrondkleuren, subtaken en auditpayloads.
- **API/integratie**: een geïsoleerde PocketBase met echte REST-calls voor taken, afronden, `done_at`, meerdere afronders, audit-events en de reportpagina.
- **Browserflows**: Chrome opent de app zoals een gebruiker dat doet en test Vandaag, Deze week, Lijst, taakdetails, CRUD, subtaken, dark theme, report en desktop/tablet/mobile viewports.

Aanbevolen na iedere wijziging:

```powershell
npm test
```

Volledige suite inclusief alle desktop/tablet/mobile UI-flows:

```powershell
npm run test:all
```

Losse suites:

| Command | Dekking |
|---|---|
| `npm run test:static` | Syntaxchecks, MIME-check voor JS-modules, basis HTML-check |
| `npm run test:unit` | Datum-buckets, filters, `done_by`, afrondkleuren, subtaken, auditpayloads |
| `npm run test:api` | PocketBase CRUD, `done_at`, `done_by`, `task_events`, report HTML |
| `npm run test:smoke` | App start in Chrome, taken laden, geen console errors |
| `npm run test:e2e` | Vandaag, Deze week, Lijst, details, subtaken, dark theme en report op desktop/tablet/mobile |
