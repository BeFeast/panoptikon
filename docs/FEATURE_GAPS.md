# pfSense Feature Parity Analysis — Gap Report

> **Date:** 2026-07-23
> **Issue:** #245
> **Status:** Historical comparison with a current Gateway-roadmap overlay
> **Scope:** Preserve the earlier pfSense comparison while identifying which
> gaps belong to the **planned** native Gateway profile.
>
> Roadmap context: [Gateway architecture](./GATEWAY-ARCHITECTURE.md) and
> [decision #834](https://github.com/BeFeast/panoptikon/issues/834).
>
> **Accuracy note:** VyOS was removed from the shipped product by migration 026.
> Rows whose evidence is only a VyOS path are historical and must not be read as
> current Controller capability. Until this report is re-baselined against the
> current MikroTik/pfSense code, the repository PRD and implementation are the
> authority for shipped status.

---

## Methodology

This analysis preserves a historical Panoptikon Controller comparison against the
pfSense Plus / CE feature set. Each rating is profile-aware:

| Status | Meaning |
|--------|---------|
| **Full** | Feature exists in the current Controller for at least one documented managed-router path; notes identify the path |
| **Partial** | Current Controller support exists but is incomplete or limited compared to pfSense |
| **Missing** | Feature is missing from the current Controller; it may still be planned for managed-router or native Gateway work |
| **Historical** | The row describes removed VyOS behavior and is not current capability |
| **N/A — Controller** | The current Controller does not own this packet-path function; this is not a permanent product-wide non-goal |

**Important context:** In the **current** Controller profile, kernel packet
processing is performed by MikroTik or pfSense. Historical VyOS-only rows remain
visible as provenance but do not establish current support. This report asks
whether Panoptikon can configure or observe it. In the **planned** x86 Gateway,
native Linux/Netlink adapters may own an explicitly supported subset through
privileged routerd. Those features remain **blocked** from shipped status until
commit-confirm, out-of-band recovery, and isolated Proxmox verification pass.

---

## 1. Firewall Rules Management

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| View firewall rules by interface/chain | **Full** | Current MikroTik filter-rule view |
| Create firewall rules | **Historical** | Removed VyOS rule creation path |
| Edit/update firewall rules | **Historical** | Removed VyOS rule modification path |
| Delete firewall rules | **Historical** | Removed VyOS rule deletion path |
| Enable/disable rules (toggle) | **Historical** | Removed VyOS rule-toggle path |
| Address groups (aliases) | **Historical** | Removed VyOS address-group path |
| Network groups | **Historical** | Removed VyOS network-group path |
| Port groups | **Historical** | Removed VyOS port-group path |
| Stateful packet inspection config | **N/A — Controller** | Managed router owns enforcement today; native Gateway support is planned and capability-gated |
| Time-based firewall rules | **Missing** | pfSense supports rules active during specific days/times |
| Connection limits per rule | **Missing** | pfSense supports per-rule connection count limits |
| Floating rules (cross-interface) | **Missing** | pfSense floating rules apply across all interfaces |
| Rule ordering / drag-and-drop | **Missing** | No rule reordering UI; rules identified by number |
| Rule hit counters / statistics | **Missing** | pfSense shows per-rule match counts |
| Anti-spoofing configuration | **N/A — Controller** | Managed router owns enforcement today; evaluate for the planned native Gateway adapter |
| IP/DNS geoblocking | **Missing** | pfSense supports country-level blocking via pfBlockerNG |
| Rule import/export | **Missing** | No bulk rule management |
| Rule search/filter | **Missing** | No search within firewall rules |

### Gap Summary — Firewall
The historical snapshot recorded solid CRUD for VyOS firewall rules and groups;
that removed path is not current capability. The recorded gaps were **rule
statistics/hit counters**, **time-based rules**, **rule reordering UI**, and
**geoblocking**. MikroTik firewall management is read-only (view rules only, no CRUD).

---

## 2. NAT / Port Forwarding

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| Port forwarding (DNAT) | **Partial** | Available via unified service wizard; no standalone UI |
| 1:1 NAT | **Missing** | pfSense maps entire external IP to internal host |
| Outbound NAT (SNAT) | **Missing** | pfSense supports manual outbound NAT rules |
| NAT reflection (hairpin NAT) | **Missing** | pfSense supports internal access via external IP |
| NPT (IPv6 prefix translation) | **Missing** | pfSense supports NAT66 |
| Port forwarding wizard | **Partial** | Service wizard creates DNAT + firewall rules together, but no dedicated port-forward-only wizard |
| View/list all NAT rules | **Missing** | No dedicated NAT rules listing page |
| UPnP / NAT-PMP management | **Missing** | pfSense can enable/configure UPnP |

### Gap Summary — NAT
Port forwarding exists only within the service wizard (creates NPM proxy + firewall + DNAT
together). There is **no standalone port forwarding UI**, no ability to list/edit/delete
individual NAT rules, and no support for 1:1 NAT, outbound NAT, or NAT reflection. This is
a significant gap for users who need fine-grained NAT control.

---

## 3. Traffic Shaping / QoS

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| Traffic shaping queues (ALTQ) | **Missing** | No QoS queue management |
| Traffic shaping rules | **Missing** | No traffic classification rules |
| Limiter-based rate limiting | **Missing** | No per-IP or per-subnet bandwidth limits |
| Traffic shaping wizard | **Missing** | No guided QoS setup |
| Queue priority levels | **Missing** | No priority queue configuration |
| Scheduler types (CBQ, PRIQ, HFSC) | **Missing** | No scheduler selection |
| Per-user bandwidth quotas | **Missing** | No quota management |
| Fair queuing (FQ_CoDel) | **Missing** | No bufferbloat mitigation controls |
| Real-time queue usage monitoring | **Missing** | No queue utilization graphs |
| Bandwidth throttling | **Missing** | No intentional speed limiting |

### Gap Summary — Traffic Shaping
**This is the largest feature gap.** Panoptikon has no traffic shaping or QoS management
whatsoever. pfSense provides comprehensive QoS with multiple scheduler types, wizards,
limiters, and real-time queue monitoring. For current MikroTik targets (which
support queues), Panoptikon could expose additional router-native management;
native x86 QoS belongs to the planned Gateway capability contract.

---

## 4. VPN Management

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| WireGuard tunnel creation | **Historical** | Removed VyOS WireGuard interface path |
| WireGuard peer management | **Full** | Add/delete peers, generate keypairs |
| WireGuard client config generation | **Full** | Generate ready-to-use .conf files |
| OpenVPN server configuration | **Missing** | No OpenVPN management at all |
| OpenVPN client configuration | **Missing** | No OpenVPN client setup |
| OpenVPN client export | **Missing** | pfSense exports client configs for all platforms |
| IPsec tunnel management | **Missing** | No IPsec configuration |
| IPsec Phase 1/Phase 2 config | **Missing** | No IKE/IPsec settings |
| VPN status / connected clients | **Missing** | No live VPN session monitoring |
| VPN traffic statistics | **Missing** | No per-tunnel bandwidth metrics |
| VPN tunnel failover | **Missing** | No automatic tunnel failover config |
| L2TP/IPsec for mobile | **Missing** | No L2TP configuration |
| Split tunneling configuration | **Missing** | No split tunnel rule management |
| Certificate management for VPN | **Missing** | No PKI/CA for VPN certificates |
| RADIUS/LDAP auth for VPN | **Missing** | No external auth integration for VPN |
| VPN user management | **Missing** | No VPN-specific user/client management |

### Gap Summary — VPN
The historical snapshot recorded full VyOS WireGuard CRUD and client config
generation. However, **OpenVPN management is completely absent**, and there is no IPsec
support. VPN monitoring (connected clients, tunnel status, traffic stats) is also missing.
MikroTik WireGuard is read-only (status view only, no management).

---

## 5. DHCP Server Management

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| View DHCP leases | **Full** | Current MikroTik lease listing |
| Static IP mappings (reservations) | **Historical** | Removed VyOS static-mapping path |
| Enable/disable DHCP per subnet | **Historical** | Removed VyOS subnet-toggle path |
| DHCP pool range configuration | **Missing** | No pool range (start/end IP) management |
| DHCP option configuration | **Missing** | No custom DHCP options (gateway, DNS, domain, NTP, etc.) |
| DHCP relay configuration | **Missing** | No DHCP relay agent setup |
| DHCPv6 server | **Missing** | No IPv6 DHCP management |
| DHCP failover / HA | **Missing** | No DHCP high-availability configuration |
| DHCP lease time configuration | **Missing** | No lease duration settings |
| WINS server option | **N/A — Controller** | Legacy capability; no current or planned product commitment |
| TFTP/PXE boot options | **Missing** | pfSense supports network boot configuration |
| Register DHCP leases in DNS | **Missing** | pfSense auto-registers hostnames in DNS resolver |
| Per-interface DHCP scopes | **Missing** | No multi-scope management UI |
| DHCP log viewing | **Missing** | No DHCP-specific log access |

### Gap Summary — DHCP
Basic DHCP operations (view leases, static mappings, toggle) are covered. But **DHCP pool
configuration** (ranges, options, lease times) is missing, making it impossible to fully set
up a DHCP server through Panoptikon. Users must configure pools directly on the router.

---

## 6. DNS Services

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| DNS forwarding configuration | **Historical** | Removed VyOS DNS-forwarder path |
| Domain overrides (local DNS) | **Historical** | Removed VyOS domain-override path |
| DNS Resolver (Unbound) management | **Missing** | No recursive resolver configuration |
| DNSSEC configuration | **Missing** | No DNSSEC toggle or trust anchor management |
| DNS over TLS (DoT) | **Missing** | No encrypted DNS upstream configuration |
| DNS block lists | **Missing** | pfSense + pfBlockerNG provides DNS-level ad/malware blocking |
| Host overrides | **Partial** | Domain overrides exist but limited to A/AAAA |
| Dynamic DNS (DDNS) client | **Missing** | pfSense supports 20+ DDNS providers |
| DNS rebinding protection | **N/A — Controller** | Managed router/resolver owns enforcement today; future profile support is undecided |

### Gap Summary — DNS
Basic DNS forwarding works. Key gaps are **DNS-over-TLS**, **DNSSEC**, **DDNS client
management**, and **DNS block lists** (comparable to pfBlockerNG/Pi-hole).

---

## 7. Routing

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| View routing table | **Full** | Current MikroTik route view |
| Static route creation/deletion | **Full** | Current MikroTik static-route operations |
| Policy-based routing | **Missing** | No PBR rule management |
| Multi-WAN load balancing | **Missing** | No gateway group or load balancing config |
| Multi-WAN failover | **Missing** | No WAN failover configuration |
| Gateway monitoring | **Missing** | No gateway health/latency tracking |
| BGP/OSPF configuration | **Missing** | No dynamic routing protocol management |
| IPv6 router advertisements | **Missing** | No RA configuration |

### Gap Summary — Routing
Basic static routing is covered. Advanced routing (policy routing, multi-WAN, dynamic
protocols) is not managed through Panoptikon.

---

## 8. System / Configuration Management

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| Web-based management GUI | **Full** | Full web UI for router management |
| Configuration backup/restore | **Historical** | Removed VyOS backup/restore path |
| Setup wizard | **Partial** | Initial auth setup only; no network setup wizard |
| Dashboard with widgets | **Full** | Dashboard with device/agent/alert stats |
| SNMP monitoring | **Missing** | No SNMP agent or trap configuration |
| Remote syslog | **Historical** | Removed VyOS syslog path |
| Email/Telegram notifications | **Partial** | Telegram supported for alerts; no SMTP email notifications |
| User privilege levels | **Missing** | Single admin user only; no RBAC |
| Multi-language support | **Missing** | English only |
| Serial console access | **N/A — Controller** | Not a dashboard feature; serial remains an out-of-band recovery mechanism for supported HIL |
| Configuration change audit | **Partial** | Current generic router/operator audit log; no universal transaction audit |

### Gap Summary — System
Panoptikon has strong configuration backup and audit capabilities. Main gaps are **RBAC /
multi-user**, **SNMP management**, and **email notifications**.

---

## 9. Monitoring & Reporting

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| Real-time traffic graphs | **Full** | Per-device RX/TX traffic with NetFlow |
| Historical traffic data | **Full** | Hourly/daily rollups with configurable retention |
| Dashboard gauges (CPU, memory) | **Full** | Via agent telemetry |
| System health monitoring | **Full** | Agent-based CPU/memory/disk monitoring |
| Firewall log viewing | **Historical** | Removed VyOS syslog path; no current structured firewall log parsing |
| SNMP export | **Missing** | No SNMP daemon management |
| Prometheus metrics | **Full** | `/metrics` endpoint with device/agent/traffic gauges |
| Network topology visualization | **Full** | Force-directed graph with DHCP/bridge enrichment |
| Speedtest integration | **Full** | Ookla CLI with scheduling and history |
| Bandwidth by IP/host | **Full** | NetFlow-based per-device traffic |
| Interface traffic monitoring | **Full** | MikroTik per-interface polling |

### Gap Summary — Monitoring
Monitoring is one of Panoptikon's strongest areas and **exceeds pfSense** in several
ways: agent-based telemetry, network topology visualization, device discovery (ARP/mDNS/
SSDP), asset inventory, and Prometheus integration. The main gap is structured **firewall
log parsing** and **SNMP export**.

---

## 10. High Availability / Redundancy

| pfSense Capability | Panoptikon Status | Notes |
|---|---|---|
| CARP failover | **N/A — Controller** | Not exposed by current managed-router integrations; no native Gateway commitment yet |
| Config synchronization | **Missing** | No multi-router config sync |
| State table replication | **N/A — Controller** | Not exposed by current managed-router integrations; no native Gateway commitment yet |
| Multi-WAN failover | **Missing** | No WAN failover management |
| Load balancer (HAProxy) | **Missing** | Reverse proxy exists (NPM/Caddy) but no L4/L7 load balancing management |

---

## 11. Additional pfSense Features Not in Panoptikon

| pfSense Feature | Priority | Notes |
|---|---|---|
| Captive portal | Low | Useful for guest networks; not typical homelab need |
| IDS/IPS (Snort/Suricata) | Medium | Deep packet inspection; complex to manage remotely |
| Proxy server (Squid) | Low | Web proxy/caching; niche use case |
| PPPoE server | Low | ISP-level feature |
| Certificate Authority (PKI) | Medium | Needed for OpenVPN; also useful for internal TLS |
| RADIUS server (FreeRADIUS) | Low | Enterprise authentication |
| UPnP / NAT-PMP | Low | Auto port forwarding for games/apps |

---

## Priority Gap Ranking

Based on user impact and implementation feasibility, here are the highest-priority gaps:

### P0 — Critical Gaps (blocking common workflows)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | **Port forwarding wizard / standalone NAT UI** | Users cannot manage port forwards without the full service wizard | Medium |
| 2 | **OpenVPN management** | Second most popular VPN protocol; completely absent | Large |
| 3 | **DHCP pool configuration** (ranges, options, lease times) | Cannot fully set up DHCP through Panoptikon | Medium |
| 4 | **VPN status monitoring** (connected clients, tunnel health) | No visibility into active VPN sessions | Medium |
| 5 | **MikroTik firewall CRUD** | MikroTik firewall is read-only; no rule management | Medium |

### P1 — High-Priority Gaps (significant feature gap)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 6 | **Traffic shaping / QoS management** | Entire QoS category missing; important for bandwidth management | Large |
| 7 | **Firewall rule statistics / hit counters** | No visibility into which rules are being triggered | Small |
| 8 | **Dynamic DNS client management** | Common homelab need; must configure on router directly | Medium |
| 9 | **DNS-over-TLS / DNSSEC management** | Security-critical DNS features not configurable | Small |
| 10 | **Multi-WAN / gateway failover management** | No WAN redundancy configuration | Medium |

### P2 — Medium-Priority Gaps (nice to have)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 11 | **IPsec VPN management** | Enterprise VPN; less common in homelab | Large |
| 12 | **Firewall rule reordering UI** | Convenience improvement for rule management | Small |
| 13 | **DHCP relay configuration** | Multi-subnet DHCP without running server per subnet | Small |
| 14 | **1:1 NAT management** | Niche but important for hosting | Small |
| 15 | **Certificate Authority / PKI** | Required for OpenVPN; useful for internal services | Medium |
| 16 | **Email (SMTP) notifications** | Common alerting channel; only Telegram supported today | Small |
| 17 | **IDS/IPS management** (Snort/Suricata) | Advanced security; complex integration | Large |
| 18 | **DHCPv6 management** | IPv6 adoption growing | Medium |

---

## Panoptikon Advantages Over pfSense

Panoptikon is not just playing catch-up — it exceeds pfSense in several areas:

| Capability | Panoptikon | pfSense |
|---|---|---|
| Multi-router management | Manages current MikroTik + pfSense integrations from one UI | Single device only |
| Device discovery (ARP/mDNS/SSDP) | Automatic, multi-protocol | Basic ARP table only |
| Network topology visualization | Interactive force-directed graph | Not available |
| Agent-based monitoring | Lightweight agents for deep system metrics | Not available |
| IT asset inventory | Full asset management with linking | Not available |
| SSH agentless monitoring | Poll remote hosts via SSH | Not available |
| Reverse proxy management | NPM + Caddy integration | HAProxy package only |
| Prometheus metrics export | Native /metrics endpoint | Requires packages |
| Modern UI (React/Next.js) | Dark theme, responsive, real-time | PHP-based, dated UI |
| Unified service wizard | One-click proxy + firewall + DNAT | Manual multi-step |

---

## Recommended Sub-Issues

The following sub-issues should be created for the highest-priority gaps:

1. **feat: standalone port forwarding / NAT management UI** — current MikroTik operations plus planned native-Gateway capability where safely supported
2. **feat: OpenVPN server and client management** — evaluate current managed-router adapters and the planned Gateway contract; export client configs and view connected clients
3. **feat: DHCP server pool configuration** — manage pool ranges, lease times, and DHCP options on current supported adapters or the planned Gateway
4. **feat: VPN status dashboard — connected clients and tunnel health** — live WireGuard/OpenVPN session monitoring with peer status, handshake times, transfer stats
5. **feat: MikroTik firewall rule management (CRUD)** — full create/read/update/delete for MikroTik firewall filter and NAT rules
6. **feat: traffic shaping / QoS queue management** — manage MikroTik queues and planned native-Gateway capabilities from the UI
7. **feat: dynamic DNS client management** — configure DDNS through current supported adapters or the planned Gateway
