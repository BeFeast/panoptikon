/* global React, Icon, StatusDot */
// settings.jsx — Settings index — a tile-based directory for many items

const SETTINGS_GROUPS = [
  {
    label: 'Router',
    accent: 'var(--primary)',
    items: [
      { id: 'router-mikrotik', icon: 'router', name: 'MikroTik',  desc: 'RouterOS 7 REST API, primary router', meta: 'connected · v7.16', status: 'online' },
      { id: 'router-pfsense',  icon: 'router', name: 'pfSense',   desc: 'CE 2.7 · backups every 6h', meta: 'connected · drift 1', status: 'warning' },
      { id: 'router-xiaomi',   icon: 'router', name: 'Xiaomi',    desc: 'Mesh hub · firmware locked', meta: 'connected · 2h', status: 'online' },
      { id: 'nat',             icon: 'nat',    name: 'NAT & port maps', desc: '14 active mappings · 3 reserved', meta: '14/512 used', status: 'online' },
      { id: 'qos',             icon: 'qos',    name: 'QoS classes', desc: '5 classes · 90% sustained capacity', meta: '5 classes', status: 'warning' },
      { id: 'mesh-cfg',        icon: 'mesh',   name: 'Wi-Fi mesh',  desc: '3 APs · 802.11ax · 6GHz disabled', meta: '3 APs', status: 'online' },
    ],
  },
  {
    label: 'DNS · networking',
    accent: 'var(--accent-cyan)',
    items: [
      { id: 'dns',          icon: 'dns',  name: 'DNS resolver', desc: 'unbound · 14ms p50 · 38ms p99', meta: '24k qps · 24h', status: 'online' },
      { id: 'dns-block',    icon: 'dns',  name: 'Blocklists',   desc: '5 lists · 1.2M domains · 11.8k blocks/24h', meta: '5 lists', status: 'online' },
      { id: 'dns-security', icon: 'lock', name: 'DNS security', desc: 'DoT enforced · DoH allowed for trusted', meta: 'enforced', status: 'online' },
      { id: 'ddns',         icon: 'globe', name: 'Dynamic DNS', desc: 'Cloudflare · 2 records · 3min interval', meta: '2 records', status: 'online' },
      { id: 'tunnel',       icon: 'tunnel', name: 'Cloudflare tunnel', desc: '4 services exposed · ws-3 unreachable', meta: '4 routes', status: 'warning' },
      { id: 'caddy',        icon: 'caddy', name: 'Caddy proxy', desc: '12 reverse-proxy routes · auto TLS', meta: '12 routes', status: 'online' },
    ],
  },
  {
    label: 'Certificates · security',
    accent: 'var(--accent-violet)',
    items: [
      { id: 'cert',     icon: 'cert',  name: 'Certificates',  desc: '4 active · 1 expiring in 6d', meta: '4 active', status: 'warning' },
      { id: 'password', icon: 'lock',  name: 'Operator auth',  desc: 'argon2id · TOTP recommended', meta: 'TOTP off', status: 'warning' },
      { id: 'audit',    icon: 'log',   name: 'Audit log',      desc: '14d retention · 218 events · 24h', meta: '218 evt', status: 'online' },
      { id: 'sessions', icon: 'eye',   name: 'Active sessions', desc: '2 browser · 0 API tokens · 1 agent', meta: '3 active', status: 'online' },
    ],
  },
  {
    label: 'Fleet · telemetry',
    accent: 'var(--status-online)',
    items: [
      { id: 'agents',     icon: 'agent',   name: 'Agents',         desc: 'panopticon-agent 0.8.1 · 12 of 14 online', meta: '12/14', status: 'warning' },
      { id: 'retention',  icon: 'log',     name: 'Data retention', desc: 'metrics 14d · netflow 7d · audit 14d', meta: 'auto', status: 'online' },
      { id: 'prometheus', icon: 'plug',    name: 'Prometheus export', desc: '/metrics public · 8 series · auto', meta: 'enabled', status: 'online' },
      { id: 'config-backup', icon: 'service', name: 'Config backup', desc: 'last · 14m ago · S3 + local snapshot', meta: 'every 6h', status: 'online' },
    ],
  },
  {
    label: 'Notifications',
    accent: 'var(--status-warning)',
    items: [
      { id: 'alert-rules', icon: 'alert',    name: 'Alert rules',  desc: '12 rules · 4 firing now', meta: '12 rules · 4 firing', status: 'warning' },
      { id: 'email',       icon: 'plug',     name: 'Email · SMTP', desc: 'mail.lan · verified · last 14m', meta: 'configured', status: 'online' },
      { id: 'webhooks',    icon: 'plug',     name: 'Webhooks',     desc: '2 endpoints · Discord + ntfy', meta: '2 endpoints', status: 'online' },
    ],
  },
  {
    label: 'Advanced',
    accent: 'var(--text-mute)',
    items: [
      { id: 'advanced', icon: 'sliders', name: 'Advanced',        desc: 'Show legacy routers · debug · experimental flags', meta: '3 experiments on', status: 'inactive' },
      { id: 'about',    icon: 'service', name: 'About · build',   desc: 'v0.8.1 · build e7998f1 · MIT', meta: 'up 14d 6h', status: 'inactive' },
    ],
  },
];

