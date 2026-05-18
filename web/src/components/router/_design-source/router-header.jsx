/* global React, Icon, StatusDot, Spark */
// router.jsx — MikroTik Router page · System / Interfaces / VLANs / DHCP / Firewall tabs

function gen(n, b, v) { const a = []; for (let i = 0; i < n; i++) a.push(Math.max(0, b + Math.sin(i/3)*v*0.5 + (Math.random()-0.5)*v)); return a; }

const INTERFACES = [
  { name: 'ether1-wan',  type: 'ethernet', running: true,  ip: '203.0.113.42/30', mac: 'b8:69:f4:11:22:01', mtu: 1500, rx: 142.4, tx: 38.2, role: 'WAN' },
  { name: 'ether2-trunk',type: 'ethernet', running: true,  ip: '—',               mac: 'b8:69:f4:11:22:02', mtu: 1500, rx: 412.8, tx: 322.6, role: 'TRUNK' },
  { name: 'bridge1',     type: 'bridge',   running: true,  ip: '10.0.0.1/24',     mac: 'b8:69:f4:11:22:00', mtu: 1500, rx: 218.2, tx: 412.4, role: 'LAN' },
  { name: 'vlan10-mgmt', type: 'vlan',     running: true,  ip: '10.0.0.1/24',     mac: 'b8:69:f4:11:22:00', mtu: 1500, rx: 4.2, tx: 8.1, role: 'mgmt' },
  { name: 'vlan20-trusted', type: 'vlan',  running: true,  ip: '10.0.1.1/24',     mac: 'b8:69:f4:11:22:00', mtu: 1500, rx: 188.4, tx: 96.2, role: 'trusted' },
  { name: 'vlan30-iot',  type: 'vlan',     running: true,  ip: '10.0.6.1/24',     mac: 'b8:69:f4:11:22:00', mtu: 1500, rx: 14.2, tx: 4.8, role: 'iot' },
  { name: 'vlan40-guest',type: 'vlan',     running: true,  ip: '10.0.7.1/24',     mac: 'b8:69:f4:11:22:00', mtu: 1500, rx: 24.6, tx: 12.4, role: 'guest' },
  { name: 'wg-vpn',      type: 'wireguard',running: true,  ip: '10.99.0.1/24',    mac: '—',                  mtu: 1420, rx: 1.4, tx: 0.6, role: 'vpn' },
  { name: 'ether8',      type: 'ethernet', running: false, ip: '—',               mac: 'b8:69:f4:11:22:08', mtu: 1500, rx: 0, tx: 0, role: '—' },
];

const FW_RULES = [
  { idx: 0,  chain: 'input',   action: 'accept', proto: 'icmp', src: 'any',          dst: 'any',         comment: 'allow ping', hits: '142k', enabled: true },
  { idx: 1,  chain: 'input',   action: 'accept', proto: 'tcp/22', src: '10.0.0.0/24', dst: 'this router', comment: 'ssh from mgmt', hits: '14',  enabled: true },
  { idx: 2,  chain: 'input',   action: 'drop',   proto: 'any',  src: '!10.0.0.0/16', dst: 'this router', comment: 'block wan to router', hits: '88.2k', enabled: true },
  { idx: 3,  chain: 'forward', action: 'fasttrack', proto: 'any', src: 'established',dst: 'related',     comment: 'fasttrack est+rel', hits: '14.2M', enabled: true },
  { idx: 4,  chain: 'forward', action: 'accept', proto: 'any',  src: 'vlan20',       dst: 'wan',         comment: 'trusted → wan', hits: '8.4M', enabled: true },
  { idx: 5,  chain: 'forward', action: 'accept', proto: 'any',  src: 'vlan30',       dst: 'wan',         comment: 'iot → wan (no lan)', hits: '2.1M', enabled: true },
  { idx: 6,  chain: 'forward', action: 'drop',   proto: 'any',  src: 'vlan30',       dst: 'vlan20',      comment: 'iot ⇸ trusted', hits: '418', enabled: true },
  { idx: 7,  chain: 'forward', action: 'drop',   proto: 'any',  src: 'vlan40',       dst: '!wan',        comment: 'guest only wan', hits: '12.8k', enabled: true },
  { idx: 8,  chain: 'forward', action: 'log',    proto: 'tcp/3389', src: 'wan',      dst: 'any',         comment: 'log rdp scans', hits: '38', enabled: false },
];

