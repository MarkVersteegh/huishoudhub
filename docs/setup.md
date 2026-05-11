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

De app is bereikbaar op http://localhost:8090, de admin-interface op http://localhost:8090/_.

Migraties worden automatisch uitgevoerd bij elke start. Na de eerste keer de taken seeden:

```powershell
.\scripts\seed.ps1
```

Frontend-wijzigingen (`index.html`, `app.js`, `styles.css`) doorkopiëren naar `pb_public/` en de browser refreshen — er is geen buildstap.

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

1. Kopieer de projectmap naar de NAS (bijv. via `scp` of een gedeelde map).
2. Zet de admin-credentials in `docker-compose.yml` of via omgevingsvariabelen.
3. Start met `docker compose up -d`.
4. Stel in de Synology Taakplanner een periodieke backup in via `scripts/backup.sh`.

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
| `scripts/seed.ps1` / `.sh` | Initiële taken importeren uit `data/taken-seed.json` |
| `scripts/export.ps1` / `.sh` | Alle taken exporteren naar JSON |
| `scripts/backup.ps1` / `.sh` | PocketBase DB-backup aanmaken via de API |

Zie de interne help van elk script (`Get-Help .\scripts\seed.ps1`) voor alle parameters.
