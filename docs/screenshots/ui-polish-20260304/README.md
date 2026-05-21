# UI Polish Pass — 2026-03-04

Captured with Playwright after the visual polish pass for Dashboard + Devices.

## Desktop (1440×1024)

- Dashboard before: `before-dashboard-desktop.png`
- Dashboard after: `after-dashboard-desktop.png`
- Devices before: `before-devices-desktop.png`
- Devices after: `after-devices-desktop.png`

## Mobile (390×844)

- Dashboard before: `before-dashboard-mobile.png`
- Dashboard after: `after-dashboard-mobile.png`
- Devices before: `before-devices-mobile.png`
- Devices after: `after-devices-mobile.png`

## Table Surface Renewal (Issue #804)

Captured against the production static export served by the Rust app on
`http://127.0.0.1:8080`, with Playwright API route fixtures for populated table
states. Horizontal overflow check returned `0` for each capture.

- QoS desktop (1280×720): `pan31-qos-table-desktop.png`
- NAT desktop (1280×720): `pan31-nat-table-desktop.png`
- Traffic desktop (1280×720): `pan31-traffic-table-desktop.png`
- DNS logs desktop (1280×720): `pan31-dns-logs-table-desktop.png`
- Traffic mobile (390×844): `pan31-traffic-table-mobile.png`
