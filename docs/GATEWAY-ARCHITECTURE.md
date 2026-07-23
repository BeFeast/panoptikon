# Panoptikon Gateway Architecture

> **Status:** Canonical roadmap contract
>
> **Decision:** [GitHub issue #834](https://github.com/BeFeast/panoptikon/issues/834)
>
> **Updated:** 2026-07-23

This document is the canonical architecture for Panoptikon's Gateway roadmap. The
[product requirements document](./PRD.md), [README](../README.md), test documents,
and contributor guidance link here instead of defining competing architectures.

## Status language

- **Current** means behavior shipped in the repository today.
- **Planned** means accepted roadmap direction that is not yet shipped.
- **Blocked** means work that must not be presented as complete until its named
  safety or verification dependency is satisfied.

Current Panoptikon is a self-hosted Controller: it discovers devices, collects
telemetry, and manages supported features through MikroTik and pfSense
integrations. That mode remains supported. The former VyOS integration was
removed by migration 026 and is historical, not a current compatibility promise.
Native packet forwarding,
`panoptikon-routerd`, OpenWrt firmware, and commit-confirm are planned, not current.

## Deployment profiles

| Profile | Role | Process placement | Status |
|---|---|---|---|
| **x86-64 co-located Gateway** | Primary product build for a dedicated appliance or VM | `panoptikon-core` and `panoptikon-routerd` run as separate local processes; the host owns the packet path | **Planned** |
| **Proxmox Gateway VM** | Mandatory isolated development and release-verification profile | The same x86 process split runs inside a disposable VM on an isolated virtual fabric | **Planned**; forwarding tests are **blocked** until this fabric exists |
| **Panoptikon Edge / OpenWrt** | Embedded profile for supported OpenWrt targets | OpenWrt-specific packages use `ubus`/UCI; Core may be remote when the target cannot host the full stack | **Planned** |

The profiles share a contract, not necessarily one executable or one backend.
x86-64 Linux and constrained OpenWrt/MIPS-class targets have different packaging,
runtime, storage, and adapter needs.

## Process and privilege boundary

```text
                         Browser / API clients
                                  |
                                  v
                    +---------------------------+
                    |     panoptikon-core       |
                    | UI/API, inventory, policy |
                    | desired state, history    |
                    +-------------+-------------+
                                  |
                   capability / desired-state /
                       transaction contract
                                  |
             +--------------------+--------------------+
             | local Unix socket                       | remote mTLS
             v                                         v
  +---------------------------+             +---------------------------+
  |  panoptikon-routerd       |             |  panoptikon-routerd       |
  | privileged executor       |             | privileged edge executor |
  +-------------+-------------+             +-------------+-------------+
                |                                           |
       Linux / Netlink adapter                     OpenWrt ubus/UCI adapter
                |                                           |
                v                                           v
        x86 packet path                              embedded packet path

Current Controller mode (supported in parallel):
panoptikon-server ---- router APIs ----> MikroTik / pfSense
```

The Gateway diagram above the Controller line is **planned**.
`panoptikon-core` is the planned unprivileged control and observation process. It owns the
UI/API, identity, inventory, policy intent, desired state, audit history, and
last-known-good records. It must not gain ambient packet-path privileges merely
because Core and routerd are co-located.

`panoptikon-routerd` is the narrow privileged executor. It advertises capabilities,
validates transactions against the local platform, applies supported operations,
reports observed state, and performs rollback/recovery actions. Its API must be
allow-listed and versioned; it is not a general-purpose root command channel.

## Transport and identity

- **Local:** a permission-restricted Unix domain socket is the default transport
  between co-located Core and routerd processes. Peer credentials and filesystem
  ownership provide the first authorization boundary.
- **Remote:** mutually authenticated TLS is required when Core and routerd run on
  different hosts. Each endpoint has a rotatable identity, and authorization is
  bound to the advertised device and capabilities.
- The transports carry the same versioned contract. Transport selection must not
  change transaction semantics.

## Shared contract

Every adapter implements the same conceptual contract:

1. **Capabilities:** platform, adapter version, supported resources and operations,
   constraints, and recovery features.
2. **Observed state:** normalized state plus freshness and source metadata.
3. **Desired state:** declarative, versioned intent with explicit preconditions.
4. **Plan:** deterministic diff, validation result, risk classification, and the
   recovery mechanism that will protect the apply.
5. **Transaction:** stable ID, actor, expected revision, ordered operations,
   timeout, commit-confirm deadline, and audit metadata.
6. **Result:** applied/failed/rolled-back/unknown state, resulting revision,
   diagnostics, and refreshed observations.

Capability negotiation is mandatory. Core must not send an operation merely
because another profile supports it, and routerd must reject unknown, stale, or
unsafe requests before changing the packet path.

## Platform adapters

- **Native x86 Linux:** a Linux/Netlink adapter owns interfaces, addresses,
  routes, firewall/NAT, and related host networking through documented kernel
  APIs. Shelling out is not the primary contract.
- **OpenWrt Edge:** an OpenWrt adapter integrates with `ubus` and UCI, respecting
  OpenWrt's configuration and service lifecycle. It is separately packaged and
  tested from the x86 build.
- **Managed routers:** current MikroTik and pfSense integrations continue to use
  their router-native APIs in Controller mode. Removed VyOS code and settings are
  not a supported adapter or Gateway commitment.

## Offline and last-known-good behavior

Core stores observed-state freshness and the last-known-good configuration for
each routerd. When a remote Edge is offline, the UI may show cached state only if
it is clearly marked stale; it must not imply that a change was applied. Desired
state may be queued only with an explicit operator action and must be revalidated
against capabilities and the current revision after reconnection.

Routerd keeps enough local state to continue the last committed configuration
without Core. Loss of Core, transport, or UI must not interrupt established
forwarding. Ambiguous transaction outcomes are reported as `unknown` and require
reconciliation before a later write.

## Blocking safety invariants

Native Gateway mutation is **blocked** from production claims until all of these
invariants are implemented and verified:

- **Commit-confirm:** risky packet-path changes automatically roll back unless the
  operator or an independent reachability check confirms them before a deadline.
- **Out-of-band recovery:** each supported production target has a documented,
  tested recovery path that does not depend on the configuration being changed.
- **Atomicity and reconciliation:** partial or ambiguous applies are detected,
  audited, and recovered rather than silently accepted.
- **Privilege containment:** Core compromise does not become unrestricted root
  command execution through routerd.
- **Isolated verification:** forwarding, failure, upgrade, and recovery tests run
  in the Proxmox Gateway VM fabric, never on the working production router or the
  current Controller-mode LXC 115.

ER605 V1 hardware is sacrificial HIL/recovery equipment only. It may be used to
exercise flashing, serial recovery, or destructive failure scenarios; it is not
the reference appliance and does not define the supported Gateway architecture.

## Phased roadmap

| Phase | Outcome | Gate |
|---|---|---|
| **0 — Current Controller** | Preserve and improve current discovery, telemetry, and MikroTik/pfSense management | Existing tests and deployments remain healthy |
| **1 — Contract and simulator** | Version the capability/desired-state/transaction protocol and exercise it with an unprivileged simulator | Deterministic plans, auditability, stale-revision rejection |
| **2 — Isolated x86 Gateway** | Add split Core/routerd processes and native Linux adapters in the Proxmox VM fabric | Packet-path and failure matrix passes; no production targets used |
| **3 — Recoverable x86 product** | Deliver commit-confirm, last-known-good reconciliation, upgrade/rollback, and out-of-band recovery | All blocking invariants pass repeatedly |
| **4 — OpenWrt Edge** | Package the Edge profile and implement the `ubus`/UCI adapter on selected targets | Per-target capabilities, resource limits, upgrade and recovery HIL pass |
| **5 — Productization** | Installer, lifecycle, observability, documentation, and support boundaries for the primary x86 Gateway | Release criteria and migration path are explicit |

## Explicit non-goals

- Replacing or disrupting supported Controller-mode integrations while Gateway is
  developed.
- Experimenting on the working production router or Controller-mode LXC 115.
- Treating ER605 V1 as the reference appliance.
- Claiming transparent compatibility between x86 and embedded targets.
- Exposing arbitrary command execution through routerd.
- Shipping native forwarding before commit-confirm and out-of-band recovery are
  proven in the isolated Proxmox profile.
- Requiring cloud control, cloud identity, or phone-home telemetry.
