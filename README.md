# HuishoudHub

HuishoudHub is een eenvoudige huishoudtaken-app voor een gezin van vier. PocketBase levert de REST-API, realtime updates, SQLite-opslag en de statische frontend uit `pb_public/`.

## Snel Starten

Start lokaal met de PocketBase binary:

```powershell
.\pocketbase.exe serve --dir=pb_data --migrationsDir=pb_migrations --publicDir=pb_public
```

Open daarna:

- App: http://localhost:8090
- Report: http://localhost:8090/report/
- Admin: http://localhost:8090/_

Na een lege installatie kun je de startdata laden:

```powershell
.\scripts\seed.ps1
```

## Tests

```powershell
npm test
```

Voor de volledige browserflow op desktop, tablet en mobiel:

```powershell
npm run test:all
```

## NAS Deployment

De aanbevolen productieflow is GitHub + Docker Compose op de NAS:

```sh
git clone git@github.com:<jij>/HuishoudHub.git huishoudhub
cd huishoudhub
cp .env.example .env
docker compose up -d
```

Automatische updates lopen via `scripts/update.sh` in Synology Taakplanner. Zie [docs/nas-deployment.md](docs/nas-deployment.md) voor het complete stappenplan met checks en backups.

Handmatig direct verversen op de NAS:

```sh
cd /volume1/docker/huishoudhub
./scripts/refresh.sh
```

## Belangrijke Mappen

| Pad | Inhoud |
|---|---|
| `pb_public/` | Frontend en reportpagina |
| `pb_migrations/` | PocketBase schema-migraties |
| `pb_data/` | Lokale database en backups, niet committen |
| `scripts/` | Seed, export, backup en NAS-update scripts |
| `docs/` | Setup, backend, frontend, database en deploymentdocumentatie |

Gebruik nooit `docker compose down -v` op productie; daarmee verwijder je de database.
