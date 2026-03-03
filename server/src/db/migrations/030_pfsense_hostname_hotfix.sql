-- Migration 030: external hostname mappings + pfSense ARP hotfix seed
--
-- Purpose:
-- - Provide a lightweight/mock hostname source for immediate production relief
--   when router DHCP integration is not aligned with the actual gateway.
-- - Seed known pfSense ARP hostnames captured on 2026-03-03.
-- - Apply one-shot enrichment to existing devices missing hostnames.

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

-- Seed from /home/shtrudel/.openclaw/workspace/memory/pfsense-arp-2026-03-03.md
-- (only rows with known hostnames).
INSERT INTO external_hostnames (mac, ip, hostname, source)
VALUES
    ('bc:24:11:d6:6b:62', '10.10.0.1',   'pfSense.ok.labs',                       'pfsense_arp_2026_03_03'),
    ('60:be:b4:28:ec:64', '10.10.0.10',  'proxmox.ok.labs',                       'pfsense_arp_2026_03_03'),
    ('bc:24:11:5c:c6:0a', '10.10.0.14',  'openclaw.ok.labs',                      'pfsense_arp_2026_03_03'),
    ('6c:92:bf:5e:c7:e7', '10.10.0.15',  'truenas.ok.labs',                       'pfsense_arp_2026_03_03'),
    ('bc:24:11:bf:35:fb', '10.10.0.22',  'rehearsekit.uk',                        'pfsense_arp_2026_03_03'),
    ('1c:bf:ce:c6:d9:b3', '10.10.0.45',  'mini.ok.labs',                          'pfsense_arp_2026_03_03'),
    ('50:4f:3b:ef:31:a8', '10.10.0.52',  'xiaomi-mesh-2.ok.labs',                 'pfsense_arp_2026_03_03'),
    ('50:4f:3b:ef:2c:3c', '10.10.0.53',  'xiaomi-mesh-3.ok.labs',                 'pfsense_arp_2026_03_03'),
    ('50:4f:3b:ef:2e:80', '10.10.0.54',  'xiaomi-mesh-4.ok.labs',                 'pfsense_arp_2026_03_03'),
    ('e0:f8:47:1a:b4:10', '10.10.0.65',  'roberto-wifi.ok.labs',                  'pfsense_arp_2026_03_03'),
    ('bc:ee:7b:bd:24:92', '10.10.0.66',  'grisha.ok.labs',                        'pfsense_arp_2026_03_03'),
    ('90:e3:ba:02:fc:79', '10.10.0.108', 'FMY9H6302Q.ok.labs',                    'pfsense_arp_2026_03_03'),
    ('a4:50:46:4f:16:47', '10.10.0.110', 'POCOPHONEF1-POCOPHON.ok.labs',          'pfsense_arp_2026_03_03'),
    ('48:7e:48:d6:3c:d1', '10.10.0.115', 'SEI600GO.ok.labs',                      'pfsense_arp_2026_03_03'),
    ('08:5b:d6:df:85:77', '10.10.0.141', 'TLV-KRYSTYNAK.ok.labs',                 'pfsense_arp_2026_03_03'),
    ('ea:35:18:ba:9e:da', '10.10.0.142', 'S25-pol-zovatela-Kristina.ok.labs',     'pfsense_arp_2026_03_03'),
    ('1c:cc:d6:fb:d9:a7', '10.10.0.144', 'Redmi-Note-8-Pro.ok.labs',              'pfsense_arp_2026_03_03'),
    ('1c:bf:ce:a7:81:24', '10.10.0.182', 'antn42.ok.labs',                        'pfsense_arp_2026_03_03'),
    ('e8:bf:e1:0d:6e:ca', '10.10.0.203', 'NOV-EvgeniySa-LT.ok.labs',              'pfsense_arp_2026_03_03')
ON CONFLICT(mac, source) DO UPDATE SET
    ip = excluded.ip,
    hostname = excluded.hostname,
    updated_at = datetime('now');

-- One-shot hotfix application (MAC match first):
UPDATE devices
SET
    hostname = (
        SELECT eh.hostname
        FROM external_hostnames eh
        WHERE LOWER(eh.mac) = LOWER(devices.mac)
          AND eh.source = 'pfsense_arp_2026_03_03'
        LIMIT 1
    ),
    name = COALESCE(name, (
        SELECT eh.hostname
        FROM external_hostnames eh
        WHERE LOWER(eh.mac) = LOWER(devices.mac)
          AND eh.source = 'pfsense_arp_2026_03_03'
        LIMIT 1
    )),
    is_known = 1,
    updated_at = datetime('now')
WHERE (hostname IS NULL OR TRIM(hostname) = '')
  AND EXISTS (
      SELECT 1
      FROM external_hostnames eh
      WHERE LOWER(eh.mac) = LOWER(devices.mac)
        AND eh.source = 'pfsense_arp_2026_03_03'
  );

-- Secondary one-shot hotfix fallback (IP match on current device IP):
UPDATE devices
SET
    hostname = (
        SELECT eh.hostname
        FROM external_hostnames eh
        JOIN device_ips di ON di.ip = eh.ip
        WHERE di.device_id = devices.id
          AND di.is_current = 1
          AND eh.source = 'pfsense_arp_2026_03_03'
        LIMIT 1
    ),
    name = COALESCE(name, (
        SELECT eh.hostname
        FROM external_hostnames eh
        JOIN device_ips di ON di.ip = eh.ip
        WHERE di.device_id = devices.id
          AND di.is_current = 1
          AND eh.source = 'pfsense_arp_2026_03_03'
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
        AND eh.source = 'pfsense_arp_2026_03_03'
  );
