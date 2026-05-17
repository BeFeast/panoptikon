'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import {
  Network,
  RefreshCw,
  RotateCcw,
  LayoutGrid,
  Maximize2,
  ExternalLink,
  Copy,
  Check,
  Filter as FilterIcon,
} from 'lucide-react'
import {
  fetchTopologyGraph,
  saveTopologyPositions,
  deleteTopologyPositions,
} from '@/lib/api'
import type { TopologyDevice, TopologyRouter } from '@/lib/types'
import { getDeviceIcon } from '@/lib/device-icons'
import { PageTransition } from '@/components/PageTransition'
import { EmptyState as MeshEmptyState } from '@/components/mesh/state/EmptyState'
import { LoadingState } from '@/components/mesh/state/LoadingState'
import { ErrorState as MeshErrorState } from '@/components/mesh/state/ErrorState'
import {
  DetailsDrawer,
  DetailsHeader,
  DetailsSection,
  DetailsField,
  DetailsFooter,
} from '@/components/mesh/details'
import { StatusDot } from '@/components/mesh/StatusDot'
import { Badge } from '@/components/ui/badge'
import { useWsEvent } from '@/lib/ws'
import Link from 'next/link'

// ─── Types ──────────────────────────────────────────────

type RouterNodeData = {
  label: string
  routerType: string
  wanIp: string | null
  isOnline: boolean
}

type DeviceNodeData = {
  device: TopologyDevice
  trafficBps: number
  subnet: string
}

type SubnetGroupData = {
  label: string
  subnet: string
  deviceCount: number
  onlineCount: number
  width: number
  height: number
}

type RouterNodeType = Node<RouterNodeData, 'routerNode'>
type DeviceNodeType = Node<DeviceNodeData, 'deviceNode'>
type SubnetGroupType = Node<SubnetGroupData, 'subnetGroup'>
type TopologyNode = RouterNodeType | DeviceNodeType | SubnetGroupType

// ─── Mesh palette ───────────────────────────────────────
// Literal hex values are sourced from `/tmp/panopticon-design/panopticon/project/tokens.css`
// (mesh direction). Using inline values is required because React Flow renders
// SVG strokes / fills that don't pick up Tailwind classes.

const MESH = {
  accent: '#38bdf8',
  primary: '#2563eb',
  online: '#34d399',
  offline: '#fb7185',
  warning: '#fbbf24',
  violet: '#a78bfa',
  surface1: '#091633',
  surface2: '#0e2148',
  surface3: '#163065',
  border: 'rgba(96,144,212,0.20)',
  borderStrong: 'rgba(96,144,212,0.40)',
  textDim: '#98aecf',
  textMute: '#5d7799',
} as const

// ─── Helpers ────────────────────────────────────────────

