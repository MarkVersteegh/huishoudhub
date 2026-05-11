#!/bin/sh
# Maakt een PocketBase DB-backup via de API.
# Vereist: curl, python3 (standaard beschikbaar op Synology NAS)
#
# Gebruik:
#   ./backup.sh
#   ./backup.sh http://192.168.1.50:8090 admin@huishoudhub.local Huishoud2026! /volume1/backup/huishoudhub

BASE_URL="${1:-http://localhost:8090}"
ADMIN_EMAIL="${2:-admin@huishoudhub.local}"
ADMIN_PASSWORD="${3:-Huishoud2026!}"
COPY_TO="${4:-}"

TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)
BACKUP_NAME="huishoudhub-$TIMESTAMP.zip"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

python3 - "$BASE_URL" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$BACKUP_NAME" "$COPY_TO" "$SCRIPT_DIR" <<'PYEOF'
import sys, json, urllib.request, urllib.error, time, shutil, os

base_url, email, password, backup_name, copy_to, script_dir = sys.argv[1:]

# Authenticeer (probeer nieuw endpoint, daarna oud)
auth_body = json.dumps({"identity": email, "password": password}).encode()
for endpoint in [
    f"{base_url}/api/collections/_superusers/auth-with-password",
    f"{base_url}/api/admins/auth-with-password",
]:
    try:
        req = urllib.request.Request(endpoint, data=auth_body,
              headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            auth = json.loads(r.read())
        break
    except urllib.error.HTTPError:
        continue
else:
    print("Authenticatie mislukt — controleer e-mail en wachtwoord.")
    sys.exit(1)

token = auth["token"]

# Trigger backup
req = urllib.request.Request(
    f"{base_url}/api/backups",
    data=json.dumps({"name": backup_name}).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(req) as r:
    pass

print(f"Backup aangemaakt: {backup_name}")
time.sleep(2)

# Optioneel kopiëren
if copy_to:
    src = os.path.join(script_dir, "..", "pb_data", "backups", backup_name)
    src = os.path.normpath(src)
    if os.path.exists(src):
        os.makedirs(copy_to, exist_ok=True)
        dest = os.path.join(copy_to, backup_name)
        shutil.copy2(src, dest)
        print(f"Gekopieerd naar: {dest}")
    else:
        print(f"Waarschuwing: backup-bestand niet gevonden op host: {src}")
PYEOF
