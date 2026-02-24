# Panoptikon — End-to-End Testing Plan

This document describes how to manually verify each major Panoptikon integration in a real or near-real environment. For the automated integration test suite, see `server/tests/integration.rs`.

> **Prerequisites** — a running Panoptikon stack (`docker compose up`) with the services described in `docker-compose.yml`: Panoptikon (`:8080`), Caddy (`:80/:443`), and Unbound (`:53`). A MikroTik CHR or hardware router on the same network. See `docs/test-environment.md` for the full Proxmox-based lab setup.

---

## 1. DNS (Unbound Local Records)

Validates that Panoptikon can manage local A records via Unbound and that clients using Unbound as their DNS server get correct answers.

### Setup

1. Ensure the Unbound container is running: `docker compose ps unbound`.
2. In Panoptikon **Settings → Unbound**, set the control socket path (default `/var/run/unbound.ctl`) and click **Test Connection** — expect a success response.
3. Point a test client to Panoptikon's Unbound IP as its DNS server. On MikroTik DHCP you can set this per-subnet:
   ```routeros
   /ip dhcp-server network set [find address="10.10.0.0/24"] dns-server=<PANOPTIKON_IP>
   ```
   Or override on a single Linux client:
   ```bash
   echo "nameserver <PANOPTIKON_IP>" | sudo tee /etc/resolv.conf
   ```

### Test cases

| # | Test | Command | Expected result |
|---|------|---------|-----------------|
| 1.1 | **Create local A record** | Panoptikon UI → DNS Records → Add `test.home.lan → 10.10.0.200` | Record appears in list, `POST /api/v1/unbound/dns-records` returns 201 |
| 1.2 | **Local record resolves** | `dig @<PANOPTIKON_IP> test.home.lan` | Answer section shows `10.10.0.200` |
| 1.3 | **External domain forwards** | `dig @<PANOPTIKON_IP> example.com` | Returns the real public IP for `example.com` (status `NOERROR`) |
| 1.4 | **Toggle record off** | Toggle the record in the UI | `dig` returns `NXDOMAIN` or `SERVFAIL` for `test.home.lan` |
| 1.5 | **Delete record** | Delete from UI | Record no longer listed; `dig` returns `NXDOMAIN` |

### API verification

```bash
# List records
curl -sb cookies.txt http://localhost:8080/api/v1/unbound/dns-records | jq .

# Create record
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/unbound/dns-records \
  -H 'Content-Type: application/json' \
  -d '{"name":"test.home.lan","record_type":"A","value":"10.10.0.200","enabled":true}'

# Test connection
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/unbound/test-connection
```

---

## 2. Caddy Proxy

Validates that proxy hosts created in Panoptikon are pushed to the Caddy Admin API and that HTTP requests route correctly.

### Setup

1. Ensure the Caddy container is running: `docker compose ps caddy`.
2. In Panoptikon **Settings → Caddy**, set the Admin API URL (default `http://caddy:2019`) and click **Test Connection**.
3. Have a backend service available (e.g., `pan-test-web` at `10.10.0.200:80` from the test environment).

### Test cases

| # | Test | Steps | Expected result |
|---|------|-------|-----------------|
| 2.1 | **Caddy status** | Settings → Caddy → Test Connection | Status shows "connected", `/api/v1/caddy/status` returns 200 |
| 2.2 | **Create proxy host** | Proxy Hosts → Add: domain `app.home.lan`, forward to `10.10.0.200:80` | Host appears in list; `POST /api/v1/caddy/proxy-hosts` returns 201 |
| 2.3 | **Caddy config updated** | `curl http://localhost:2019/config/` \| jq . | JSON config includes a route for `app.home.lan` with upstream `10.10.0.200:80` |
| 2.4 | **HTTP routes to backend** | `curl -H "Host: app.home.lan" http://localhost/` | Response body matches what `10.10.0.200:80` serves (e.g., nginx welcome page) |
| 2.5 | **Toggle host off** | Disable the proxy host in the UI | `curl -H "Host: app.home.lan" http://localhost/` returns 404 or Caddy default page |
| 2.6 | **Force sync** | POST `/api/v1/caddy/sync` | Caddy config matches DB state; response 200 |
| 2.7 | **Delete proxy host** | Delete from UI | Host removed from Caddy config; HTTP request returns 404 |

### API verification

```bash
# List proxy hosts
curl -sb cookies.txt http://localhost:8080/api/v1/caddy/proxy-hosts | jq .

# Create proxy host
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/caddy/proxy-hosts \
  -H 'Content-Type: application/json' \
  -d '{"domain":"app.home.lan","forward_host":"10.10.0.200","forward_port":80,"forward_scheme":"http","enabled":true}'

# Check Caddy admin API directly
curl -s http://localhost:2019/config/ | jq '.apps.http'
```

---

## 3. Xiaomi Mesh

Validates that Panoptikon can connect to a Xiaomi Mesh router and retrieve device/topology information.

### Setup

