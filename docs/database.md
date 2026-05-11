# Database

## Schema

De database bevat één collectie: `tasks`.

| Veld | Type | Verplicht | Beschrijving |
|---|---|---|---|
| `id` | text (PB intern) | — | Unieke identifier, aangemaakt door PocketBase |
| `person` | text | ja | Initialen van de verantwoordelijke persoon: `EV`, `JV`, `JD`, `MV` |
| `title` | text | ja | Naam van de taak |
| `date` | text | ja | ISO-datum (`YYYY-MM-DD`): de (eerstvolgende) uitvoerdatum |
| `time` | text | nee | Tijdslot: `ochtend`, `middag`, `avond` of leeg |
| `clock` | text | nee | Exacte tijd (`HH:MM`) of leeg |
| `note` | text | nee | Vrije opmerking (bijv. "woensdag uit school") |
| `repeat` | text | nee | Herhalingsfrequentie (zie hieronder) |
| `done` | bool | nee | Of de taak afgerond is |
| `subtasks` | json | nee | Array van `{ title: string, done: bool }` |

De PocketBase-interne velden `collectionId`, `collectionName`, `created` en `updated` worden door de frontend genegeerd.

## Herhalingswaarden

| Waarde | Betekenis |
|---|---|
| `ad-hoc` | Eenmalig, geen herhaling |
| `dagelijks` | Elke dag |
| `om de 2 dagen` | Afwisselend (startdatum bepaalt de cyclus) |
| `schooldagen` | Doordeweeks tijdens schoolperiode |
| `wekelijks` | Eén keer per week (weekdag volgt uit `date`) |
| `maandelijks` | Eén keer per maand |

> **Let op:** de herhalingslogica wordt niet door de backend afgehandeld. De `date`-waarde in de database is altijd de *eerstvolgende* geplande datum. Na het afvinken van een herhalende taak moet de datum handmatig of via een script worden bijgewerkt.

## Datumconventie

Het veld `date` bevat de datum waarop de taak de volgende keer verwacht wordt. De frontend gebruikt dit veld om de bucket te berekenen:

- `date < vandaag` → `overdue`
- `date == vandaag` → `now` of `today` (afhankelijk van tijdslot)
- `date` binnen de lopende week → `soon`
- `date` na de lopende week → `future`

## Migratie

Het schema wordt aangemaakt door `pb_migrations/1715000000_create_tasks.js`. De migratie is idempotent: als de collectie al bestaat, wordt ze overgeslagen.

## Seed

`data/taken-seed.json` bevat 30 initiële taken voor het gezin. Importeren:

```powershell
.\scripts\seed.ps1          # Slaat over als er al taken zijn
.\scripts\seed.ps1 -Force   # Voegt toe ook als er al taken zijn
.\scripts\seed.ps1 -Clear   # Verwijdert eerst alles, dan importeren
```

Het JSON-formaat is gelijk aan de API-payload en kan direct als seed of als export worden gebruikt (round-trip).

## Backup en export

| Commando | Resultaat |
|---|---|
| `.\scripts\backup.ps1` | Zip van de volledige SQLite-database in `pb_data/backups/` |
| `.\scripts\export.ps1` | JSON-bestand met alle taken in `exports/` |

De export bevat alleen de inhoudsvelden (geen PocketBase-interne velden) en kan direct als seed worden hergebruikt.