/** Extract /24 subnet from an IP address (e.g. "192.168.1.42" → "192.168.1.0/24") */
function getSubnet(ip: string): string {
  const parts = ip.split('.')
  if (parts.length !== 4) return 'unknown'
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/** Map of subnet → mesh accent color for visual grouping */
const SUBNET_COLORS: Record<string, { bg: string; border: string; text: string }> = {}
const COLOR_PALETTE = [
  { bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.30)',  text: MESH.accent },
  { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.30)',  text: MESH.online },
  { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.30)', text: MESH.violet },
  { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.30)',  text: MESH.warning },
  { bg: 'rgba(37,99,235,0.08)',   border: 'rgba(37,99,235,0.30)',   text: MESH.primary },
  { bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.30)', text: MESH.offline },
]
let colorIndex = 0

function getSubnetColor(subnet: string) {
  if (!SUBNET_COLORS[subnet]) {
    SUBNET_COLORS[subnet] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]
    colorIndex++
  }
  return SUBNET_COLORS[subnet]
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── d3-force Layout ────────────────────────────────────

interface ForceNode extends SimulationNodeDatum {
  id: string
  isRouter?: boolean
  isOnline?: boolean
  subnet?: string
  fx?: number | null
  fy?: number | null
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
}

const ROUTER_WIDTH = 200
const ROUTER_HEIGHT = 80
const DEVICE_WIDTH = 180
const DEVICE_HEIGHT = 68

function computeForceLayout(
  nodeIds: { id: string; isRouter?: boolean; isOnline?: boolean; subnet?: string }[],
  links: { source: string; target: string }[],
  pinnedPositions?: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  const deviceCount = nodeIds.filter((n) => !n.isRouter).length

  const subnets = new Map<string, string[]>()
  nodeIds.forEach((n) => {
    if (!n.isRouter && n.subnet) {
      const existing = subnets.get(n.subnet) || []
      existing.push(n.id)
      subnets.set(n.subnet, existing)
    }
  })

  const subnetAngle = new Map<string, number>()
  const subnetKeys = Array.from(subnets.keys()).sort()
  subnetKeys.forEach((s, i) => {
    subnetAngle.set(s, (2 * Math.PI * i) / Math.max(subnetKeys.length, 1))
  })

  const forceNodes: ForceNode[] = nodeIds.map((n) => {
    const pinned = pinnedPositions?.get(n.id)
    return {
      id: n.id,
      isRouter: n.isRouter,
      isOnline: n.isOnline,
      subnet: n.subnet,
      x: pinned?.x ?? (n.isRouter ? 0 : undefined),
      y: pinned?.y ?? (n.isRouter ? 0 : undefined),
      fx: pinned ? pinned.x : n.isRouter ? 0 : null,
      fy: pinned ? pinned.y : n.isRouter ? 0 : null,
    }
  })

  const forceLinks: ForceLink[] = links.map((l) => ({
    source: l.source,
    target: l.target,
  }))

  const clusterRadius = Math.max(250, 150 + deviceCount * 4)
  const collideRadius = Math.max(DEVICE_WIDTH, DEVICE_HEIGHT) / 2 + 20
  const chargeStrength = deviceCount > 40 ? -600 : deviceCount > 20 ? -450 : -300
  const linkDistance = deviceCount > 40 ? 220 : deviceCount > 20 ? 180 : 150

  const simulation = forceSimulation<ForceNode>(forceNodes)
    .force(
      'link',
      forceLink<ForceNode, ForceLink>(forceLinks)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(0.3),
    )
    .force('charge', forceManyBody<ForceNode>().strength(chargeStrength))
    .force('center', forceCenter(0, 0).strength(0.05))
    .force('collide', forceCollide<ForceNode>(collideRadius))
    .force(
      'x',
      forceX<ForceNode>((d) => {
        if (d.isRouter) return 0
        const angle = subnetAngle.get(d.subnet ?? '') ?? 0
        const radius = d.isOnline ? clusterRadius : clusterRadius * 1.4
        return Math.cos(angle) * radius
      }).strength((d) => (d.isRouter ? 0 : d.isOnline ? 0.2 : 0.1)),
    )
    .force(
      'y',
      forceY<ForceNode>((d) => {
        if (d.isRouter) return 0
        const angle = subnetAngle.get(d.subnet ?? '') ?? 0
        const radius = d.isOnline ? clusterRadius : clusterRadius * 1.4
        return Math.sin(angle) * radius
      }).strength((d) => (d.isRouter ? 0 : d.isOnline ? 0.2 : 0.1)),
    )
    .stop()

  const iterations = deviceCount > 40 ? 500 : 300
  for (let i = 0; i < iterations; i++) {
    simulation.tick()
  }

  forceNodes.forEach((n) => {
    positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
  })

  return positions
}

// ─── Custom Nodes (mesh tokens) ─────────────────────────

function RouterNode({ data }: NodeProps<RouterNodeType>) {
  const routerLabel =
    data.routerType === 'mikrotik'
      ? 'MikroTik'
      : data.routerType === 'pfsense'
        ? 'pfSense'
      : 'Router'

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-mesh-border-strong bg-mesh-surface-2 px-5 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.32)]"
      style={{ width: ROUTER_WIDTH, height: ROUTER_HEIGHT }}
    >
      <Handle type="source" position={Position.Bottom} style={{ background: MESH.accent }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: MESH.accent }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: MESH.accent }} />
      <Handle type="source" position={Position.Top} id="top" style={{ background: MESH.accent }} />
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-mesh-border bg-mesh-surface-3"
        style={{ color: MESH.accent }}
      >
        <Network className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mesh-text">{routerLabel}</p>
        {data.wanIp && (
          <p className="truncate font-mono text-[11px] text-mesh-text-mute">{data.wanIp}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusDot status={data.isOnline ? 'online' : 'offline'} pulse={data.isOnline} size={6} />
          <span className="text-[10px] uppercase tracking-[0.08em] text-mesh-text-mute">
            {data.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  )
}

function DeviceNode({ data }: NodeProps<DeviceNodeType>) {
  const { device } = data
  const { icon: Icon } = getDeviceIcon(
    device.custom_vendor ?? device.vendor,
    device.hostname,
    device.mdns_services,
    device.custom_type ?? device.device_type,
  )
  const displayName =
    device.custom_name || device.name || device.hostname || device.mac
  const primaryIp = device.ips?.[0] || '—'
  const subnetColor = getSubnetColor(data.subnet)
  const hasDhcp = !!device.dhcp_lease_status

  return (
    <div
      className="flex items-center gap-2.5 rounded-md border bg-mesh-surface-1 px-3 py-2.5 shadow-[0_4px_10px_rgba(0,0,0,0.28)] transition-colors hover:bg-mesh-surface-2"
      style={{
        width: DEVICE_WIDTH,
        height: DEVICE_HEIGHT,
        borderColor: subnetColor.border,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: MESH.textMute }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: MESH.textMute }} />
      <Handle type="target" position={Position.Right} id="right" style={{ background: MESH.textMute }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: MESH.textMute }} />
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-mesh-border bg-mesh-surface-2"
        style={{ color: subnetColor.text }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-mesh-text">{displayName}</p>
        <div className="flex items-center gap-1">
          <p className="truncate font-mono text-[10px] text-mesh-text-mute">{primaryIp}</p>
          {hasDhcp && (
            <span
              className="inline-block h-1 w-1 rounded-full"
              style={{ background: MESH.accent }}
              title="DHCP lease"
            />
          )}
        </div>
      </div>
      <StatusDot status={device.is_online ? 'online' : 'offline'} pulse={device.is_online} size={7} />
    </div>
  )
}

