# Changelog

## Unreleased

### Fixed

- **Router admin API login on every scan cycle** — the scanner, the device
  resolver and the Xiaomi API endpoints each built a new MiWiFi client per
  call, so the cached `stok` token was discarded and the router saw a fresh
  login every cycle (~1440 per day at a 60 s interval). One long-lived client
  per router is now shared by all callers. Logins are single-flight, re-login
  happens only on token expiry (30 min) or an auth error, and failed logins
  back off up to 30 min.
- **Scan interval had two sources** — the scanner used `[scanner]
  interval_seconds` from the config file while the settings page edited a
  database value the scanner ignored. The saved setting now drives the scanner
  (re-read every cycle), the config value is the default, and intervals below
  10 s are rejected.
- **HTTP fingerprinting probed every host every cycle** — results, including
  hosts without an HTTP server, are now cached per IP for 24 h; new IPs are
  probed on the next cycle.

### Removed

- **`/settings/vyos` page** — standalone VyOS settings page removed. It was
  orphaned (not linked from the settings hub) and its functionality is fully
  covered by the VyOS tab in `/settings/router`.
- **`/settings/mikrotik` page** — standalone MikroTik settings page removed.
  Its functionality is fully covered by the MikroTik tab in `/settings/router`.
- **Duplicate "MikroTik" card in Settings hub** — the settings hub previously
  listed separate "MikroTik" and "VyOS Router" entries pointing to different
  pages. Consolidated into a single "Router" entry pointing to
  `/settings/router` (which has tabs for both).

### Fixed

- **Dead link on Router page** — the "Configure VyOS" button on the VyOS-not-
  configured state linked to the now-removed `/settings/vyos`; updated to point
  to `/settings/router`.

### Audit notes

Full UI audit performed. All other pages, components, and navigation links are
functional with corresponding backend APIs. No placeholder pages, stub
components, TODO markers, or "coming soon" content found.
