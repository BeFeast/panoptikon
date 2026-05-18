/* global React, Icon, StatusDot, Spark */
// topology.jsx — Network topology — the hero Mesh screen

// Build a positioned graph with subnets as clusters
function buildGraph() {
  // 4 subnet clusters around a central router, each with its own hosts.
  const W = 900, H = 580;
  const cx = W / 2, cy = H / 2;
  const router = { id: 'router', label: 'RB5009', kind: 'router', x: cx, y: cy, r: 22 };
  const wan = { id: 'wan', label: 'WAN', kind: 'wan', x: cx, y: 56, r: 16 };

  // Subnet anchors
  const subnets = [
    { id: 'mgmt',    label: 'mgmt',    color: 'var(--accent-cyan)',   ax: cx - 320, ay: cy - 80 },
    { id: 'trusted', label: 'trusted', color: 'var(--status-online)', ax: cx + 320, ay: cy - 90 },
    { id: 'iot',     label: 'iot',     color: 'var(--accent-violet)', ax: cx + 280, ay: cy + 140 },
    { id: 'guest',   label: 'guest',   color: 'var(--status-warning)',ax: cx - 280, ay: cy + 150 },
  ];

  // hosts in each subnet
  const subnetHosts = {
    mgmt:    [['ap-loft', 'ap'], ['ap-yard', 'ap'], ['sw24', 'switch'], ['printer', 'printer']],
    trusted: [['nas-01', 'nas'], ['lab-tower','desktop'], ['plex','desktop'], ['mbp-oleh','laptop'], ['rpi','iot']],
    iot:     [['cam-yard','camera'], ['cam-porch','camera'], ['esp32','iot'], ['tv-living','tv'], ['sonos','tv']],
    guest:   [['phone-1','phone'], ['phone-2','phone'], ['ipad','laptop']],
  };

  const nodes = [router, wan];
  const links = [{ from: 'wan', to: 'router', kind: 'uplink' }];

  subnets.forEach((s) => {
    nodes.push({ id: s.id, label: s.label, kind: 'subnet', x: s.ax, y: s.ay, r: 11, color: s.color });
    links.push({ from: 'router', to: s.id, kind: 'trunk', color: s.color });
    const hosts = subnetHosts[s.id];
    hosts.forEach((h, i) => {
      const angle = (i / hosts.length) * Math.PI * 2;
      const ringR = 76;
      const hx = s.ax + Math.cos(angle) * ringR;
      const hy = s.ay + Math.sin(angle) * ringR;
      const id = `${s.id}/${h[0]}`;
      nodes.push({ id, label: h[0], kind: h[1], x: hx, y: hy, r: 5.5, color: s.color, subnet: s.label });
      links.push({ from: s.id, to: id, kind: 'edge', color: s.color });
    });
  });
  return { nodes, links, W, H };
}

function NodeGlyph({ kind, r = 6, color = 'var(--text-mute)' }) {
  // Geometric variations so kinds are distinguishable at small size.
  const stroke = 1;
  switch (kind) {
    case 'router':
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill="var(--primary)" stroke="var(--accent-cyan)" strokeWidth={1.5} />;
    case 'wan':
      return <polygon points={`0,${-r} ${r * 0.95},${r * 0.6} ${-r * 0.95},${r * 0.6}`} fill="var(--surface-3)" stroke="var(--accent-cyan)" strokeWidth={stroke} />;
    case 'subnet':
      return <rect x={-r * 0.8} y={-r * 0.8} width={r * 1.6} height={r * 1.6} fill="var(--surface-1)" stroke={color} strokeWidth={1.2} transform="rotate(45)" />;
    case 'switch':
      return <rect x={-r} y={-r * 0.5} width={r * 2} height={r} fill="var(--surface-2)" stroke={color} strokeWidth={stroke} rx={1} />;
    case 'ap':
      return <g><circle r={r} fill="none" stroke={color} strokeWidth={stroke} /><circle r={r * 0.55} fill={color} /></g>;
    case 'camera':
      return <g><rect x={-r * 0.9} y={-r * 0.7} width={r * 1.8} height={r * 1.4} rx={r * 0.4} fill="var(--surface-2)" stroke={color} strokeWidth={stroke} /><circle r={r * 0.35} fill={color} /></g>;
    case 'tv':
      return <rect x={-r * 1.1} y={-r * 0.7} width={r * 2.2} height={r * 1.4} rx={1} fill="var(--surface-2)" stroke={color} strokeWidth={stroke} />;
    case 'nas':
      return <g><rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} fill="var(--surface-2)" stroke={color} strokeWidth={stroke} /><line x1={-r * 0.5} y1={0} x2={r * 0.5} y2={0} stroke={color} strokeWidth={stroke} /></g>;
    case 'printer':
      return <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} fill="var(--surface-1)" stroke={color} strokeWidth={stroke} />;
    default:
      return <circle r={r} fill="var(--surface-2)" stroke={color} strokeWidth={stroke} />;
  }
}