1. Have a Xiaomi Mesh router accessible on the network (e.g., `192.168.31.1`).
2. In Panoptikon **Settings → Xiaomi Mesh**, enter the router IP and click **Test Connection**.

### Test cases

| # | Test | Steps | Expected result |
|---|------|-------|-----------------|
| 3.1 | **Test connection** | Settings → Xiaomi Mesh → enter router IP → Test Connection | Returns router model, hardware version, and firmware version |
| 3.2 | **Device list matches WiFi clients** | Compare Panoptikon's device list with Xiaomi router admin page (`http://<router_ip>/cgi-bin/luci/web`) | All connected WiFi clients appear in Panoptikon |
| 3.3 | **Mesh topology matches physical setup** | Check topology view | Mesh nodes (main router + satellites) are shown and match the physical arrangement |

### API verification

```bash
# Test connection (uses stored IP or provide one)
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/xiaomi-mesh/test-connection \
  -H 'Content-Type: application/json' \
  -d '{"ip":"192.168.31.1"}'
```

### Notes

- The Xiaomi integration uses the unauthenticated `/api/xqsystem/init_info` endpoint for basic info.
- Full device list and topology features depend on the router's firmware version and API availability.
- If the router requires authentication for device enumeration, the stored password in settings will be used.

---

## 4. MikroTik

Validates VLAN management, firewall rule operations, and general router status reporting via the MikroTik REST API.

### Setup

1. Have a MikroTik router running RouterOS 7+ with REST API enabled:
   ```routeros
   /ip service set api-ssl disabled=no address=10.10.0.0/24
   ```
2. In Panoptikon **Settings → MikroTik**, enter the URL (`https://<router_ip>`), username, and password. Click **Test Connection**.
3. See `docs/test-environment.md` for the full MikroTik CHR lab setup.

### Test cases

| # | Test | Steps | Expected result |
|---|------|-------|-----------------|
| 4.1 | **Router status** | Router → MikroTik dashboard | Shows uptime, CPU load, memory usage, board name, architecture |
| 4.2 | **Interface list** | Router → Interfaces tab | Lists all interfaces with TX/RX counters, MTU, MAC, status |
| 4.3 | **Create VLAN** | Router → VLANs → Add VLAN (ID 200, interface `bridge-test`) | VLAN appears in list |
| 4.4 | **VLAN reflected in MikroTik** | On MikroTik: `/interface vlan print` | VLAN 200 exists on `bridge-test` |
| 4.5 | **Create firewall filter rule** | Router → Firewall → Add filter rule: chain=forward, src-address=10.10.0.202, action=drop | Rule appears in list |
| 4.6 | **Firewall rule applied** | From blocked host: `ping 8.8.8.8` | Ping fails (dropped by firewall) |
| 4.7 | **Delete firewall rule** | Delete the rule from UI | Rule removed; `ping 8.8.8.8` from host succeeds again |
| 4.8 | **NAT rule management** | Firewall → NAT → Add rule: chain=dstnat, dst-port=8080, action=dst-nat, to-addresses=10.10.0.200 | NAT rule appears; MikroTik `/ip firewall nat print` confirms |
| 4.9 | **DHCP leases** | Router → DHCP tab | Shows leases matching MikroTik `/ip dhcp-server lease print` |
| 4.10 | **Routes** | Router → Routes tab | Static and connected routes displayed |
| 4.11 | **Delete VLAN** | Delete VLAN 200 from UI | Removed from list; `/interface vlan print` on MikroTik confirms deletion |

### API verification

```bash
# Router status
curl -sb cookies.txt http://localhost:8080/api/v1/mikrotik/status | jq .

# List VLANs
curl -sb cookies.txt http://localhost:8080/api/v1/mikrotik/vlans | jq .

# Create VLAN
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/mikrotik/vlans \
  -H 'Content-Type: application/json' \
  -d '{"name":"vlan200-test","vlan_id":200,"interface":"bridge-test"}'

# List firewall rules
curl -sb cookies.txt http://localhost:8080/api/v1/mikrotik/firewall | jq .

# DHCP leases
curl -sb cookies.txt http://localhost:8080/api/v1/mikrotik/dhcp-leases | jq .
```

---

## 5. Cloudflare Tunnel

Validates that an external domain resolves through a Cloudflare Tunnel to the Caddy reverse proxy and on to the backend service.

### Setup

1. A Cloudflare account with a domain configured and a tunnel created.
2. Start the `cloudflared` container (uses the `tunnel` Docker Compose profile):
   ```bash
   docker compose --profile tunnel up -d cloudflared
   ```
3. A Caddy proxy host must be configured for the external domain (see section 2).

### Test cases

| # | Test | Steps | Expected result |
|---|------|-------|-----------------|
| 5.1 | **Tunnel is running** | `docker compose --profile tunnel ps cloudflared` | Container is running and healthy |
| 5.2 | **External DNS resolves** | `dig app.example.com` (from outside the network) | Returns a Cloudflare IP (CNAME to `*.cfargotunnel.com`) |
| 5.3 | **End-to-end: tunnel → Caddy → backend** | `curl https://app.example.com/` (from outside the network) | Response body matches the backend service content |
| 5.4 | **TLS termination** | `curl -vI https://app.example.com/ 2>&1 \| grep "issuer"` | Certificate issued by Cloudflare or Let's Encrypt |

