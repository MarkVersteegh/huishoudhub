#!/bin/sh
# Handmatige NAS-refresh: haal de nieuwste code op en zorg dat Docker Compose
# de actuele bestanden/containerconfig gebruikt.
#
# Gebruik op de NAS:
#   ./scripts/refresh.sh
#
# Optionele omgevingsvariabelen:
#   APP_DIR=/volume1/docker/huishoudhub
#   BRANCH=main
#   BASE_URL=http://localhost:8090

set -eu

APP_DIR="${APP_DIR:-/volume1/docker/huishoudhub}"
BRANCH="${BRANCH:-main}"
BASE_URL="${BASE_URL:-http://localhost:8090}"

cd "$APP_DIR"

echo "[$(date)] HuishoudHub refresh"
echo "Werkmap: $APP_DIR"
echo "Branch: $BRANCH"

echo "Nieuwste code ophalen..."
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "Code is bijgewerkt naar $(git rev-parse --short HEAD)."

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
elif command -v sudo >/dev/null 2>&1; then
  DOCKER_COMPOSE="sudo docker compose"
else
  DOCKER_COMPOSE="docker compose"
fi

$DOCKER_COMPOSE up -d --remove-orphans

echo "Healthcheck..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$BASE_URL/api/health" >/dev/null; then
    echo "Live: $BASE_URL"
    echo "Versie: $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 3
done

echo "Healthcheck mislukt."
$DOCKER_COMPOSE ps
exit 1
