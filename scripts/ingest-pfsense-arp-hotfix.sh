#!/usr/bin/env bash
set -euo pipefail

# One-shot hotfix ingestor: parse pfSense ARP markdown and push hostnames into
# Panoptikon DB as external hostname source, then apply to unnamed devices.

DB_PATH="${1:-/home/shtrudel/src/panoptikon/panoptikon.db}"
ARP_MD="${2:-/home/shtrudel/.openclaw/workspace/memory/pfsense-arp-2026-03-03.md}"
SOURCE="${SOURCE:-pfsense_arp_2026_03_03}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH" >&2
  exit 1
fi

if [[ ! -f "$ARP_MD" ]]; then
  echo "ARP markdown not found: $ARP_MD" >&2
  exit 1
fi

sqlite3 "$DB_PATH" <<'SQL'
CREATE TABLE IF NOT EXISTS external_hostnames (
    mac         TEXT NOT NULL,
    ip          TEXT,
    hostname    TEXT NOT NULL,
    source      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mac, source)
);
CREATE INDEX IF NOT EXISTS idx_external_hostnames_ip ON external_hostnames(ip);
CREATE INDEX IF NOT EXISTS idx_external_hostnames_source ON external_hostnames(source);
SQL

inserted=0
while IFS='|' read -r _ ip hostname mac _; do
  ip="$(echo "$ip" | xargs)"
  hostname="$(echo "$hostname" | xargs)"
  mac="$(echo "$mac" | xargs | tr '[:upper:]' '[:lower:]')"

  [[ -z "$ip" || -z "$hostname" || -z "$mac" ]] && continue
  [[ "$ip" != 10.* ]] && continue
  [[ "$hostname" == "(unknown)" ]] && continue

  # sqlite escaping for single quotes
  esc_host="${hostname//\'/\'\'}"
  esc_ip="${ip//\'/\'\'}"
  esc_mac="${mac//\'/\'\'}"
  esc_src="${SOURCE//\'/\'\'}"

  sqlite3 "$DB_PATH" "
    INSERT INTO external_hostnames (mac, ip, hostname, source)
    VALUES ('$esc_mac', '$esc_ip', '$esc_host', '$esc_src')
    ON CONFLICT(mac, source) DO UPDATE SET
      ip = excluded.ip,
      hostname = excluded.hostname,
      updated_at = datetime('now');
  "
  inserted=$((inserted + 1))
done < <(grep '^| 10\.' "$ARP_MD")

sqlite3 "$DB_PATH" "
UPDATE devices
SET
    hostname = (
        SELECT eh.hostname
        FROM external_hostnames eh
        WHERE LOWER(eh.mac) = LOWER(devices.mac)
          AND eh.source = '$SOURCE'
        LIMIT 1
    ),
    name = COALESCE(name, (
        SELECT eh.hostname
        FROM external_hostnames eh
        WHERE LOWER(eh.mac) = LOWER(devices.mac)
          AND eh.source = '$SOURCE'
        LIMIT 1
    )),
    is_known = 1,
    updated_at = datetime('now')
WHERE (hostname IS NULL OR TRIM(hostname) = '')
  AND EXISTS (
      SELECT 1
      FROM external_hostnames eh
      WHERE LOWER(eh.mac) = LOWER(devices.mac)
        AND eh.source = '$SOURCE'
  );
"

sqlite3 "$DB_PATH" "
UPDATE devices
SET
    hostname = (
        SELECT eh.hostname
        FROM external_hostnames eh
        JOIN device_ips di ON di.ip = eh.ip
        WHERE di.device_id = devices.id
          AND di.is_current = 1
          AND eh.source = '$SOURCE'
        LIMIT 1
    ),
    name = COALESCE(name, (
        SELECT eh.hostname
        FROM external_hostnames eh
        JOIN device_ips di ON di.ip = eh.ip
        WHERE di.device_id = devices.id
          AND di.is_current = 1
          AND eh.source = '$SOURCE'
        LIMIT 1
    )),
    is_known = 1,
    updated_at = datetime('now')
WHERE (hostname IS NULL OR TRIM(hostname) = '')
  AND EXISTS (
      SELECT 1
      FROM external_hostnames eh
      JOIN device_ips di ON di.ip = eh.ip
      WHERE di.device_id = devices.id
        AND di.is_current = 1
        AND eh.source = '$SOURCE'
  );
"

echo "Inserted/updated source rows: $inserted"
echo "Top enriched devices:"
sqlite3 -header -column "$DB_PATH" "
SELECT di.ip, d.mac, d.hostname
FROM devices d
LEFT JOIN device_ips di ON di.device_id = d.id AND di.is_current = 1
WHERE d.hostname IS NOT NULL AND TRIM(d.hostname) != ''
ORDER BY d.updated_at DESC
LIMIT 20;
"
