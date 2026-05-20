# NAS Deployment

HuishoudHub draait op de NAS als Docker Compose-app. PocketBase serveert zowel de REST-API als de statische frontend uit `pb_public/`. De productie-data staat in `pb_data/` en blijft buiten Git.

## 1. GitHub klaarzetten

Op je laptop:

```powershell
npm test
git status
git remote add origin git@github.com:<jij>/HuishoudHub.git
git add .
git commit -m "Prepare NAS deployment"
git push -u origin main
```

Controleer op GitHub dat `.env`, `pb_data/`, `exports/`, `node_modules/` en test-output niet zijn meegekomen.

## 2. NAS voorbereiden

Log in op de NAS via SSH en controleer:

```sh
docker --version
docker compose version
git --version
ssh -T git@github.com
```

Als GitHub SSH nog niet werkt, maak een read-only deploy key:

```sh
ssh-keygen -t ed25519 -C "huishoudhub-nas"
cat ~/.ssh/id_ed25519.pub
```

Voeg de public key toe in GitHub via `Repo -> Settings -> Deploy keys`.

Clone daarna:

```sh
mkdir -p /volume1/docker
cd /volume1/docker
git clone git@github.com:<jij>/HuishoudHub.git huishoudhub
cd huishoudhub
cp .env.example .env
vi .env
docker compose up -d
```

Gebruik in `.env` een sterk admin-wachtwoord:

```env
PB_ADMIN_EMAIL=admin@huishoudhub.local
PB_ADMIN_PASSWORD=<sterk-wachtwoord>
```

Checks:

```sh
docker compose ps
curl -f http://localhost:8090/api/health
curl -I http://localhost:8090/
```

Open daarna:

```text
http://<nas-ip>:8090
http://<nas-ip>:8090/_
http://<nas-ip>:8090/report/
```

## 3. Eerste data en backup

Vanaf je laptop:

```powershell
.\scripts\seed.ps1 -BaseUrl http://<nas-ip>:8090
```

Maak op de NAS een testbackup:

```sh
cd /volume1/docker/huishoudhub
PB_ADMIN_EMAIL=admin@huishoudhub.local PB_ADMIN_PASSWORD='<sterk-wachtwoord>' ./scripts/backup.sh http://localhost:8090 /volume1/backups/huishoudhub
```

Checks:

```sh
ls -lah /volume1/backups/huishoudhub
ls -lah pb_data/backups
```

Gebruik nooit `docker compose down -v`, want dat verwijdert productie-data.

## 4. Automatische updates

Maak het update-script uitvoerbaar:

```sh
cd /volume1/docker/huishoudhub
chmod +x ./scripts/update.sh
PB_ADMIN_EMAIL=admin@huishoudhub.local PB_ADMIN_PASSWORD='<sterk-wachtwoord>' ./scripts/update.sh
```

Maak daarna in DSM een taak:

```text
Control Panel -> Task Scheduler -> Create -> Scheduled Task -> User-defined script
```

Instellingen:

```text
User: root
Schedule: elke 5 of 15 minuten
```

Script:

```sh
export PB_ADMIN_EMAIL=admin@huishoudhub.local
export PB_ADMIN_PASSWORD='<sterk-wachtwoord>'
/volume1/docker/huishoudhub/scripts/update.sh >> /volume1/docker/huishoudhub/update.log 2>&1
```

Checks:

```sh
tail -n 100 /volume1/docker/huishoudhub/update.log
docker compose ps
curl -f http://localhost:8090/api/health
```

## 5. Normale updateflow

Op je laptop:

```powershell
npm test
git status
git add .
git commit -m "Update HuishoudHub"
git push
```

Binnen enkele minuten haalt de NAS de nieuwe commit op, probeert een backup te maken, voert `docker compose up -d` uit en doet een healthcheck.
