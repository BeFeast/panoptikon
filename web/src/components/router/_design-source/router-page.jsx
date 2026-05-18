/* global React, Icon, StatusDot, Spark, RouterHeader, RouterTabs, INTERFACES, FW_RULES, DHCP_LEASES, gen */
// router-page.jsx — The MikroTik page layout

function ifaceTypeBadge(t) {
  const m = {
    ethernet: ['ether',    'var(--status-online)'],
    bridge:   ['bridge',   'var(--accent-cyan)'],
    vlan:     ['vlan',     'var(--accent-violet)'],
    wireguard:['wg',       'var(--status-warning)'],
  }[t] || [t, 'var(--text-mute)'];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-2)',
      border: 'var(--hairline) solid var(--border)',
      color: m[1],
      font: '500 10px var(--font-mono)',
    }}>{m[0]}</span>
  );
}

function actionBadge(a) {
  const m = {
    accept:    'var(--status-online)',
    drop:      'var(--status-offline)',
    fasttrack: 'var(--accent-cyan)',
    log:       'var(--status-warning)',
    reject:    'var(--status-offline)',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px',
      borderRadius: 'var(--radius-sm)',
      background: `${m[a] || 'var(--text-mute)'}1F`,
      color: m[a] || 'var(--text-mute)',
      font: '500 10px var(--font-mono)',
      border: `var(--hairline) solid ${m[a] || 'var(--border)'}`,
      borderColor: 'transparent',
    }}>{a}</span>
  );
}

