# Panoptikon GUI & UX Modernization Plan

**Date:** 2026-02-21
**Inspirations:** Ubiquiti UniFi Web Console & Fing App Dashboard
**Objective:** Evolve Panoptikon's interface into a "Premium Command Center" that merges the highly technical, space-grade aesthetic of UniFi with the intuitive, device-centric visual language of Fing.

---

## 1. Visual Language & Core Aesthetic

### The "UniFi Foundation" (Technical Polish)
- **Deep Dark Mode:** Expand beyond standard `bg-black`. Use deep slate or charcoal backgrounds (e.g., `#1e293b` or `#0f172a`) combined with surface cards (`#1e293b` or `#334155`).
- **Gradients & Neon Accents:** Use subtle, colored gradients for network traffic charts (WAN Rx/Tx). Use sharp, high-contrast neon colors for status indicators (Emerald Green for online, Rose Red for critical offline).
- **Tabular Data Presentation:** Dense but highly legible tables with monospaced (`tabular-nums`) fonts for IP addresses, MAC addresses, and active bandwidth to prevent horizontal layout shift.

### The "Fing Overlay" (Device Intelligence)
- **Visual Identity:** Heavy emphasis on universally recognizable device icons (Laptops, Smart TVs, Phones, IoT Hubs) rather than generic dots.
- **Brand Recognition:** Display manufacturer/vendor names prominently below the device name (e.g., "Apple", "Ubiquiti", "Sonos").
- **Health & Security Scoring:** Visual circles or progress rings indicating network health, device trust score, or open port vulnerabilities.

---

## 2. Key View Redesigns & Upgrades

### A. The Dashboard (The Command Center)
A high-level "single pane of glass" widget layout, avoiding vertical-only scrolling.
- **Top Bar (UniFi style):** "System Health: 99%" with a circular or semi-circular progress bar, active WAN speed test metrics, and total devices online/offline.
- **Traffic sparklines:** A prominent, wide Area Chart (using `Recharts` with `<linearGradient>`) showing WAN traffic over the last 1h/24h.
- **Device Breakdown (Fing style):** A donut chart or bar indicating device categories on the network (e.g., 10 Phones, 5 Computers, 15 IoT devices).
- **Alert Feed Sidebar:** A compact widget on the right displaying the latest network events (Devices dropping offline, new agents reporting).

### B. Device Discovery & List (The Roster)
- **Card vs. List Toggle:** Allow users to switch between a dense UniFi-style data table (ideal for massive homelabs) and a Fing-style rich card grid (better for quick visual scanning).
- **Rich Rows:** Each row should feature:
  - An icon correlating to the vendor/type.
  - Device Name & Vendor.
  - A subtle `[Agent]` badge if telemetery is active.
  - A real-time traffic sparkline for the specific device (if NetFlow data is available).
- **Status Indicators:** Glowing inner rings or pulsing dots (green=online, gray=offline, yellow=warning/high-cpu).

### C. Device Slide-over (Deep Dive)
Instead of navigating away from the list, clicking a device opens a sleek side-drawer (Slide-over component).
- **Header:** Large device icon, editable name, and quick-actions (Wake-on-LAN, Mute Alerts, Copy Install Script).
- **Vulnerability/Scan Tab (Fing style):** A dedicated section highlighting open ports discovered via Nmap, rendered with risk colors (e.g., Port 22 SSH in Yellow, 80 HTTP in Red).
- **Telemetry Tab:** Real-time Agent CPU/Memory graphs mirroring UniFi's "Experience" telemetry graphs.
- **Events Timeline:** A chronological list of when the device joined, went offline, or triggered a high-bandwidth alert.

### D. Interactive Topology Map (The Missing Centerpiece)
- Implement a force-directed graph (via React Flow) showing the central VyOS router connecting out to various switches/subnets and terminal devices.
- **UniFi Experience:** Links (lines) between nodes should be animatable, showing little glowing pulses traveling from the router to the device when bandwidth exceeds a certain threshold.

---

## 3. UI Interactions & Quality of Life

- **Fluid Animations:** Use `framer-motion` to smoothly sequence page loads. Cards shouldn't just appear; they should gently slide up into place with a staggered fade-in.
- **Cmd+K Command Palette:** A global search overlay that blurs the background. Searching "10.0" instantly renders matching IPs, devices, and open alerts with arrow-key navigation.
- **Skeletons, No Spinners:** Content loaders should trace the exact geometric shape of the eventual data (shimmering table rows, skeleton sparklines) rather than utilizing generic loading spinners.
- **Hover Ergonomics:** Cards and list rows should subtly elevate and lighten on cursor hover, indicating interactivity. 

---

## 4. Proposed Technical Stack Alignments (Frontend)

To execute this aesthetic, the following stack additions/updates are recommended:
- **Charting:** `recharts` for fluid, SVG-gradient traffic and CPU/Mem area charts.
- **Topology:** `reactflow` for the interactive, node-based network map.
- **Micro-interactions:** `framer-motion` for staggering list renders and shared-layout transitions.
- **Icons:** `lucide-react` (already present) but supplemented with a custom SVG icon set specifically for distinct device classes (Server, Mobile, Console, IoT).
- **Components:** Deep styling of `shadcn/ui` focusing on `bg-slate-900`/`bg-slate-950` layering, `border-slate-800` borders, and `backdrop-blur-md` for floating elements.
