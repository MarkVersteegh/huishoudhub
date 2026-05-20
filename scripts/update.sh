#!/bin/sh
# Haalt de nieuwste HuishoudHub-code op de NAS op en herstart Docker Compose
# alleen wanneer er daadwerkelijk een nieuwe commit op de ingestelde branch staat.
#
# Gebruik op de NAS:
#   ./scripts/update.sh
#
# Optionele omgevingsvariabelen:
#   APP_DIR=/volume1/docker/huishoudhub
#   BRANCH=main
#   BACKUP_DIR=/volume1/backups/huishoudhub
#   BASE_URL=http://localhost:8090
#   PB_ADMIN_EMAIL=admin@huishoudhub.local
#   PB_ADMIN_PASSWORD=...

set -eu

APP_DIR="${APP_DIR:-/volume1/docker/huishoudhub}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/volume1/backups/huishoudhub}"
BASE_URL="${BASE_URL:-http://localhost:8090}"

cd "$APP_DIR"

echo "[$(date)] HuishoudHub update check"

git fetch origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Geen update."
  exit 0
fi

echo "Update gevonden: $LOCAL -> $REMOTE"

if [ -n "${PB_ADMIN_EMAIL:-}" ] && [ -n "${PB_ADMIN_PASSWORD:-}" ]; then
  ./scripts/backup.sh "$BASE_URL" "$BACKUP_DIR" || echo "Backup mislukt, update gaat door."
else
  echo "Geen PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD gezet; backup overgeslagen."
fi

git pull --ff-only origin "$BRANCH"
docker compose up -d --remove-orphans

echo "Healthcheck..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$BASE_URL/api/health" >/dev/null; then
    echo "Gezond: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 3
done

echo "Healthcheck mislukt na update."
docker compose ps
exit 1
