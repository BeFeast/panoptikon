# Test Environments — Controller Lab and Gateway Fabric

This document separates the **current** MikroTik Controller lab from the
**planned** isolated Proxmox Gateway fabric. The architecture source of truth is
[`GATEWAY-ARCHITECTURE.md`](./GATEWAY-ARCHITECTURE.md), based on
[#834](https://git.oklabs.uk/BeFeast/panoptikon/issues/834).

## Environment roles and safety boundary

| Environment | Role | Status |
|---|---|---|
| MikroTik CHR + LXC clients described below | Managed-router API, DHCP, VLAN, discovery, and UI validation | **Current** shipped test infrastructure |
| Disposable Proxmox Gateway VM fabric | Native x86 forwarding, Core/routerd, transaction, failure, and recovery validation | **Planned** and currently **blocked** pending provisioning |
| ER605 V1 | Flash, serial, destructive upgrade, and recovery HIL | **Planned** sacrificial hardware only; not the reference appliance |

The working production router and current Controller-mode LXC 115 are protected
infrastructure. They must not be used as Gateway experiment targets, attached to
the destructive fabric, or treated as the Gateway under test. Existing scripts
that deploy or verify LXC 115 describe Controller operations only.

## Planned isolated Proxmox Gateway fabric

The mandatory Gateway development profile uses a disposable VM and synthetic
packet path. It must be possible to destroy and recreate the entire fabric without
touching production networking.

```text
                       Proxmox development host
  +----------------------------------------------------------------+
  | isolated management bridge                                     |
  |   test runner / Core observer ---- mTLS or console ----+        |
  |                                                        |        |
  | synthetic WAN bridge       Gateway VM                  | OOB    |
  | upstream peer -------- WAN [core + separate routerd] LAN ----+  |
  |                              | Linux/Netlink adapter          |  |
  |                              +--------------------------+     |  |
  | synthetic LAN bridge                                   |     |  |
  | client A / client B / service peer ---------------------+     |  |
  |                                                              |  |
  | independent recovery console --------------------------------+  |
  +----------------------------------------------------------------+

  No bridge or route to the working production router or LXC 115.
```

Required properties:

- Separate WAN, LAN, management, and out-of-band recovery networks.
- Synthetic upstream and client peers that can assert packet delivery, loss,
  NAT/firewall effects, DNS/DHCP behavior, and management reachability.
- Failure injection for Core, routerd, transport, VM power, interface, and partial
  transaction loss.
- Snapshot/rebuild support so every destructive test begins from a known state.
- Packet capture at both sides of the Gateway, with monotonic timestamps and the
  transaction ID recorded in test evidence.
- No route, bridge, credentials, or automated mutation path to production targets.

Provisioning for this fabric is **planned**. Until it exists and the failure matrix
in [`test-plan.md`](./test-plan.md) passes, native Gateway forwarding and
commit-confirm remain **blocked** from release claims.

## Current MikroTik Controller lab

The remainder of this guide documents the existing environment. It uses
lightweight LXC containers on Proxmox DevBox as real DHCP clients and mDNS devices
for testing device discovery, DHCP lease tracking, and mDNS identification. It
must continue to work while Gateway development proceeds.

## Why LXC Containers?

- Static DHCP leases don't test the discovery logic end-to-end
- Mock data doesn't exercise the real network stack
- LXC containers are real DHCP clients with real ARP entries and real mDNS announcements
- Lightweight: each container uses 128–512 MB RAM

## Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Proxmox Host (DevBox 10.10.0.11)                               │
│                                                                 │
│  ┌──────────────────┐     vmbr0 (10.10.0.0/24)                 │
│  │ MikroTik CHR     │◄────────────────┐                        │
│  │ 10.10.0.125      │                 │                        │
│  │ (DHCP / gateway)  │    ┌────────────┼────────────┐           │
│  └──────────────────┘    │            │            │           │
│                          │            │            │           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ test-alpine  │  │ test-ubuntu  │  │ test-debian  │         │
│  │ CT 201       │  │ CT 202       │  │ CT 203       │         │
│  │ DHCP         │  │ DHCP         │  │ DHCP         │         │
│  │ 128MB / 1CPU │  │ 512MB / 1CPU │  │ 512MB / 1CPU │         │
│  │ Alpine       │  │ Ubuntu 22.04 │  │ Debian 12    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│          │                │                │                    │
│          └────────────────┼────────────────┘                    │
│                      DNS queries                                │
│                           ▼                                     │
│  ┌──────────────────────────────────┐                           │
│  │ Panoptikon          CT 115      │                           │
│  │ 10.10.0.22:8080  (dashboard)    │                           │
│  │ 10.10.0.22:53   (Unbound DNS)  │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Proxmox VE** host (DevBox 10.10.0.11) with `pct` available
- **MikroTik CHR** VM already running at `10.10.0.125` with:
  - RouterOS 7+ installed
  - REST API enabled (`/ip/service set api-ssl address=10.10.0.0/24`)
  - DHCP server configured on the `10.10.0.0/24` subnet
  - Bridge `vmbr0` connected to the MikroTik interface
- LXC templates: Alpine, Ubuntu 22.04, Debian 12 (scripts download automatically if missing)

## Container Details

| CTID | Hostname     | OS           | RAM   | Disk | Purpose                                   |
|------|--------------|--------------|-------|------|-------------------------------------------|
| 201  | test-alpine  | Alpine       | 128MB | 2GB  | Minimal Linux — basic DHCP lease discovery |
| 202  | test-ubuntu  | Ubuntu 22.04 | 512MB | 2GB  | mDNS via avahi-daemon                      |
| 203  | test-debian  | Debian 12    | 512MB | 2GB  | Different vendor fingerprint               |

All containers:
- Get their IP via DHCP from MikroTik (no static assignments)
- Are connected to `vmbr0` (same LAN as Panoptikon)
- Run `avahi-daemon` for mDNS `.local` name announcements
- Have hostname visible in MikroTik DHCP leases
- Start on boot (`onboot: 1`)
- Use unprivileged mode for security

## Quick Start

### 1. Create the containers

```bash
scp scripts/test-env/setup-lxc.sh root@10.10.0.11:/tmp/
ssh root@10.10.0.11 bash /tmp/setup-lxc.sh
```

The script is idempotent — running it again skips existing containers and ensures they're started.

### 2. Verify the environment

```bash
scp scripts/test-env/verify-lxc.sh root@10.10.0.11:/tmp/
ssh root@10.10.0.11 bash /tmp/verify-lxc.sh
```

This checks:
- All containers are running
- Each container has a DHCP lease
- avahi-daemon is running (for mDNS)
- mDNS `.local` names resolve
- Containers can reach MikroTik gateway

### 3. Tear down (optional)

```bash
scp scripts/test-env/teardown-lxc.sh root@10.10.0.11:/tmp/
ssh root@10.10.0.11 bash /tmp/teardown-lxc.sh
```

This stops and destroys all 3 containers.

## MikroTik CHR Setup

If the MikroTik CHR VM is not yet configured, follow these steps from the RouterOS terminal:

```routeros
# 1. Enable REST API
/ip service set api-ssl disabled=no address=10.10.0.0/24

# 2. Create a bridge for the test network (if not already present)
/interface bridge add name=bridge-test

# 3. Add IP address to the bridge
/ip address add address=10.10.0.125/24 interface=bridge-test

# 4. Configure DHCP server for the test subnet
/ip pool add name=test-pool ranges=10.10.0.200-10.10.0.254
/ip dhcp-server add name=test-dhcp interface=bridge-test address-pool=test-pool
/ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.125 dns-server=10.10.0.22

# 5. Enable masquerade for internet access (if the CHR has WAN)
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade

# 6. Create a test VLAN (for VLAN integration testing)
/interface vlan add name=vlan100-test vlan-id=100 interface=bridge-test
/ip address add address=10.10.100.1/24 interface=vlan100-test
```

### Create a Panoptikon API user (recommended)

```routeros
/user add name=panoptikon password=panoptikon-test group=read
```

## DNS Setup (Unbound on LXC 115)

Panoptikon runs Unbound as a network-wide DNS resolver on LXC 115 (`10.10.0.22`). The setup script configures test containers to use it automatically.

### MikroTik DHCP — hand out Unbound as DNS

If test containers use DHCP (instead of static IPs), update the MikroTik DHCP network to hand out Panoptikon's Unbound:

```routeros
# Update existing DHCP network to use Panoptikon DNS
/ip dhcp-server network set [find address="10.10.0.0/24"] dns-server=10.10.0.22
```

### Verify DNS from a test client

```bash
# External DNS forwarding (should resolve via Unbound -> root hints)
pct exec 201 -- sh -c "nslookup google.com 10.10.0.22"

# Verify the container's default resolver is Unbound
pct exec 202 -- bash -c "dig google.com +short"
```

## Verification in Panoptikon

After the containers are running, verify in Panoptikon:

1. **Devices page** — 3 new devices should appear (may take up to 60s for the next scan cycle)
2. **Hostnames** — `test-alpine`, `test-ubuntu`, `test-debian` pulled from MikroTik DHCP leases
3. **mDNS names** — `test-ubuntu.local` and `test-debian.local` visible for Ubuntu/Debian containers
4. **Device identification** — each container should be identified with its OS type

### API check

```bash
# Check MikroTik DHCP leases (should include test-* hostnames)
curl -sb cookies.txt http://localhost:8080/api/v1/mikrotik/dhcp-leases | \
  jq '.[] | select(.host_name | startswith("test-"))'
```

## Validation Scenarios

### 1. DHCP Lease Tracking

**Goal:** Verify Panoptikon discovers containers via MikroTik DHCP leases.

```bash
# On the Proxmox host — restart a container to trigger DHCP
pct stop 201 && pct start 201

# In Panoptikon UI -> Devices page
# Expect: test-alpine appears with a DHCP-assigned IP, source "DHCP"
```

### 2. mDNS Discovery

**Goal:** Verify containers with avahi-daemon are discovered via mDNS.

```bash
# From any machine on the LAN with avahi-browse:
avahi-browse -art | grep test-

# Expected: test-ubuntu.local and test-debian.local entries appear
# test-alpine.local should also appear (avahi installed by setup script)
```

### 3. Device Identification (Vendor Fingerprint)

**Goal:** Verify Panoptikon correctly identifies different OS types.

The three containers present different DHCP vendor class identifiers:
- Alpine: minimal dhclient fingerprint
- Ubuntu 22.04: standard Ubuntu dhclient
- Debian 12: Debian-specific dhclient

Check the Panoptikon Devices page — each device should show the correct OS in its identification details.

### 4. Firewall Rule Testing

**Goal:** Verify Panoptikon can manage firewall rules that affect test containers.

```routeros
# Add a test firewall rule on MikroTik
/ip firewall filter add chain=forward src-address=10.10.0.202 action=drop comment="block-test-ubuntu"
```

```bash
# In Panoptikon UI -> Router -> Firewall tab
# Expect: "block-test-ubuntu" rule visible

# Verify container is blocked
pct exec 202 -- bash -c "ping -c2 8.8.8.8"  # Should fail

# Clean up
# /ip firewall filter remove [find comment="block-test-ubuntu"]
```

### 5. ARP Discovery

**Goal:** Verify containers appear via ARP scanning (not just DHCP).

```bash
# Generate ARP traffic
pct exec 201 -- sh -c "ping -c3 10.10.0.125"
pct exec 202 -- bash -c "ping -c3 10.10.0.125"
pct exec 203 -- bash -c "ping -c3 10.10.0.125"

# Check Panoptikon API — all three should be present
curl -sb cookies.txt http://localhost:8080/api/v1/devices | jq '.[].ip' | sort
```

## Troubleshooting

| Problem | Check |
|---------|-------|
| Containers can't reach gateway | `pct exec 201 -- ping 10.10.0.125` — verify bridge connectivity |
| No DHCP leases on MikroTik | Verify DHCP server is running: `/ip dhcp-server print` |
| Panoptikon doesn't see containers | Verify ARP scanner subnet includes `10.10.0.0/24` in `panoptikon.toml` |
| REST API connection refused | Check MikroTik: `/ip service print` — api-ssl should be enabled |
| Containers have no internet | Check NAT masquerade: `/ip firewall nat print` |
| mDNS not working | Verify avahi-daemon: `pct exec 202 -- systemctl status avahi-daemon` |
| DNS queries to 10.10.0.22 fail | Verify Unbound container is running: `docker compose ps unbound` |
| DNS queries timeout | Check CT 115 firewall allows port 53: `cat /etc/pve/firewall/115.fw` |

## Cleanup

```bash
# Remove all test containers
scp scripts/test-env/teardown-lxc.sh root@10.10.0.11:/tmp/
ssh root@10.10.0.11 bash /tmp/teardown-lxc.sh

# Remove MikroTik test rules (from RouterOS terminal)
/ip firewall filter remove [find comment~"block-test"]
/user remove panoptikon
```

---

## VLAN 20 Test Environment

A dedicated VLAN 20 environment for validating Panoptikon's VLAN integration: device discovery by VLAN, DHCP lease tracking on tagged networks, and VLAN management via the API (test cases M-80 through M-83).

### VLAN 20 Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Proxmox Host (DevBox 10.10.0.11)                               │
│                                                                 │
│  ┌──────────────────┐                                           │
│  │ MikroTik CHR     │     vmbr0                                 │
│  │ 10.10.0.125      │◄─────────────────────────┐               │
│  │ (main LAN gw)    │                           │               │
│  │                  │     VLAN 20 (802.1Q)      │               │
│  │ 10.20.0.1/24     │◄───────────────┐          │               │
│  │ (VLAN 20 gw)     │               │          │               │
│  └──────────────────┘               │          │               │
│                                     │          │               │
│           VLAN 20 tagged            │   main LAN untagged      │
│         ┌───────────────────────────┤          │               │
│         │                           │          │               │
│  ┌──────────────┐        ┌──────────────┐  ┌──────────────┐   │
│  │ test-vlan20-a│        │ test-vlan20-b│  │ (CT 201-203) │   │
│  │ CT 204       │        │ CT 205       │  │ main LAN     │   │
│  │ DHCP (VLAN20)│        │ DHCP (VLAN20)│  │ containers   │   │
│  │ 256MB        │        │ 128MB        │  │              │   │
│  │ Debian 12    │        │ Alpine       │  │              │   │
│  └──────────────┘        └──────────────┘  └──────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────┐                           │
│  │ Panoptikon          CT 115      │                           │
│  │ 10.10.0.22:8080  (dashboard)    │                           │
│  │ 10.10.0.22:53   (Unbound DNS)  │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### VLAN 20 Container Details

| CTID | Hostname       | OS       | RAM   | Disk | VLAN | IP Range          | Purpose                          |
|------|----------------|----------|-------|------|------|-------------------|----------------------------------|
| 204  | test-vlan20-a  | Debian 12| 256MB | 2GB  | 20   | 10.20.0.100–200   | VLAN client — DHCP discovery     |
| 205  | test-vlan20-b  | Alpine   | 128MB | 2GB  | 20   | 10.20.0.100–200   | VLAN client — minimal footprint  |

### VLAN 20 MikroTik Configuration

| Resource               | Name             | Value                        |
|------------------------|------------------|------------------------------|
| VLAN interface         | `vlan20-test`    | VLAN ID 20 on `bridge-test`  |
| IP address             | —                | `10.20.0.1/24`               |
| DHCP pool              | `vlan20-pool`    | `10.20.0.100–10.20.0.200`    |
| DHCP server            | `vlan20-dhcp`    | on `vlan20-test` interface   |
| DHCP network           | —                | `10.20.0.0/24`, gw=`10.20.0.1`, dns=`10.10.0.22` |

### VLAN 20 Quick Start

#### 1. Configure VLAN 20 on MikroTik (from any machine)

```bash
# Set environment variables
export PANOPTIKON_PASS="your-password"
export MIKROTIK_PASS="your-password"

# Create VLAN 20 + DHCP via Panoptikon & MikroTik APIs
bash scripts/test-env/setup-vlan20.sh
```

This creates the VLAN 20 interface on MikroTik via Panoptikon API (test M-81), then
configures DHCP pool/server/network via the MikroTik REST API directly.

#### 2. Create LXC containers on VLAN 20 (on Proxmox host)

```bash
scp scripts/test-env/setup-vlan20-lxc.sh root@10.10.0.11:/tmp/
ssh root@10.10.0.11 bash /tmp/setup-vlan20-lxc.sh
```

Creates CT 204 and CT 205 with `tag=20` on their network interface, so all traffic
is 802.1Q-tagged with VLAN 20. They get DHCP leases from the `vlan20-dhcp` server.

#### 3. Verify the VLAN 20 environment

```bash
export PANOPTIKON_PASS="your-password"
export MIKROTIK_PASS="your-password"

# Full verification including M-82/M-83 API tests
bash scripts/test-env/verify-vlan20.sh

# Skip destructive API tests (M-82 rename, M-83 delete/recreate)
SKIP_API_TESTS=1 bash scripts/test-env/verify-vlan20.sh
```

Checks:
- VLAN 20 exists on MikroTik (via Panoptikon API)
- DHCP pool/server configured correctly
- Containers are running with VLAN 20 IPs (10.20.0.x)
- DHCP leases appear in Panoptikon
- VLAN rename (M-82) and delete/recreate (M-83) work

#### 4. Tear down

```bash
# Destroy containers (on Proxmox host)
ssh root@10.10.0.11 bash /tmp/teardown-vlan20.sh --lxc

# Remove MikroTik VLAN config (from anywhere)
export PANOPTIKON_PASS="your-password"
export MIKROTIK_PASS="your-password"
bash scripts/test-env/teardown-vlan20.sh --mikrotik

# Or destroy everything at once
bash scripts/test-env/teardown-vlan20.sh --all
```

### VLAN 20 Test Cases

| # | Test Case | Method | Expected Result |
|---|-----------|--------|-----------------|
| M-80 | List VLANs | `GET /api/v1/mikrotik/vlans` | Returns VLAN 20 in list |
| M-81 | Create VLAN | `POST /api/v1/mikrotik/vlans` | VLAN 20 created on MikroTik |
| M-82 | Update VLAN | `PUT /api/v1/mikrotik/vlans/:id` | VLAN renamed, verified, renamed back |
| M-83 | Delete VLAN | `DELETE /api/v1/mikrotik/vlans/:id` | VLAN removed, confirmed absent |

### VLAN 20 API Verification

```bash
# Login
curl -c cookies.txt -X POST http://10.10.0.22:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}'

# List VLANs (M-80) — should include vlan20-test
curl -b cookies.txt http://10.10.0.22:8080/api/v1/mikrotik/vlans | jq .

# Check DHCP leases — filter for VLAN 20 subnet
curl -b cookies.txt http://10.10.0.22:8080/api/v1/mikrotik/dhcp-leases | \
  jq '[.[] | select(.address | startswith("10.20.0."))]'
```

### VLAN 20 Troubleshooting

| Problem | Check |
|---------|-------|
| Containers don't get 10.20.0.x IPs | Verify VLAN tag: `pct config 204 \| grep net0` should show `tag=20` |
| DHCP leases not showing | Check MikroTik: `/ip dhcp-server print` — `vlan20-dhcp` should be running |
| Containers can't reach 10.20.0.1 | Verify VLAN interface has IP: `/ip address print where interface=vlan20-test` |
| VLAN not visible in Panoptikon | Check MikroTik REST API: `curl -sk -u admin:pass https://10.10.0.125/rest/interface/vlan` |
| API returns 401 | Re-authenticate: POST `/api/v1/auth/login` |

---

## Notes

- Proxmox API: `https://10.10.0.11:8006` (credentials in Infisical under `/proxmox-devbox`)
- Root password for all containers: `panoptikon-test` (test environment only)
- The containers can be left running permanently as a stable test environment
- Storage: `local-lvm`, 2 GB root disk each
- VLAN 20 containers (CT 204–205) are separate from main LAN containers (CT 201–203)