function SettingsTile({ item, accent }) {
  const statusColor = {
    online: 'var(--status-online)',
    warning: 'var(--status-warning)',
    offline: 'var(--status-offline)',
    inactive: 'var(--text-mute)',
  }[item.status];
  return (
    <div className="card" style={{
      padding: 14,
      cursor: 'pointer',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      position: 'relative',
    }}>
      {/* Status pip top-right */}
      {item.status !== 'inactive' && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          width: 6, height: 6, borderRadius: '50%',
          background: statusColor,
          boxShadow: item.status === 'online' ? `0 0 0 2px rgba(74,222,128,0.18)` : item.status === 'warning' ? '0 0 0 2px rgba(245,158,11,0.18)' : '0 0 0 2px rgba(244,63,94,0.18)',
        }} />
      )}

      {/* Icon */}
      <div style={{
        flex: '0 0 32px',
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-2)',
        border: 'var(--hairline) solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: accent,
      }}>
        <Icon name={item.icon} size={15} color={accent} stroke={1.6} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ font: '600 13px var(--font-sans)', color: 'var(--text)' }}>{item.name}</span>
        </div>
        <div className="t-small" style={{ color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: 6 }}>{item.desc}</div>
        <div className="mono" style={{ font: '500 10.5px var(--font-mono)', color: 'var(--text-mute)' }}>{item.meta}</div>
      </div>
    </div>
  );
}

function Settings({ direction = 'mesh' }) {
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="t-micro">Configuration</div>
          <h1 className="t-display" style={{ margin: '4px 0 6px' }}>Settings</h1>
          <div className="t-small mono" style={{ color: 'var(--text-mute)' }}>
            22 items · 6 groups <span style={{ color: 'var(--text-faint)' }}>·</span> 4 need attention
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="btn"><Icon name="log" size={12} /><span>Open audit log</span></div>
          <div className="btn"><Icon name="service" size={12} /><span>Export config</span></div>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
          <Icon name="search" size={14} color="var(--text-mute)" />
          <input
            placeholder="search settings · e.g. ‘expiring cert’ ‘dns’ ‘backup’"
            style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', font: '400 13px var(--font-sans)' }}
          />
          <kbd className="mono" style={{ font: '500 10px var(--font-mono)', color: 'var(--text-mute)', padding: '1px 5px', background: 'var(--surface-2)', borderRadius: 3, border: 'var(--hairline) solid var(--border)' }}>⌘K</kbd>
        </div>
        <div style={{ borderTop: 'var(--hairline) solid var(--border)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="t-micro">Quick filters</span>
          {[
            { label: 'Needs attention', count: 4, color: 'var(--status-warning)' },
            { label: 'Recently changed', count: 3, color: 'var(--accent-cyan)' },
            { label: 'Connected services', count: 12 },
            { label: 'Experimental', count: 3 },
          ].map((f) => (
            <span key={f.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 9px',
              background: 'var(--surface-2)',
              border: `var(--hairline) solid ${f.color || 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              font: '500 11px var(--font-sans)',
              color: f.color || 'var(--text-dim)',
              cursor: 'pointer',
            }}>
              {f.label}
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-mute)' }}>{f.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Groups */}
      {SETTINGS_GROUPS.map((g) => (
        <div key={g.label}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 3, height: 12, background: g.accent, alignSelf: 'center' }} />
            <h3 className="t-h3" style={{ margin: 0 }}>{g.label}</h3>
            <span className="mono" style={{ font: '500 11px var(--font-mono)', color: 'var(--text-mute)' }}>{g.items.length} items</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {g.items.map((it) => <SettingsTile key={it.id} item={it} accent={g.accent} />)}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div style={{
        marginTop: 6,
        padding: '12px 14px',
        background: 'var(--surface-1)',
        border: 'var(--hairline) dashed var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        font: '400 11px var(--font-mono)',
        color: 'var(--text-mute)',
      }}>
        <span>Tip · ⌘K from anywhere to search across settings, devices, alerts, and runbooks.</span>
        <span>Last config change · 14m ago by <span style={{ color: 'var(--text)' }}>operator</span></span>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