const DHCP_LEASES = [
  { ip: '10.0.1.12', mac: 'a4:bb:6d:42:18:90', name: 'nas-01', exp: '22h', server: 'trusted', static: true },
  { ip: '10.0.1.42', mac: 'b8:27:eb:1c:55:0a', name: 'lab-tower', exp: '14h', server: 'trusted', static: false },
  { ip: '10.0.5.18', mac: 'f0:18:98:34:7a:b2', name: 'mbp-oleh',  exp: '8h',  server: 'trusted', static: false },
  { ip: '10.0.7.4',  mac: 'ec:71:db:09:44:55', name: 'cam-yard',  exp: '−',  server: 'iot',     static: true },
  { ip: '10.0.6.42', mac: '24:6f:28:a4:00:bb', name: 'esp32-bdrm',exp: '6h',  server: 'iot',     static: false },
  { ip: '10.0.0.55', mac: '5c:b9:01:a4:88:ee', name: 'printer-hp',exp: '−',  server: 'mgmt',    static: true },
];

function RouterHeader() {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 64, height: 64, background: 'var(--surface-2)', border: 'var(--hairline) solid var(--border-strong)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
        <Icon name="router" size={28} stroke={1.4} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 className="t-h1" style={{ margin: 0 }}>MikroTik · RB5009UG+S+IN</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 8px', borderRadius: 'var(--radius-pill)', background: 'rgba(74,222,128,0.10)', border: 'var(--hairline) solid rgba(74,222,128,0.30)', color: 'var(--status-online)', font: '600 10px var(--font-sans)', letterSpacing: '0.06em' }}>
            <StatusDot status="online" pulse size={5} />CONNECTED
          </span>
        </div>
        <div className="mono" style={{ font: '500 12px var(--font-mono)', color: 'var(--text-dim)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>RouterOS 7.16</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>arm64 · 1.4GHz · 1GB</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span>uptime 14d 6h 22m</span>
          <span style={{ color: 'var(--text-faint)' }}>·</span>
          <span style={{ color: 'var(--accent-cyan)' }}>10.0.0.1 (mgmt)</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn"><Icon name="refresh" size={12} /><span>Reboot</span></button>
        <button className="btn"><Icon name="service" size={12} /><span>Backup</span></button>
        <button className="btn btn-primary"><Icon name="cmd" size={12} /><span>Open terminal</span></button>
      </div>
    </div>
  );
}

function RouterTabs({ active = 'Interfaces' }) {
  const tabs = ['System', 'Interfaces', 'VLANs', 'Routes', 'DHCP', 'Firewall', 'NAT', 'DNS', 'WireGuard'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: 'var(--hairline) solid var(--border)' }}>
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <span key={t} style={{
            padding: '8px 14px',
            font: `${isActive ? 600 : 500} 12.5px var(--font-sans)`,
            color: isActive ? 'var(--text)' : 'var(--text-mute)',
            borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            marginBottom: -1,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {t}
            {t === 'Firewall' && <span style={{ padding: '1px 5px', background: 'rgba(245,158,11,0.18)', color: 'var(--status-warning)', borderRadius: 3, font: '500 9.5px var(--font-mono)' }}>2</span>}
          </span>
        );
      })}
    </div>
  );
}

Object.assign(window, { RouterHeader, RouterTabs, INTERFACES, FW_RULES, DHCP_LEASES, gen });
