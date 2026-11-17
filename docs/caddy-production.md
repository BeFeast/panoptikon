# Caddy production deployment

Panoptikon managed mode is for a **dedicated LAN Caddy** whose complete JSON
configuration Panoptikon owns. It is not for the Caddyfile-driven Compose demo.
Managed mode defaults to off and every managed apply uses Caddy's atomic
`POST /load`; a rejected document leaves the prior configuration running.

The current production profile uses Caddy 2.11.4 in LXC 118 (`10.10.0.32`) and
Panoptikon Controller in LXC 115 (`10.10.0.22`). Controller mode and the existing
MikroTik/pfSense integrations remain current and unchanged. This deployment is
not part of the planned Gateway/routerd packet path.

## Prerequisites

- Caddy 2.10 or newer, pinned to 2.11.4 for the production profile, built with
  `github.com/caddy-dns/cloudflare`. Use
  `docker/caddy/Dockerfile.cloudflare` or an equivalent `xcaddy build`.
- Caddy runs with `caddy run --resume`, so a successfully loaded config is
  autosaved and survives restart.
- The real admin listener is loopback-only at `127.0.0.1:2019`.
- Host firewall policy permits the gate port only from Panoptikon and loopback.
  Caddy's route allow-list is a second layer, not the only network boundary.
- Store the Cloudflare API token only on the Caddy host. Production uses the
  placeholder `{file./etc/caddy/cf_token}`. The token file must be readable by
  Caddy and must never be entered into Panoptikon.

The production admin gate is `https://caddy-admin.oklabs.uk:2019`. That name is
deliberately absent from DNS; Panoptikon resolves it to `10.10.0.32` through the
Admin hostname resolve IP setting, preserving hostname-based TLS verification.
Basic credentials never travel over cleartext LAN HTTP.

## Bootstrap

0. On the Controller, correct or remove stale `caddy_proxy_hosts` rows (in
   particular verify the former `rehearsekit.uk` port) and check every
   TLS-enabled host against the ACME zone allow-list. Rehearse the procedure
   from a non-production Panoptikon. Never use LXC 115 as an experiment target.
1. Configure Caddy 2.11.4 with the Cloudflare module and a loopback admin
   listener. Keep an out-of-band shell path to that listener.
2. In Panoptikon, leave Managed mode off and configure:

   - Admin URL: `https://caddy-admin.oklabs.uk:2019`
   - Admin user/password and local listener `127.0.0.1:2019`
   - LAN and resolve IP `10.10.0.32`, gate port `2019`
   - allowed ranges `10.10.0.22/32,10.10.0.32/32,127.0.0.1/32`
   - ACME email and owned zone allow-list
   - provider `cloudflare`
   - token placeholder `{file./etc/caddy/cf_token}`
   - public resolvers `1.1.1.1:53,8.8.8.8:53`

   Public resolvers are required because split-horizon LAN resolution can make
   CertMagic discover the wrong DNS zone. The generated DNS challenge uses a
   20-second propagation delay and disables the recursive propagation check;
   the public CA still validates against authoritative DNS.
3. Fetch `GET /api/v1/caddy/config`. This validates and renders the exact config
   even while managed mode is off. Copy it to the Caddy host and establish the
   gate through the raw listener:

   ```bash
   curl -X POST http://127.0.0.1:2019/load \
     -H 'Content-Type: application/json' \
     --data-binary @config.json
   ```

4. In Panoptikon, run Test Connection. Only after the authenticated TLS gate is
   reachable should you enable Managed mode and select Sync to Caddy. If a gate
   fingerprint changed, review the warning and explicitly confirm the push.

Every successful load is followed by an authenticated `GET /config/` through
the configured gate. A failed probe is shown as **Locked out**, even though
Caddy accepted and is running the new configuration.

## Rotation

Changing the admin URL/listener, LAN or resolve address, gate port, allowed
ranges, username, or password changes the gate fingerprint. Automatic CRUD,
startup, and Services-wizard pushes then refuse to apply. Review the generated
preview and use the explicit confirmation action. Credential rotation is not a
dual-credential transaction; bootstrap through loopback when the new client
credential cannot authenticate to the old gate.

## Recovery

If Panoptikon reports **Locked out** or the gate cannot be reached:

1. Correct the Caddy settings in Panoptikon while managed operations remain
   unavailable.
2. Fetch a fresh `GET /api/v1/caddy/config` and copy it to the Caddy host.
3. Load it through Caddy's out-of-band loopback listener:

   ```bash
   curl -X POST http://127.0.0.1:2019/load \
     -H 'Content-Type: application/json' \
     --data-binary @config.json
   ```

   For the current LXC, the operator recovery path is:

   ```bash
   ssh pve-devbox \
     'pct exec 118 -- curl -X POST -H "Content-Type: application/json" \
       --data-binary @/root/bootstrap-prod.json 127.0.0.1:2019/load'
   ```

4. Run Test Connection, then perform and confirm an explicit sync.

The nftables allow-list on the Caddy container remains effective even after a
bad Caddy load: a bad push can lock Panoptikon out, but cannot make the admin API
LAN-wide.