function Topology({ direction = 'mesh' }) {
  const g = React.useMemo(() => buildGraph(), []);
  const nodesById = React.useMemo(() => Object.fromEntries(g.nodes.map((n) => [n.id, n])), [g]);

  // Animated flow offset for dashed links
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let raf;
    let last = performance.now();
    const loop = (t) => {
      if (t - last > 16) { setTick((x) => (x + 1) % 1000); last = t; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const selected = nodesById['trusted/nas-01'];

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="t-micro">Network</div>
          <h1 className="t-display" style={{ margin: '4px 0 6px' }}>Topology</h1>
          <div className="t-small mono" style={{ color: 'var(--text-mute)' }}>
            <span>4 subnets · 168 nodes ·</span>
            <span style={{ color: 'var(--accent-cyan)' }}> 142 active edges</span>
            <span style={{ color: 'var(--text-faint)', margin: '0 8px' }}>·</span>
            <span>auto-layout · force-directed</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="btn"><Icon name="filter" size={12} /><span>vlan: all</span><Icon name="chevron-down" size={11} /></div>
          <div className="btn"><Icon name="sliders" size={12} /><span>layout</span></div>
          <div className="btn btn-primary"><Icon name="cmd" size={12} /><span>Trace path</span></div>
        </div>
      </div>

      {/* Body grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, minHeight: 0 }}>
        {/* Graph */}
        <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: 0 }}>
          {/* Blueprint grid bg + subtle corner ticks */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              'linear-gradient(rgba(96,144,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(96,144,212,0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              'radial-gradient(circle at 50% 50%, rgba(56,189,248,0.05), transparent 60%)',
          }} />

          {/* Coord ticks */}
          <div style={{ position: 'absolute', top: 8, left: 10, font: '400 10px var(--font-mono)', color: 'var(--text-faint)' }}>10.0.0.0/16 · sample 4 of 4 subnets</div>
          <div style={{ position: 'absolute', top: 8, right: 10, font: '400 10px var(--font-mono)', color: 'var(--text-faint)' }}>
            zoom 1.00× · {Math.floor(tick / 10)} ticks
          </div>

          <svg viewBox={`0 0 ${g.W} ${g.H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs>
              <radialGradient id="node-glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#38bdf8" stopOpacity="0.3" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Links — animated dashed flow */}
            {g.links.map((l, i) => {
              const a = nodesById[l.from], b = nodesById[l.to];
              if (!a || !b) return null;
              const isTrunk = l.kind === 'trunk' || l.kind === 'uplink';
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={l.color || (isTrunk ? 'var(--accent-cyan)' : 'rgba(96,144,212,0.30)')}
                  strokeWidth={isTrunk ? 1.4 : 0.7}
                  strokeDasharray={isTrunk ? '6 4' : '2 4'}
                  strokeDashoffset={isTrunk ? -tick * 0.6 : 0}
                  opacity={isTrunk ? 0.8 : 0.55}
                />
              );
            })}

            {/* Subnet labels */}
            {g.nodes.filter((n) => n.kind === 'subnet').map((n) => (
              <g key={`lbl-${n.id}`}>
                <rect x={n.x - 28} y={n.y + 18} width={56} height={14} rx={2}
                  fill="var(--surface-1)" stroke={n.color} strokeWidth="0.5" />
                <text x={n.x} y={n.y + 28} textAnchor="middle" fontSize="9.5" fill={n.color} fontFamily="var(--font-mono)" letterSpacing="0.05em" style={{ textTransform: 'uppercase' }}>{n.label}</text>
              </g>
            ))}

            {/* Nodes */}
            {g.nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                {(n.kind === 'router' || (selected && n.id === selected.id)) && (
                  <circle r={n.r + 10} fill="url(#node-glow)" />
                )}
                <NodeGlyph kind={n.kind} r={n.r} color={n.color || 'var(--text-mute)'} />
                {n.kind === 'router' && (
                  <text y={n.r + 14} textAnchor="middle" fontSize="9" fill="var(--text)" fontFamily="var(--font-mono)" letterSpacing="0.04em">{n.label}</text>
                )}
                {n.kind !== 'router' && n.kind !== 'subnet' && n.kind !== 'wan' && (
                  <text y={n.r + 9} textAnchor="middle" fontSize="7.5" fill="var(--text-mute)" fontFamily="var(--font-mono)">{n.label}</text>
                )}
                {n.kind === 'wan' && <text y={n.r + 11} textAnchor="middle" fontSize="8.5" fill="var(--accent-cyan)" fontFamily="var(--font-mono)">{n.label}</text>}

                {/* Selection ring */}
                {selected && n.id === selected.id && (
                  <circle r={n.r + 6} fill="none" stroke="var(--accent-cyan)" strokeWidth="1" strokeDasharray="3 3" />
                )}
              </g>
            ))}
          </svg>

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            display: 'flex', gap: 10, padding: '6px 10px',
            background: 'rgba(6,15,37,0.85)',
            border: 'var(--hairline) solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            font: '500 10px var(--font-mono)',
            color: 'var(--text-dim)',
            backdropFilter: 'blur(8px)',
          }}>
            {[
              ['mgmt', 'var(--accent-cyan)'],
              ['trusted', 'var(--status-online)'],
              ['iot', 'var(--accent-violet)'],
              ['guest', 'var(--status-warning)'],
            ].map(([l, c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, background: c, borderRadius: 1, transform: 'rotate(45deg)' }} />
                {l}
              </span>
            ))}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            display: 'flex', flexDirection: 'column',
            background: 'rgba(6,15,37,0.85)',
            border: 'var(--hairline) solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            backdropFilter: 'blur(8px)',
          }}>
            <button className="btn btn-ghost" style={{ height: 24, padding: '0 8px', border: 0 }}><Icon name="plus" size={11} /></button>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <button className="btn btn-ghost" style={{ height: 24, padding: '0 8px', border: 0 }}><span style={{ font: '500 11px var(--font-mono)' }}>1×</span></button>
          </div>
        </div>

        {/* Side panel — selected node detail */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: 'var(--hairline) solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 9.5px var(--font-sans)', color: 'var(--status-online)', padding: '0 7px', height: 18, borderRadius: 'var(--radius-pill)', background: 'rgba(74,222,128,0.10)', border: 'var(--hairline) solid rgba(74,222,128,0.30)' }}>
                <StatusDot status="online" pulse size={5} /> ONLINE
              </span>
              <span style={{ font: '500 10px var(--font-mono)', color: 'var(--text-faint)' }}>trusted · 10.0.1.0/24</span>
            </div>
            <h3 style={{ margin: 0, font: '600 16px var(--font-sans)' }}>nas-01</h3>
            <div className="mono" style={{ font: '400 11px var(--font-mono)', color: 'var(--text-dim)', marginTop: 3 }}>10.0.1.12 · a4:bb:6d:42:18:90 · Synology</div>
          </div>

          {/* Live traffic */}
          <div style={{ padding: '12px 14px', borderBottom: 'var(--hairline) solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="t-micro">Live · last 60s</span>
              <span className="mono" style={{ font: '500 11px var(--font-mono)', color: 'var(--status-info)' }}>232 Mbps</span>
            </div>
            <Spark data={Array.from({length: 30}, (_, i) => 100 + Math.sin(i / 2) * 60 + Math.random() * 40)} width={290} height={36} color="var(--status-info)" />
          </div>

          {/* Connected to */}
          <div style={{ padding: '12px 14px', borderBottom: 'var(--hairline) solid var(--border)' }}>
            <div className="t-micro" style={{ marginBottom: 8 }}>Path · 2 hops</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { label: 'WAN', color: 'var(--accent-cyan)' },
                { label: 'RB5009', color: 'var(--primary)' },
                { label: 'sw24', color: 'var(--accent-cyan)' },
                { label: 'nas-01', color: 'var(--status-online)' },
              ].map((h, i, arr) => (
                <React.Fragment key={h.label}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 7px',
                    background: 'var(--surface-2)',
                    border: `var(--hairline) solid ${h.color}`,
                    borderRadius: 'var(--radius-sm)',
                    font: '500 10.5px var(--font-mono)',
                    color: 'var(--text)',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: h.color }} />
                    {h.label}
                  </span>
                  {i < arr.length - 1 && <span style={{ color: 'var(--text-faint)', font: '500 11px var(--font-mono)' }}>→</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="mono" style={{ font: '400 10px var(--font-mono)', color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.5 }}>
              hop 1 · 0.4ms · 1Gbe<br />
              hop 2 · 0.2ms · 2.5Gbe
            </div>
          </div>

          {/* Open ports */}
          <div style={{ padding: '12px 14px', borderBottom: 'var(--hairline) solid var(--border)' }}>
            <div className="t-micro" style={{ marginBottom: 8 }}>Listening · 4 ports</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {[
                ['22', 'ssh', 'var(--status-online)'],
                ['445', 'smb', 'var(--status-info)'],
                ['2049', 'nfs', 'var(--status-info)'],
                ['32400', 'plex', 'var(--accent-violet)'],
              ].map(([port, name, c]) => (
                <span key={port} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px',
                  background: 'var(--surface-2)',
                  borderRadius: 2,
                  font: '500 10.5px var(--font-mono)',
                  color: 'var(--text-dim)',
                }}>
                  <span className="mono" style={{ color: c }}>{port}</span>
                  <span style={{ color: 'var(--text-mute)' }}>{name}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Tags + actions */}
          <div style={{ padding: '12px 14px', flex: 1 }}>
            <div className="t-micro" style={{ marginBottom: 8 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
              {['pinned', 'core', 'backup-target'].map((t) => (
                <span key={t} style={{
                  padding: '2px 7px',
                  background: 'var(--primary-soft)',
                  border: 'var(--hairline) solid rgba(37,99,235,0.30)',
                  borderRadius: 'var(--radius-sm)',
                  font: '500 10.5px var(--font-sans)',
                  color: 'var(--primary)',
                }}>{t}</span>
              ))}
              <span style={{
                padding: '2px 7px',
                background: 'transparent',
                border: 'var(--hairline) dashed var(--border)',
                borderRadius: 'var(--radius-sm)',
                font: '500 10.5px var(--font-sans)',
                color: 'var(--text-mute)',
                cursor: 'pointer',
              }}>+ add</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Icon name="cmd" size={12} /><span>Trace path from here</span>
              </button>
              <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Icon name="log" size={12} /><span>Open detail view</span>
              </button>
              <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Icon name="filter" size={12} /><span>Filter alerts</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Topology });
