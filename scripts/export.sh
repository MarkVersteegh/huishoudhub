#!/bin/sh
# Exporteert alle taken naar een JSON-bestand.
# Vereist: curl, python3 (standaard beschikbaar op Synology NAS)
#
# Gebruik:
#   ./export.sh
#   ./export.sh http://192.168.1.50:8090 /volume1/backup/taken.json

BASE_URL="${1:-http://localhost:8090}"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
OUTPUT="${2:-$SCRIPT_DIR/../exports/taken-$TIMESTAMP.json}"

mkdir -p "$(dirname "$OUTPUT")"

# Haal eerste pagina op om totaal te bepalen
FIRST=$(curl -sf "$BASE_URL/api/collections/tasks/records?perPage=500&page=1&sort=date")
if [ -z "$FIRST" ]; then
    echo "Fout: geen verbinding met $BASE_URL"
    exit 1
fi

TOTAL=$(echo "$FIRST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['totalItems'])")
echo "Exporteren van $TOTAL taken..."

# Verzamel alle pagina's en combineer items
python3 - "$BASE_URL" "$OUTPUT" <<'PYEOF'
import sys, json, urllib.request

base_url = sys.argv[1]
output = sys.argv[2]

all_tasks = []
page = 1
while True:
    url = f"{base_url}/api/collections/tasks/records?perPage=500&page={page}&sort=date"
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read())
    items = data.get("items", [])
    for item in items:
        all_tasks.append({
            "id":        item.get("id", ""),
            "series_id": item.get("series_id", ""),
            "persons":   item.get("persons") or [],
            "title":     item.get("title", ""),
            "date":      item.get("date", ""),
            "time":      item.get("time", ""),
            "clock":     item.get("clock", ""),
            "note":      item.get("note", ""),
            "subtasks":  item.get("subtasks") or [],
            "done_at":   item.get("done_at", ""),
            "done_by":   item.get("done_by", ""),
        })
    if len(all_tasks) >= data.get("totalItems", 0):
        break
    page += 1

with open(output, "w", encoding="utf-8") as f:
    json.dump(all_tasks, f, ensure_ascii=False, indent=2)

print(f"Geëxporteerd: {output} ({len(all_tasks)} taken)")
PYEOF
