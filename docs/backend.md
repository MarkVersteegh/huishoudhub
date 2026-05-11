# Backend

## PocketBase

De backend is [PocketBase](https://pocketbase.io) — een enkelvoudig Go-binair bestand dat biedt:

- SQLite-database
- REST API voor collecties
- Server-Sent Events (SSE) voor realtime updates
- Admin-webinterface op `/_/`
- Ingebouwde backup-API
- Automatische migraties vanuit JS-bestanden

Docker-image: `ghcr.io/muchobien/pocketbase:latest` (community image).

## Configuratie

De backend wordt geconfigureerd via `docker-compose.yml`:

```yaml
environment:
  PB_ADMIN_EMAIL: admin@huishoudhub.local
  PB_ADMIN_PASSWORD: Huishoud2026!
command: ["--migrationsDir=/pb_migrations"]
```

Het entrypoint-script van de image verwerkt `PB_ADMIN_EMAIL` en `PB_ADMIN_PASSWORD` automatisch bij het opstarten.

## API-eindpunten (gebruikt door de frontend)

| Methode | Pad | Functie |
|---|---|---|
| `GET` | `/api/collections/tasks/records` | Taken ophalen (gepagineerd, gesorteerd op datum) |
| `POST` | `/api/collections/tasks/records` | Nieuwe taak aanmaken |
| `PATCH` | `/api/collections/tasks/records/:id` | Taak bijwerken (bijv. afvinken) |
| `DELETE` | `/api/collections/tasks/records/:id` | Taak verwijderen |
| `GET` | `/api/realtime` | SSE-verbinding openen |
| `POST` | `/api/realtime` | Abonneren op een collectie (`{ clientId, subscriptions }`) |
| `GET` | `/api/health` | Healthcheck (gebruikt door Docker) |

## Autorisatie

De `tasks`-collectie heeft volledig open API-regels (geen authenticatie vereist voor lees- en schrijfoperaties). Dit is bewust: de app draait op een thuisnetwerk en authenticatie per gebruiker voegt geen waarde toe voor dit gezinsgebruik.

De admin-interface en backup-API vereisen wel authenticatie (via het `PB_ADMIN_*` account).

## Realtime flow

```
1. Browser opent EventSource → GET /api/realtime
2. PocketBase stuurt PB_CONNECT { clientId: "..." }
3. Browser POST /api/realtime { clientId, subscriptions: ["tasks"] }
4. Bij elke DB-wijziging stuurt PocketBase een SSE-event:
   event: tasks
   data: { action: "create"|"update"|"delete", record: {...} }
5. Browser verwerkt het event en roept render() aan
6. Bij verbindingsverlies: herverbinding na 3 seconden
```

## Migraties

Migraties staan in `pb_migrations/` als JS-bestanden met de PocketBase migrate-API. Ze worden automatisch uitgevoerd bij het opstarten als ze nog niet zijn toegepast.

Bestandsnamen volgen het patroon `{unix-timestamp}_{beschrijving}.js`. Elke migratie bevat een `up`- en een `down`-functie voor terugdraaien.

## Backup

De ingebouwde backup-API (`POST /api/backups`) maakt een zip van de volledige SQLite-database. Backups worden opgeslagen in `/pb_data/backups/` (gemount als Docker-volume, dus direct toegankelijk op de host).

`scripts/backup.ps1` (Windows) en `scripts/backup.sh` (NAS/Linux) automatiseren dit via de API met admin-authenticatie.
