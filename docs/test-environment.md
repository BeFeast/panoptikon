# MikroTik Test Environment

Setup guide for the Panoptikon MikroTik integration test environment. Uses 2-3 lightweight LXC containers on Proxmox with a MikroTik CHR instance as the gateway.

## Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Proxmox Host                                                   │
│                                                                 │
│  ┌──────────────────┐     vmbr0 (10.10.0.0/24)                 │
│  │ MikroTik CHR     │◄────────────────┐                        │
│  │ 10.10.0.125      │                 │                        │
│  │ (gateway/router)  │    ┌────────────┼────────────┐           │
│  └──────────────────┘    │            │            │           │
│                          │            │            │           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ pan-test-web │  │ pan-test-db  │  │ pan-test-iot │         │
│  │ CT 200       │  │ CT 201       │  │ CT 202       │         │
│  │ .200         │  │ .201         │  │ .202         │         │
│  │ 256MB / 1CPU │  │ 256MB / 1CPU │  │ 128MB / 1CPU │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────────┐                                           │
│  │ Panoptikon       │                                           │
│  │ 10.10.0.14:8080  │  (monitoring all of the above)           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Proxmox VE** host (Forge/DevBox) with `pct` available
- **MikroTik CHR** VM already running at `10.10.0.125` with:
  - RouterOS 7+ installed
  - REST API enabled (`/ip/service set api-ssl address=10.10.0.0/24`)
  - DHCP server configured on the `10.10.0.0/24` subnet
  - Bridge `vmbr0` connected to the MikroTik interface
- **Debian 12 LXC template** available (script downloads automatically if missing)

## Quick Start

```bash
# Create the test containers (run on Proxmox host)
sudo bash scripts/setup-test-env.sh create

# Check status
sudo bash scripts/setup-test-env.sh status

# Tear down when done
sudo bash scripts/setup-test-env.sh destroy
```

## Container Details

| CTID | Hostname       | IP           | RAM   | Disk | Purpose                              |
|------|----------------|--------------|-------|------|--------------------------------------|
| 200  | pan-test-web   | 10.10.0.200  | 256MB | 2GB  | Web server (nginx) — HTTP traffic    |
| 201  | pan-test-db    | 10.10.0.201  | 256MB | 2GB  | Database — heavier workload sim      |
| 202  | pan-test-iot   | 10.10.0.202  | 128MB | 1GB  | IoT device — minimal DHCP client     |

All containers use MikroTik CHR (`10.10.0.125`) as their default gateway.

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
/ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.125 dns-server=1.1.1.1

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

## Validation Scenarios

Use these test containers to validate each MikroTik integration feature:

### 1. DHCP Lease Tracking

**Goal:** Verify Panoptikon discovers containers via MikroTik DHCP leases.

```bash
# On the Proxmox host — restart a container to trigger DHCP
pct stop 202 && pct start 202

# In Panoptikon UI → Devices page
# Expect: pan-test-iot appears with IP 10.10.0.202, source "DHCP"
```

**API check:**
```bash
curl -s http://10.10.0.14:8080/api/v1/devices | jq '.[] | select(.ip == "10.10.0.202")'
```

### 2. Traffic Monitoring

**Goal:** Verify per-device bandwidth charts show traffic from test containers.

```bash
# Generate traffic from pan-test-web
pct exec 200 -- bash -c "curl -s -o /dev/null http://example.com; sleep 1; curl -s -o /dev/null http://example.com"

# Generate heavier traffic from pan-test-db
pct exec 201 -- bash -c "dd if=/dev/urandom bs=1M count=10 | curl -X POST -d @- http://example.com 2>/dev/null || true"

# In Panoptikon UI → Device detail → Bandwidth tab
# Expect: TX/RX bytes increase for the respective devices
```

### 3. Firewall Rule Visibility

**Goal:** Verify Panoptikon displays MikroTik firewall rules.

```routeros
# Add a test firewall rule on MikroTik
/ip firewall filter add chain=forward src-address=10.10.0.202 action=drop comment="block-iot-test"
```

```bash
# In Panoptikon UI → Router → Firewall tab
# Expect: "block-iot-test" rule visible

# Verify IoT container is blocked
pct exec 202 -- ping -c2 8.8.8.8  # Should fail

# Clean up
# /ip firewall filter remove [find comment="block-iot-test"]
```

### 4. VLAN Integration

**Goal:** Verify VLAN assignment and tagging works through Panoptikon.

```routeros
# On MikroTik — assign test container to VLAN 100
/interface bridge port add bridge=bridge-test interface=ether2 pvid=100
```

```bash
# In Panoptikon UI → Router → VLANs tab
# Expect: VLAN 100 visible with associated interfaces

# In Panoptikon UI → Topology view
# Expect: VLAN grouping shown for tagged devices
```

### 5. Device Discovery (ARP + mDNS)

**Goal:** Verify containers appear via ARP scanning (not just DHCP).

```bash
# All three containers should appear in Panoptikon device list
# even if DHCP leases expire — ARP scanner picks them up

# Generate ARP traffic
pct exec 200 -- ping -c3 10.10.0.125
pct exec 201 -- ping -c3 10.10.0.125

# Check Panoptikon API
curl -s http://10.10.0.14:8080/api/v1/devices | jq '.[].ip' | sort
# Expect: 10.10.0.200, 10.10.0.201, 10.10.0.202 in the list
```

## Generating Sustained Test Traffic

For longer validation sessions, run background traffic generators:

```bash
# On pan-test-web (CT 200) — periodic HTTP requests
pct exec 200 -- bash -c "while true; do curl -s -o /dev/null http://example.com; sleep 5; done" &

# On pan-test-db (CT 201) — periodic DNS + larger transfers
pct exec 201 -- bash -c "while true; do curl -s -o /dev/null https://speed.cloudflare.com/__down?bytes=1000000; sleep 10; done" &
```

## Troubleshooting

| Problem | Check |
|---------|-------|
| Containers can't reach gateway | `pct exec 200 -- ping 10.10.0.125` — verify bridge connectivity |
| No DHCP leases on MikroTik | Verify DHCP server is running: `/ip dhcp-server print` |
| Panoptikon doesn't see containers | Verify ARP scanner subnet includes `10.10.0.0/24` in `panoptikon.toml` |
| REST API connection refused | Check MikroTik: `/ip service print` — api-ssl should be enabled |
| Containers have no internet | Check NAT masquerade: `/ip firewall nat print` |

## Cleanup

```bash
# Remove all test containers
sudo bash scripts/setup-test-env.sh destroy

# Remove MikroTik test rules (from RouterOS terminal)
/ip firewall filter remove [find comment="block-iot-test"]
/user remove panoptikon
```
