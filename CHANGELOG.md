# Changelog

## Unreleased

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