function SubnetGroupNode({ data }: NodeProps<SubnetGroupType>) {
  const color = getSubnetColor(data.subnet)
  return (
    <div
      className="rounded-md"
      style={{
        width: data.width,
        height: data.height,
        backgroundColor: color.bg,
        border: `1px dashed ${color.border}`,
      }}
    >
      <div className="flex items-center gap-2 px-4 pt-3 font-mono text-[10.5px]">
        <span className="uppercase tracking-[0.10em]" style={{ color: color.text }}>
          {data.label}
        </span>
        <span className="text-mesh-text-mute">
          {data.onlineCount}/{data.deviceCount} online
        </span>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  routerNode: RouterNode,
  deviceNode: DeviceNode,
  subnetGroup: SubnetGroupNode,
}

// ─── Edge style helpers ─────────────────────────────────

function getEdgeStrokeWidth(bps: number): number {
  if (bps > 10_000_000) return 4
  if (bps > 1_000_000) return 3
  if (bps > 100_000) return 2
  return 1
}

// ─── Device Detail Panel ────────────────────────────────

function DeviceDetailPanel({
  device,
  onClose,
}: {
  device: TopologyDevice
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const ips = device.ips ?? []
  const primaryIp = ips[0] ?? '—'
  const displayName =
    device.custom_name ?? device.name ?? device.hostname ?? 'Unknown Device'
  const effectiveType = device.custom_type ?? device.device_type
  const { label: deviceTypeLabel } = getDeviceIcon(
    device.custom_vendor ?? device.vendor,
    device.hostname,
    device.mdns_services,
    effectiveType,
  )
  const vendorDisplay =
    device.custom_vendor ?? device.vendor
      ? ((device.custom_vendor ?? device.vendor) || '').length > 25
        ? ((device.custom_vendor ?? device.vendor) || '').slice(0, 25) + '…'
        : device.custom_vendor ?? device.vendor
      : null

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const statusPill = (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em]"
      style={{
        color: device.is_online ? MESH.online : MESH.offline,
        background: device.is_online
          ? 'rgba(52,211,153,0.10)'
          : 'rgba(251,113,133,0.10)',
        borderColor: device.is_online
          ? 'rgba(52,211,153,0.30)'
          : 'rgba(251,113,133,0.30)',
      }}
    >
      <StatusDot
        status={device.is_online ? 'online' : 'offline'}
        pulse={device.is_online}
        size={5}
      />
      {device.is_online ? 'Online' : 'Offline'}
    </span>
  )

  const metaLine = (
    <>
      {vendorDisplay ? <span>{vendorDisplay}</span> : null}
      {vendorDisplay ? <span className="px-1.5 text-mesh-text-faint">·</span> : null}
      <span>{deviceTypeLabel ?? 'device'}</span>
      {!device.is_online ? (
        <>
          <span className="px-1.5 text-mesh-text-faint">·</span>
          <span>last seen {timeAgo(device.last_seen_at)}</span>
        </>
      ) : null}
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <DetailsHeader icon="plug" title={displayName} pills={statusPill} meta={metaLine} />

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <DetailsSection title="Identity">
          <div className="flex flex-col gap-2">
            <DetailsField
              label="IP Address"
              value={
                <span className="inline-flex items-center gap-1">
                  <span className="truncate">{primaryIp}</span>
                  <button
                    onClick={() => handleCopy(primaryIp, 'ip')}
                    className="ml-1 shrink-0 text-mesh-text-mute transition-colors hover:text-mesh-text"
                    aria-label="Copy IP"
                  >
                    {copied === 'ip' ? (
                      <Check className="h-3 w-3" style={{ color: MESH.online }} />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </span>
              }
            />
            {ips.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {ips.slice(1).map((ip) => (
                  <span
                    key={ip}
                    className="inline-block rounded-sm border border-mesh-border bg-mesh-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-mesh-text-dim"
                  >
                    {ip}
                  </span>
                ))}
              </div>
            )}
            <DetailsField
              label="MAC Address"
              value={
                <span className="inline-flex items-center gap-1">
                  <span className="truncate">{device.mac}</span>
                  <button
                    onClick={() => handleCopy(device.mac, 'mac')}
                    className="ml-1 shrink-0 text-mesh-text-mute transition-colors hover:text-mesh-text"
                    aria-label="Copy MAC"
                  >
                    {copied === 'mac' ? (
                      <Check className="h-3 w-3" style={{ color: MESH.online }} />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </span>
              }
            />
            {device.hostname && <DetailsField label="Hostname" value={device.hostname} />}
            {device.vendor && <DetailsField label="Vendor" value={device.vendor} />}
            <DetailsField label="First seen" value={timeAgo(device.first_seen_at)} />
            <DetailsField label="Last seen" value={timeAgo(device.last_seen_at)} />
          </div>
        </DetailsSection>

        {(device.os_family || effectiveType || device.device_model) && (
          <DetailsSection title="Device identity">
            <div className="flex flex-col gap-2">
              {device.os_family && (
                <DetailsField
                  label="OS"
                  value={
                    device.os_version
                      ? `${device.os_family} ${device.os_version}`
                      : device.os_family
                  }
                />
              )}
              {effectiveType && <DetailsField label="Type" value={effectiveType} />}
              {device.device_brand && (
                <DetailsField label="Brand" value={device.device_brand} />
              )}
              {device.device_model && (
                <DetailsField label="Model" value={device.device_model} />
              )}
            </div>
          </DetailsSection>
        )}

        {(device.dhcp_lease_status || device.bridge_port) && (
          <DetailsSection title="Network">
            <div className="flex flex-col gap-2">
              {device.dhcp_lease_status && (
                <DetailsField label="DHCP status" value={device.dhcp_lease_status} />
              )}
              {device.dhcp_hostname && (
                <DetailsField label="DHCP hostname" value={device.dhcp_hostname} />
              )}
              {device.dhcp_server && (
                <DetailsField label="DHCP server" value={device.dhcp_server} />
              )}
              {device.dhcp_expires && (
                <DetailsField label="Lease expires" value={device.dhcp_expires} />
              )}
              {device.bridge_port && (
                <DetailsField label="Bridge port" value={device.bridge_port} />
              )}
              {device.bridge_name && <DetailsField label="Bridge" value={device.bridge_name} />}
            </div>
          </DetailsSection>
        )}

        {device.mdns_services && (
          <DetailsSection title="mDNS services">
            <div className="flex flex-wrap gap-1.5">
              {device.mdns_services.split(',').map((svc) => (
                <Badge
                  key={svc.trim()}
                  variant="outline"
                  className="border-mesh-border text-[10px] text-mesh-text-dim"
                >
                  {svc.trim()}
                </Badge>
              ))}
            </div>
          </DetailsSection>
        )}

        {(device.location || device.owner || device.tags) && (
          <DetailsSection title="Asset info">
            <div className="flex flex-col gap-2">
              {device.location && <DetailsField label="Location" value={device.location} />}
              {device.owner && <DetailsField label="Owner" value={device.owner} />}
              {device.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {device.tags.split(',').map((tag) => (
                    <Badge
                      key={tag.trim()}
                      variant="outline"
                      className="border-mesh-border text-[10px] text-mesh-text-dim"
                    >
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </DetailsSection>
        )}
      </div>

      <DetailsFooter
        hint={`id ${device.id.slice(0, 8)}`}
        actions={
          <>
            <Link
              href={`/devices?selected=${device.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open device
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
            >
              Close
            </button>
          </>
        }
      />
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export default function TopologyPage() {
  return (
    <ReactFlowProvider>
      <TopologyPageInner />
    </ReactFlowProvider>
  )
}

function TopologyPageInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<TopologyDevice | null>(null)
  const { fitView } = useReactFlow()

  const pinnedRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const routerInfoRef = useRef<TopologyRouter | null>(null)
  const lastLayoutInputsRef = useRef<{
    layoutNodes: { id: string; isRouter?: boolean; isOnline?: boolean; subnet?: string }[]
    layoutLinks: { source: string; target: string }[]
  } | null>(null)

  const buildGraph = useCallback(
    async (isInitial: boolean) => {
      try {
        const graph = await fetchTopologyGraph()
        const { devices, router, positions } = graph

        routerInfoRef.current = router

        if (isInitial) {
          pinnedRef.current = new Map(
            positions
              .filter((p) => p.pinned)
              .map((p) => [p.node_id, { x: p.x, y: p.y }]),
          )
        }

        const deviceSubnets = new Map<string, string>()
        devices.forEach((d) => {
          const ip = d.ips?.[0]
          deviceSubnets.set(d.id, ip ? getSubnet(ip) : 'unknown')
        })

        const subnetDevices = new Map<string, TopologyDevice[]>()
        devices.forEach((d) => {
          const subnet = deviceSubnets.get(d.id) || 'unknown'
          const existing = subnetDevices.get(subnet) || []
          existing.push(d)
          subnetDevices.set(subnet, existing)
        })

        const layoutNodes = [
          { id: 'router', isRouter: true, isOnline: true, subnet: undefined },
          ...devices.map((d) => ({
            id: d.id,
            isRouter: false,
            isOnline: d.is_online,
            subnet: deviceSubnets.get(d.id),
          })),
        ]

        const layoutLinks = devices.map((d) => ({
          source: 'router',
          target: d.id,
        }))

        lastLayoutInputsRef.current = { layoutNodes, layoutLinks }

        let positionMap: Map<string, { x: number; y: number }>

        if (isInitial) {
          positionMap = computeForceLayout(layoutNodes, layoutLinks, pinnedRef.current)
        } else {
          positionMap = new Map()
        }

        const deviceNodes: TopologyNode[] = devices.map((device) => {
          const subnet = deviceSubnets.get(device.id) || 'unknown'
          const totalBps = (device.rx_bps || 0) + (device.tx_bps || 0)
          const pos = positionMap.get(device.id)
          return {
            id: device.id,
            type: 'deviceNode' as const,
            position: pos
              ? { x: pos.x - DEVICE_WIDTH / 2, y: pos.y - DEVICE_HEIGHT / 2 }
              : { x: 0, y: 0 },
            data: {
              device,
              trafficBps: totalBps,
              subnet,
            },
            draggable: true,
            zIndex: 10,
          }
        })

        const routerPos = positionMap.get('router')
        const routerNode: TopologyNode = {
          id: 'router',
          type: 'routerNode',
          position: routerPos
            ? {
                x: routerPos.x - ROUTER_WIDTH / 2,
                y: routerPos.y - ROUTER_HEIGHT / 2,
              }
            : { x: -ROUTER_WIDTH / 2, y: -ROUTER_HEIGHT / 2 },
          data: {
            label: router.hostname || 'Router',
            routerType: router.router_type,
            wanIp: router.wan_ip,
            isOnline: router.is_online,
          },
          draggable: true,
          zIndex: 10,
        }

        const subnetGroupNodes: TopologyNode[] = []
        if (isInitial) {
          subnetDevices.forEach((devs, subnet) => {
            if (subnet === 'unknown' || devs.length === 0) return

            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity
            devs.forEach((d) => {
              const pos = positionMap.get(d.id)
              if (pos) {
                minX = Math.min(minX, pos.x)
                minY = Math.min(minY, pos.y)
                maxX = Math.max(maxX, pos.x)
                maxY = Math.max(maxY, pos.y)
              }
            })

            if (!isFinite(minX)) return

            const padding = 60
            const width = maxX - minX + DEVICE_WIDTH + padding * 2
            const height = maxY - minY + DEVICE_HEIGHT + padding * 2

            subnetGroupNodes.push({
              id: `subnet-${subnet}`,
              type: 'subnetGroup',
              position: {
                x: minX - DEVICE_WIDTH / 2 - padding,
                y: minY - DEVICE_HEIGHT / 2 - padding - 10,
              },
              data: {
                label: subnet,
                subnet,
                deviceCount: devs.length,
                onlineCount: devs.filter((d) => d.is_online).length,
                width: Math.max(width, 200),
                height: Math.max(height, 120),
              },
              draggable: false,
              selectable: false,
              zIndex: 0,
            })
          })
        }

        const allEdges: Edge[] = devices.map((device) => {
          const totalBps = (device.rx_bps || 0) + (device.tx_bps || 0)
          return {
            id: `router-${device.id}`,
            source: 'router',
            target: device.id,
            type: 'default',
            animated: totalBps > 100_000,
            style: {
              stroke: device.is_online ? MESH.accent : MESH.surface3,
              strokeWidth: getEdgeStrokeWidth(totalBps),
              opacity: device.is_online ? 0.55 : 0.2,
            },
            zIndex: 5,
          }
        })

        if (isInitial) {
          setNodes([...subnetGroupNodes, routerNode, ...deviceNodes])
          setEdges(allEdges)
        } else {
          setNodes((prev) => {
            const posMap = new Map(prev.map((n) => [n.id, n.position]))
            const updated: TopologyNode[] = []

            subnetDevices.forEach((devs, subnet) => {
              if (subnet === 'unknown' || devs.length === 0) return
              const existingPos = posMap.get(`subnet-${subnet}`)
              const existing = prev.find((n) => n.id === `subnet-${subnet}`)
              if (existing && existing.type === 'subnetGroup') {
                updated.push({
                  ...existing,
                  position: existingPos ?? existing.position,
                  data: {
                    ...(existing.data as SubnetGroupData),
                    deviceCount: devs.length,
                    onlineCount: devs.filter((d) => d.is_online).length,
                  },
                } as SubnetGroupType)
              }
            })

            updated.push({
              ...routerNode,
              position: posMap.get('router') ?? routerNode.position,
            })

            deviceNodes.forEach((n) => {
              updated.push({
                ...n,
                position: posMap.get(n.id) ?? n.position,
              })
            })

            return updated
          })
          setEdges(allEdges)
        }

        setLastRefresh(new Date())
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load topology')
      } finally {
        setLoading(false)
      }
    },
    [setNodes, setEdges],
  )

  useEffect(() => {
    buildGraph(true)
  }, [buildGraph])

  useEffect(() => {
    const interval = setInterval(() => buildGraph(false), 30_000)
    return () => clearInterval(interval)
  }, [buildGraph])

  useWsEvent(['device_online', 'device_offline', 'new_device'], () => buildGraph(false))

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: TopologyNode) => {
      if (node.type === 'subnetGroup') return
      const pos =
        node.type === 'routerNode'
          ? {
              x: node.position.x + ROUTER_WIDTH / 2,
              y: node.position.y + ROUTER_HEIGHT / 2,
            }
          : {
              x: node.position.x + DEVICE_WIDTH / 2,
              y: node.position.y + DEVICE_HEIGHT / 2,
            }
      pinnedRef.current.set(node.id, pos)
      saveTopologyPositions([
        { node_id: node.id, x: pos.x, y: pos.y, pinned: true },
      ]).catch(() => {})
    },
    [],
  )

  const autoLayout = useCallback(() => {
    const inputs = lastLayoutInputsRef.current
    if (!inputs) return
    pinnedRef.current.clear()
    const positionMap = computeForceLayout(inputs.layoutNodes, inputs.layoutLinks)
    setNodes((prev) => {
      const subnetDevicePositions = new Map<string, { x: number; y: number }[]>()
      const newNodes: TopologyNode[] = []

      prev.forEach((node) => {
        if (node.type === 'subnetGroup') return
        const pos = positionMap.get(node.id)
        if (pos) {
          const updated = {
            ...node,
            position:
              node.type === 'routerNode'
                ? { x: pos.x - ROUTER_WIDTH / 2, y: pos.y - ROUTER_HEIGHT / 2 }
                : { x: pos.x - DEVICE_WIDTH / 2, y: pos.y - DEVICE_HEIGHT / 2 },
          }
          newNodes.push(updated)

          if (node.type === 'deviceNode') {
            const subnet = (node.data as DeviceNodeData).subnet
            const existing = subnetDevicePositions.get(subnet) || []
            existing.push(pos)
            subnetDevicePositions.set(subnet, existing)
          }
        } else {
          newNodes.push(node)
        }
      })

      const subnetGroups: TopologyNode[] = []
      subnetDevicePositions.forEach((devicePositions, subnet) => {
        if (subnet === 'unknown' || devicePositions.length === 0) return
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        devicePositions.forEach((pos) => {
          minX = Math.min(minX, pos.x)
          minY = Math.min(minY, pos.y)
          maxX = Math.max(maxX, pos.x)
          maxY = Math.max(maxY, pos.y)
        })
        if (!isFinite(minX)) return
        const padding = 60
        const width = maxX - minX + DEVICE_WIDTH + padding * 2
        const height = maxY - minY + DEVICE_HEIGHT + padding * 2
        const existing = prev.find((n) => n.id === `subnet-${subnet}`)
        const existingData =
          existing?.type === 'subnetGroup' ? (existing.data as SubnetGroupData) : null
        subnetGroups.push({
          id: `subnet-${subnet}`,
          type: 'subnetGroup',
          position: {
            x: minX - DEVICE_WIDTH / 2 - padding,
            y: minY - DEVICE_HEIGHT / 2 - padding - 10,
          },
          data: {
            label: subnet,
            subnet,
            deviceCount: existingData?.deviceCount ?? devicePositions.length,
            onlineCount: existingData?.onlineCount ?? 0,
            width: Math.max(width, 200),
            height: Math.max(height, 120),
          },
          draggable: false,
          selectable: false,
          zIndex: 0,
        })
      })

      return [...subnetGroups, ...newNodes]
    })
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  }, [setNodes, fitView])

  const resetLayout = useCallback(async () => {
    Object.keys(SUBNET_COLORS).forEach((k) => delete SUBNET_COLORS[k])
    colorIndex = 0
    pinnedRef.current.clear()
    await deleteTopologyPositions().catch(() => {})
    setLoading(true)
    buildGraph(true)
  }, [buildGraph])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 300 })
  }, [fitView])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: TopologyNode) => {
    if (node.type === 'deviceNode') {
      const data = node.data as DeviceNodeData
      setSelectedDevice(data.device)
    }
  }, [])

  const stats = useMemo(() => {
    const deviceNodes = nodes.filter((n) => n.type === 'deviceNode')
    const online = deviceNodes.filter(
      (n) => (n.data as DeviceNodeData).device.is_online,
    ).length
    const subnets = new Set(deviceNodes.map((n) => (n.data as DeviceNodeData).subnet))
    const subnetEntries = Array.from(subnets).filter((s) => s !== 'unknown')
    return {
      total: deviceNodes.length,
      online,
      subnets: subnets.size,
      subnetList: subnetEntries,
    }
  }, [nodes])

  const headerSubLine = (
    <>
      <span className="tabular-nums text-mesh-text-dim">{stats.subnets}</span>{' '}
      subnet{stats.subnets !== 1 ? 's' : ''}
      <span className="px-1.5 text-mesh-text-faint">·</span>
      <span className="tabular-nums text-mesh-text-dim">{stats.total}</span> nodes
      <span className="px-1.5 text-mesh-text-faint">·</span>
      <span style={{ color: MESH.online }} className="tabular-nums">
        {stats.online}
      </span>{' '}
      online
      <span className="px-1.5 text-mesh-text-faint">·</span>
      <span>auto-layout · force-directed</span>
      {routerInfoRef.current ? (
        <>
          <span className="px-1.5 text-mesh-text-faint">·</span>
          <span>{routerInfoRef.current.router_type}</span>
        </>
      ) : null}
    </>
  )

  const headerActions = (
    <>
      <button
        type="button"
        onClick={resetLayout}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
        data-testid="topology-reset-layout"
        title="Reset layout"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset layout
      </button>
      <button
        type="button"
        onClick={handleFitView}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
        data-testid="topology-fit-view"
        title="Fit view"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Fit view
      </button>
      <button
        type="button"
        onClick={autoLayout}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
        data-testid="topology-auto-layout"
        title="Auto-layout"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Auto layout
      </button>
      <button
        type="button"
        onClick={() => buildGraph(false)}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-mesh-border bg-mesh-surface-1 px-2.5 text-[12px] text-mesh-text-dim transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text"
        data-testid="topology-refresh"
        title="Refresh now"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </button>
      <span
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-dashed border-mesh-border bg-transparent px-2.5 text-[12px] text-mesh-text-mute"
        title="Filter (coming soon)"
      >
        <FilterIcon className="h-3.5 w-3.5" />
        Filters
      </span>
    </>
  )

  const legend = (
    <div
      className="flex flex-wrap items-center gap-3 rounded-sm border border-mesh-border bg-mesh-surface-1 px-3 py-2 font-mono text-[10.5px] text-mesh-text-dim"
      data-testid="topology-legend"
    >
      <span className="uppercase tracking-[0.10em] text-mesh-text-mute">Subnets</span>
      {stats.subnetList.length === 0 ? (
        <span className="text-mesh-text-faint">no subnet groupings yet</span>
      ) : (
        stats.subnetList.slice(0, 6).map((subnet) => {
          const c = getSubnetColor(subnet)
          return (
            <span key={subnet} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.text }} />
              <span style={{ color: c.text }}>{subnet}</span>
            </span>
          )
        })
      )}
      <span className="text-mesh-text-faint">·</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: MESH.accent }} />
        active link
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: MESH.surface3 }}
        />
        offline link
      </span>
      {lastRefresh ? (
        <span className="ml-auto text-mesh-text-faint">
          refreshed {lastRefresh.toLocaleTimeString()}
        </span>
      ) : null}
    </div>
  )

  const header = (
    <div className="flex flex-col gap-3 border-b border-mesh-border px-6 pb-4 pt-6 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mesh-text-mute">
          Network
        </div>
        <h1 className="mt-1 mb-1.5 text-[28px] font-semibold leading-tight tracking-tight text-mesh-text">
          Topology
        </h1>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[11.5px] text-mesh-text-mute">
          {headerSubLine}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{headerActions}</div>
    </div>
  )

  if (loading) {
    return (
      <PageTransition>
        <div
          data-testid="topology-root"
          className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-mesh-bg"
        >
          {header}
          <div className="flex flex-1 items-center justify-center p-6">
            <LoadingState
              title="Building topology"
              message="Computing force layout…"
              tiles={3}
              rows={4}
            />
          </div>
        </div>
      </PageTransition>
    )
  }

  if (error) {
    return (
      <PageTransition>
        <div
          data-testid="topology-root"
          className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-mesh-bg"
        >
          {header}
          <div className="flex flex-1 items-center justify-center p-6">
            <MeshErrorState
              title="Couldn't load topology"
              message={error}
              onRetry={() => {
                setLoading(true)
                buildGraph(true)
              }}
            />
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div
        data-testid="topology-root"
        className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-mesh-bg"
      >
        {header}

        <div
          className="flex flex-row items-stretch gap-3 px-6 pt-3"
          data-testid="topology-toolbar"
        >
          {legend}
        </div>

        <div className="relative mx-6 mt-3 mb-6 flex-1 overflow-hidden rounded-md border border-mesh-border bg-mesh-surface-1 shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
          <div className="absolute inset-0" data-testid="topology-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: MESH.surface1 }}
            >
              <Controls
                showInteractive={false}
                style={{
                  border: `1px solid ${MESH.border}`,
                  background: MESH.surface2,
                  borderRadius: 4,
                }}
              />
              <MiniMap
                nodeColor={(n) => {
                  if (n.type === 'routerNode') return MESH.primary
                  if (n.type === 'subnetGroup') return 'transparent'
                  const data = n.data as DeviceNodeData
                  return data.device?.is_online ? MESH.online : MESH.surface3
                }}
                style={{
                  border: `1px solid ${MESH.border}`,
                  background: 'rgba(9,22,51,0.90)',
                }}
                maskColor="rgba(6,15,37,0.70)"
              />
              <Background
                variant={BackgroundVariant.Dots}
                color={MESH.surface3}
                gap={24}
                size={1}
              />

              {stats.total === 0 && (
                <div
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4"
                  data-testid="topology-empty"
                >
                  <div className="pointer-events-auto">
                    <MeshEmptyState
                      icon={Network}
                      title="No topology devices"
                      message="Discovered devices will appear here after a network scan returns inventory data."
                      action={
                        <Link
                          href="/devices"
                          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-mesh-primary px-3 text-[12px] text-white transition-colors hover:bg-mesh-primary-hover"
                        >
                          Open devices
                        </Link>
                      }
                    />
                  </div>
                </div>
              )}
            </ReactFlow>
          </div>
        </div>
      </div>

      <DetailsDrawer
        open={selectedDevice !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null)
        }}
        data-testid="topology-node-drawer"
        width={560}
      >
        {selectedDevice && (
          <DeviceDetailPanel
            device={selectedDevice}
            onClose={() => setSelectedDevice(null)}
          />
        )}
      </DetailsDrawer>
    </PageTransition>
  )
}