### Notes

- The `cloudflared` service is optional (Docker Compose profile `tunnel`).
- Tunnel ingress rules are managed in the Cloudflare dashboard or via `cloudflared` config; Panoptikon does not yet manage tunnel configuration directly.
- This test requires the domain's DNS to be proxied through Cloudflare (orange cloud).

---

## 6. Unbound Blocklist

Validates that DNS blocklists block ad/tracking domains and that the whitelist override system works correctly.

### Setup

1. Unbound is running and configured as the DNS resolver (see section 1 setup).
2. In Panoptikon **DNS Blocklists**, add at least one blocklist source (e.g., Steven Black's hosts list: `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts`).
3. Click **Download** to fetch and parse the blocklist.

### Test cases

| # | Test | Steps | Expected result |
|---|------|-------|-----------------|
| 6.1 | **Add blocklist source** | DNS Blocklists → Add list URL → Download | List shows domain count > 0; stats endpoint reports total blocked domains |
| 6.2 | **Blocked domain returns NXDOMAIN** | `dig @<PANOPTIKON_IP> ads.example-tracker.com` (use a domain from the blocklist) | Returns `NXDOMAIN` (or `0.0.0.0` depending on Unbound config) |
| 6.3 | **Non-blocked domain resolves** | `dig @<PANOPTIKON_IP> example.com` | Returns the real IP (status `NOERROR`) |
| 6.4 | **Whitelist override** | Add whitelist override for a blocked domain → `dig` that domain | Domain now resolves normally |
| 6.5 | **Blacklist override** | Add blacklist override for `custom-block.com` → `dig @<PANOPTIKON_IP> custom-block.com` | Returns `NXDOMAIN` even though it's not in any blocklist |
| 6.6 | **Toggle blocklist off** | Disable the blocklist source | Previously blocked domains now resolve normally |
| 6.7 | **Delete override** | Delete the whitelist override | Domain returns to being blocked |
| 6.8 | **Blocklist stats** | Check stats endpoint | Reports correct total blocked domains, whitelist count, blacklist count |

### API verification

```bash
# List blocklists
curl -sb cookies.txt http://localhost:8080/api/v1/dns-blocklists | jq .

# Add blocklist
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/dns-blocklists \
  -H 'Content-Type: application/json' \
  -d '{"name":"Steven Black","url":"https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts","format":"hosts","enabled":true}'

# Trigger download
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/dns-blocklists/1/download

# Stats
curl -sb cookies.txt http://localhost:8080/api/v1/dns-blocklists/stats | jq .

# Add whitelist override
curl -sb cookies.txt -X POST http://localhost:8080/api/v1/dns-blocklists/overrides \
  -H 'Content-Type: application/json' \
  -d '{"domain":"allowed.example.com","action":"whitelist"}'

# List overrides
curl -sb cookies.txt http://localhost:8080/api/v1/dns-blocklists/overrides | jq .

# Generate Unbound config snippet
curl -sb cookies.txt http://localhost:8080/api/v1/dns-blocklists/unbound-config
```

---

## Automated Integration Tests

The project includes an automated integration test suite at `server/tests/integration.rs` covering authentication, setup wizard, CRUD operations for Caddy proxy hosts, and server stability.

### Running the tests

```bash
cd server
cargo test
```

The test suite spins up a real axum server on a random port with an in-memory SQLite database. Each test gets a fresh server instance — no external services required.

### Current test coverage

- **Authentication**: login, logout, wrong password, session validation
- **Setup wizard**: password creation, duplicate setup prevention, minimum length
- **Caddy proxy hosts**: full CRUD, toggle, sync, status, 404 handling, auth enforcement
- **Server stability**: ConnectInfo regression (no panic on login)

---

## General Tips

- **Session cookies**: The API uses HTTP-only session cookies. When testing with `curl`, use `-b cookies.txt -c cookies.txt` to persist the session. Log in first:
  ```bash
  curl -c cookies.txt -X POST http://localhost:8080/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"password":"your-password"}'
  ```

- **Docker logs**: Check per-service logs for debugging:
  ```bash
  docker compose logs panoptikon --tail 50
  docker compose logs caddy --tail 50
  docker compose logs unbound --tail 50
  ```

- **Caddy admin API**: Inspect the live Caddy config directly:
  ```bash
  curl -s http://localhost:2019/config/ | jq .
  ```

- **Unbound control**: Query Unbound status from inside the container:
  ```bash
  docker compose exec unbound unbound-control status
  docker compose exec unbound unbound-control list_local_data
  ```

- **MikroTik REST API**: Test MikroTik connectivity directly:
  ```bash
  curl -sk -u admin:password https://<router_ip>/rest/system/resource
  ```