function RouterPage({ direction = 'mesh' }) {
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <RouterHeader />

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { k: 'CPU',         v: '14', u: '%',    spark: gen(28, 18, 12), color: 'var(--accent-cyan)' },
          { k: 'Memory',      v: '342', u: 'MB', spark: gen(28, 340, 12), color: 'var(--accent-violet)' },
          { k: 'Temperature', v: '52', u: '°C', spark: gen(28, 50, 4), color: 'var(--status-warning)' },
          { k: 'WAN · RX',    v: '418', u: 'Mbps', spark: gen(28, 200, 120), color: 'var(--status-info)' },
          { k: 'WAN · TX',    v: '96',  u: 'Mbps', spark: gen(28, 60, 38),   color: 'var(--accent-violet)' },
          { k: 'Sessions',    v: '4,218', u: 'NAT', spark: gen(28, 2200, 800), color: 'var(--text)' },
        ].map((m) => (
          <div key={m.k} className="card" style={{ padding: 14 }}>
            <div className="t-micro">{m.k}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
              <span className="mono" style={{ font: '600 22px var(--font-mono)', color: m.color, lineHeight: 1 }}>{m.v}</span>
              <span className="t-small mono" style={{ color: 'var(--text-mute)' }}>{m.u}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Spark data={m.spark} width={180} height={26} color={m.color} />
            </div>
          </div>
        ))}
      </div>

      <RouterTabs active="Interfaces" />

      {/* Interfaces table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 className="t-h3">Interfaces</h3>
            <span className="mono" style={{ font: '500 11px var(--font-mono)', color: 'var(--text-mute)' }}>9 total · 8 running · 1 down</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm"><Icon name="filter" size={11} /><span>Type · all</span></button>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={11} /><span>Add</span></button>
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 1.4fr 60px 1.2fr 1.4fr 60px 80px 80px 90px 28px',
          padding: '8px 14px', font: '600 9.5px var(--font-sans)', letterSpacing: '0.08em', color: 'var(--text-mute)',
          textTransform: 'uppercase', borderTop: 'var(--hairline) solid var(--border)', borderBottom: 'var(--hairline) solid var(--border)',
        }}>
          <span>State</span>
          <span>Interface</span>
          <span>Type</span>
          <span>IP / role</span>
          <span>MAC</span>
          <span>MTU</span>
          <span style={{ textAlign: 'right' }}>RX GB</span>
          <span style={{ textAlign: 'right' }}>TX GB</span>
          <span>24h</span>
          <span />
        </div>
        {INTERFACES.map((it, i) => (
          <div key={it.name} style={{
            display: 'grid', gridTemplateColumns: '60px 1.4fr 60px 1.2fr 1.4fr 60px 80px 80px 90px 28px',
            padding: '8px 14px', alignItems: 'center',
            borderBottom: i < INTERFACES.length - 1 ? 'var(--hairline) solid var(--border)' : 'none',
            background: !it.running ? 'rgba(244,63,94,0.03)' : 'transparent',
            font: '400 12.5px var(--font-sans)',
          }}>
            <span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                font: '600 9px var(--font-sans)', letterSpacing: '0.06em',
                padding: '1px 6px', borderRadius: 2,
                background: it.running ? 'rgba(74,222,128,0.10)' : 'var(--surface-2)',
                color: it.running ? 'var(--status-online)' : 'var(--text-mute)',
                border: `var(--hairline) solid ${it.running ? 'rgba(74,222,128,0.30)' : 'var(--border)'}`,
              }}><span style={{ width: 4, height: 4, borderRadius: 2, background: it.running ? 'var(--status-online)' : 'var(--status-offline)' }} />{it.running ? 'UP' : 'DOWN'}</span>
            </span>
            <span className="mono" style={{ color: 'var(--text)', fontWeight: 500 }}>{it.name}</span>
            <span>{ifaceTypeBadge(it.type)}</span>
            <span style={{ minWidth: 0 }}>
              <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 11.5 }}>{it.ip}</div>
              {it.role !== '—' && <div style={{ font: '500 10px var(--font-sans)', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{it.role}</div>}
            </span>
            <span className="mono" style={{ color: 'var(--text-mute)', fontSize: 11 }}>{it.mac}</span>
            <span className="mono" style={{ color: 'var(--text-mute)', fontSize: 11 }}>{it.mtu}</span>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--text)' }}>{it.rx.toFixed(1)}</span>
            <span className="mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{it.tx.toFixed(1)}</span>
            <span><Spark data={gen(20, 30 + it.rx / 5, 18)} width={70} height={20} color={it.running ? 'var(--status-info)' : 'var(--text-mute)'} /></span>
            <span style={{ color: 'var(--text-mute)', display: 'flex', justifyContent: 'flex-end' }}><Icon name="chevron-right" size={12} /></span>
          </div>
        ))}
      </div>

      {/* Two-pane — Firewall + DHCP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 className="t-h3">Firewall rules</h3>
              <span className="mono" style={{ font: '500 11px var(--font-mono)', color: 'var(--text-mute)' }}>9 rules · 2 disabled · drag to reorder</span>
            </div>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={11} /><span>New rule</span></button>
          </div>
          <div style={{ borderTop: 'var(--hairline) solid var(--border)' }}>
            {FW_RULES.map((r, i) => (
              <div key={r.idx} style={{
                display: 'grid', gridTemplateColumns: '22px 30px 70px 70px 1fr 1fr 1.4fr 60px',
                padding: '7px 14px', alignItems: 'center', gap: 8,
                borderBottom: i < FW_RULES.length - 1 ? 'var(--hairline) solid var(--border)' : 'none',
                font: '400 12px var(--font-sans)',
                opacity: r.enabled ? 1 : 0.55,
              }}>
                <span style={{ color: 'var(--text-faint)', cursor: 'grab' }}>⋮⋮</span>
                <span className="mono" style={{ color: 'var(--text-mute)', fontSize: 11 }}>{r.idx}</span>
                <span style={{ font: '500 10.5px var(--font-mono)', color: 'var(--text-dim)' }}>{r.chain}</span>
                <span>{actionBadge(r.action)}</span>
                <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.src}</span>
                <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.dst}</span>
                <span style={{ color: 'var(--text-mute)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment}</span>
                <span className="mono" style={{ textAlign: 'right', color: r.action === 'fasttrack' || r.action === 'accept' ? 'var(--text)' : 'var(--status-warning)', fontSize: 11 }}>{r.hits}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 className="t-h3">DHCP leases</h3>
              <span className="mono" style={{ font: '500 11px var(--font-mono)', color: 'var(--text-mute)' }}>{DHCP_LEASES.length} · 3 static</span>
            </div>
            <button className="btn btn-sm btn-ghost"><Icon name="filter" size={11} /></button>
          </div>
          <div style={{ borderTop: 'var(--hairline) solid var(--border)' }}>
            {DHCP_LEASES.map((l, i) => (
              <div key={l.ip} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 70px 22px',
                padding: '8px 14px', alignItems: 'center', gap: 6,
                borderBottom: i < DHCP_LEASES.length - 1 ? 'var(--hairline) solid var(--border)' : 'none',
                font: '400 12px var(--font-sans)',
              }}>
                <span className="mono" style={{ color: 'var(--text)', fontSize: 11.5 }}>{l.ip}</span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 12 }}>{l.name}</div>
                  <div className="mono" style={{ color: 'var(--text-mute)', fontSize: 10 }}>{l.mac} · {l.server}</div>
                </span>
                <span className="mono" style={{ color: l.static ? 'var(--accent-cyan)' : 'var(--text-mute)', fontSize: 11, textAlign: 'right' }}>
                  {l.static ? 'static' : l.exp}
                </span>
                <span style={{ color: 'var(--text-mute)' }}>
                  <Icon name={l.static ? 'pin' : 'plus'} size={11} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="t-small" style={{ color: 'var(--text-dim)' }}>
          Config snapshot · <span className="mono" style={{ color: 'var(--text)' }}>14m ago</span>
          <span style={{ color: 'var(--text-faint)', margin: '0 8px' }}>·</span>
          drift since last apply · <span className="mono" style={{ color: 'var(--status-warning)' }}>1 rule</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm"><Icon name="log" size={11} /><span>Diff against snapshot</span></button>
          <button className="btn btn-sm"><Icon name="service" size={11} /><span>Export .rsc</span></button>
          <button className="btn btn-sm btn-primary"><Icon name="check" size={11} /><span>Apply staged changes</span></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RouterPage });
