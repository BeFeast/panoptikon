# Test Environment — LXC Containers on DevBox Proxmox

Setup guide for the Panoptikon test environment. Uses lightweight LXC containers on Proxmox DevBox as real DHCP clients and mDNS devices for testing device discovery, DHCP lease tracking, and mDNS identification.

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

## Notes

- Proxmox API: `https://10.10.0.11:8006` (credentials in Infisical under `/proxmox-devbox`)
- Root password for all containers: `panoptikon-test` (test environment only)
- The containers can be left running permanently as a stable test environment
- Storage: `local-lvm`, 2 GB root disk each
