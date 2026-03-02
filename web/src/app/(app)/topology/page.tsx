'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
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
  Loader2,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import {
  fetchTopologyGraph,
  saveTopologyPositions,
  deleteTopologyPositions,
} from '@/lib/api'
import type { TopologyDevice, TopologyRouter } from '@/lib/types'
import { getDeviceIcon } from '@/lib/device-icons'
import { PageTransition } from '@/components/PageTransition'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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

// ─── Helpers ────────────────────────────────────────────

/** Extract /24 subnet from an IP address (e.g. "192.168.1.42" → "192.168.1.0/24") */
function getSubnet(ip: string): string {
  const parts = ip.split('.')
  if (parts.length !== 4) return 'unknown'
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/** Map of subnet → color for visual grouping */
const SUBNET_COLORS: Record<string, { bg: string; border: string; text: string }> = {}
const COLOR_PALETTE = [
  { bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  { bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
  { bg: 'rgba(168, 85, 247, 0.06)', border: 'rgba(168, 85, 247, 0.2)', text: '#c084fc' },
  { bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
  { bg: 'rgba(236, 72, 153, 0.06)', border: 'rgba(236, 72, 153, 0.2)', text: '#f472b6' },
  { bg: 'rgba(20, 184, 166, 0.06)', border: 'rgba(20, 184, 166, 0.2)', text: '#2dd4bf' },
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
  nodeIds: { id: string; isRouter?: boolean; subnet?: string }[],
  links: { source: string; target: string }[],
  pinnedPositions?: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // Collect unique subnets (excluding router) for subnet clustering
  const subnets = new Map<string, string[]>()
  nodeIds.forEach((n) => {
    if (!n.isRouter && n.subnet) {
      const existing = subnets.get(n.subnet) || []
      existing.push(n.id)
      subnets.set(n.subnet, existing)
    }
  })

  // Create angle-based subnet centers for forceX/forceY targeting
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

  const clusterRadius = 250
  const simulation = forceSimulation<ForceNode>(forceNodes)
    .force(
      'link',
      forceLink<ForceNode, ForceLink>(forceLinks)
        .id((d) => d.id)
        .distance(150)
        .strength(0.3),
    )
    .force('charge', forceManyBody<ForceNode>().strength(-300))
    .force('center', forceCenter(0, 0).strength(0.05))
    .force('collide', forceCollide<ForceNode>(60))
    // Pull devices toward their subnet cluster center
    .force(
      'x',
      forceX<ForceNode>((d) => {
        if (d.isRouter) return 0
        const angle = subnetAngle.get(d.subnet ?? '') ?? 0
        return Math.cos(angle) * clusterRadius
      }).strength(0.15),
    )
    .force(
      'y',
      forceY<ForceNode>((d) => {
        if (d.isRouter) return 0
        const angle = subnetAngle.get(d.subnet ?? '') ?? 0
        return Math.sin(angle) * clusterRadius
      }).strength(0.15),
    )
    .stop()

  // Run simulation synchronously
  const iterations = 300
  for (let i = 0; i < iterations; i++) {
    simulation.tick()
  }

  forceNodes.forEach((n) => {
    positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
  })

  return positions
}

// ─── Custom Nodes ───────────────────────────────────────

function RouterNode({ data }: NodeProps<RouterNodeType>) {
  const routerLabel =
    data.routerType === 'mikrotik'
      ? 'MikroTik'
      : 'Router'

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 shadow-lg shadow-blue-500/10"
      style={{ width: ROUTER_WIDTH, height: ROUTER_HEIGHT }}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-blue-500" />
      <Handle type="source" position={Position.Top} id="top" className="!bg-blue-500" />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
        <Network className="h-5 w-5 text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{routerLabel}</p>
        {data.wanIp && (
          <p className="truncate text-xs text-slate-400">{data.wanIp}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              data.isOnline
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'
            }`}
          />
          <span className="text-[10px] text-slate-500">
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
      className="flex items-center gap-2.5 rounded-lg border bg-slate-800/90 px-3 py-2.5 shadow-md transition-shadow hover:shadow-lg hover:shadow-slate-700/20"
      style={{
        width: DEVICE_WIDTH,
        height: DEVICE_HEIGHT,
        borderColor: subnetColor.border,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-slate-500" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-slate-500" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-slate-500" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-700/60">
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{displayName}</p>
        <div className="flex items-center gap-1">
          <p className="truncate text-[10px] text-slate-400">{primaryIp}</p>
          {hasDhcp && (
            <span className="inline-block h-1 w-1 rounded-full bg-blue-400" title="DHCP lease" />
          )}
        </div>
      </div>
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
          device.is_online
            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
            : 'bg-rose-400/60'
        }`}
      />
    </div>
  )
}

function SubnetGroupNode({ data }: NodeProps<SubnetGroupType>) {
  const color = getSubnetColor(data.subnet)
  return (
    <div
      className="rounded-2xl"
      style={{
        width: data.width,
        height: data.height,
        backgroundColor: color.bg,
        border: `1px dashed ${color.border}`,
      }}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-xs font-medium" style={{ color: color.text }}>
          {data.label}
        </span>
        <span className="text-[10px] text-slate-500">
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

function DeviceDetailPanel({ device }: { device: TopologyDevice }) {
  const [copied, setCopied] = useState<string | null>(null)
  const ips = device.ips ?? []
  const primaryIp = ips[0] ?? '—'
  const displayName =
    device.custom_name ?? device.name ?? device.hostname ?? 'Unknown Device'
  const effectiveType = device.custom_type ?? device.device_type
  const { icon: DetailIcon, label: deviceTypeLabel } = getDeviceIcon(
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

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 ${
              device.is_online ? 'ring-1 ring-emerald-500/20' : ''
            }`}
          >
            <DetailIcon
              className={`h-5 w-5 ${
                device.is_online ? 'text-emerald-400' : 'text-slate-500'
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-white">{displayName}</SheetTitle>
            </div>
            <div className="flex items-center gap-2">
              {vendorDisplay && (
                <span className="text-xs text-slate-400">{vendorDisplay}</span>
              )}
              <span className="text-xs text-slate-500">{deviceTypeLabel}</span>
            </div>
          </div>
        </div>
        <SheetDescription>
          {device.is_online ? (
            <span className="text-emerald-400">Online</span>
          ) : (
            <span className="text-slate-500">
              Offline — last seen {timeAgo(device.last_seen_at)}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-3">
        <Link href={`/devices?selected=${device.id}`}>
          <button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 hover:text-white">
            <ExternalLink className="h-4 w-4" />
            Full Device Details
          </button>
        </Link>
      </div>

      <Separator className="my-4 bg-slate-800" />

      <div className="space-y-3">
        <InfoRow
          label="IP Address"
          value={primaryIp}
          mono
          onCopy={() => handleCopy(primaryIp, 'ip')}
          copied={copied === 'ip'}
        />
        {ips.length > 1 && (
          <div className="pl-0">
            {ips.slice(1).map((ip) => (
              <span
                key={ip}
                className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400"
              >
                {ip}
              </span>
            ))}
          </div>
        )}
        <InfoRow
          label="MAC Address"
          value={device.mac}
          mono
          onCopy={() => handleCopy(device.mac, 'mac')}
          copied={copied === 'mac'}
        />
        {device.hostname && (
          <InfoRow label="Hostname" value={device.hostname} />
        )}
        {device.vendor && <InfoRow label="Vendor" value={device.vendor} />}
        <InfoRow label="First Seen" value={timeAgo(device.first_seen_at)} />
        <InfoRow label="Last Seen" value={timeAgo(device.last_seen_at)} />

        {(device.os_family || effectiveType || device.device_model) && (
          <>
            <Separator className="bg-slate-800" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Device Identity
            </p>
            {device.os_family && (
              <InfoRow
                label="OS"
                value={
                  device.os_version
                    ? `${device.os_family} ${device.os_version}`
                    : device.os_family
                }
              />
            )}
            {effectiveType && (
              <InfoRow label="Type" value={effectiveType} />
            )}
            {device.device_brand && (
              <InfoRow label="Brand" value={device.device_brand} />
            )}
            {device.device_model && (
              <InfoRow label="Model" value={device.device_model} />
            )}
          </>
        )}

        {(device.dhcp_lease_status || device.bridge_port) && (
          <>
            <Separator className="bg-slate-800" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Network
            </p>
            {device.dhcp_lease_status && (
              <InfoRow label="DHCP Status" value={device.dhcp_lease_status} />
            )}
            {device.dhcp_hostname && (
              <InfoRow label="DHCP Hostname" value={device.dhcp_hostname} />
            )}
            {device.dhcp_server && (
              <InfoRow label="DHCP Server" value={device.dhcp_server} />
            )}
            {device.dhcp_expires && (
              <InfoRow label="Lease Expires" value={device.dhcp_expires} />
            )}
            {device.bridge_port && (
              <InfoRow label="Bridge Port" value={device.bridge_port} />
            )}
            {device.bridge_name && (
              <InfoRow label="Bridge" value={device.bridge_name} />
            )}
          </>
        )}

        {device.mdns_services && (
          <>
            <Separator className="bg-slate-800" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              mDNS Services
            </p>
            <div className="flex flex-wrap gap-1.5">
              {device.mdns_services.split(',').map((svc) => (
                <Badge
                  key={svc.trim()}
                  variant="outline"
                  className="border-slate-700 text-slate-400 text-[10px]"
                >
                  {svc.trim()}
                </Badge>
              ))}
            </div>
          </>
        )}

        {(device.location || device.owner || device.tags) && (
          <>
            <Separator className="bg-slate-800" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Asset Info
            </p>
            {device.location && (
              <InfoRow label="Location" value={device.location} />
            )}
            {device.owner && <InfoRow label="Owner" value={device.owner} />}
            {device.tags && (
              <div className="flex flex-wrap gap-1.5">
                {device.tags.split(',').map((tag) => (
                  <Badge
                    key={tag.trim()}
                    variant="outline"
                    className="border-slate-700 text-slate-400 text-[10px]"
                  >
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function InfoRow({
  label,
  value,
  mono,
  onCopy,
  copied,
}: {
  label: string
  value: string
  mono?: boolean
  onCopy?: () => void
  copied?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`flex items-center gap-1 text-sm text-slate-300 ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
      >
        {value}
        {onCopy && (
          <button
            onClick={onCopy}
            className="ml-1 text-slate-600 transition-colors hover:text-slate-400"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
      </span>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export default function TopologyPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<TopologyDevice | null>(null)

  // Track pinned positions locally so refreshes preserve them
  const pinnedRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  // Store the latest router info for display
  const routerInfoRef = useRef<TopologyRouter | null>(null)

  const buildGraph = useCallback(
    async (isInitial: boolean) => {
      try {
        const graph = await fetchTopologyGraph()
        const { devices, router, positions } = graph

        // Store router info
        routerInfoRef.current = router

        // Populate pinned map from server on initial load
        if (isInitial) {
          pinnedRef.current = new Map(
            positions
              .filter((p) => p.pinned)
              .map((p) => [p.node_id, { x: p.x, y: p.y }]),
          )
        }

        // Derive subnet for each device
        const deviceSubnets = new Map<string, string>()
        devices.forEach((d) => {
          const ip = d.ips?.[0]
          deviceSubnets.set(d.id, ip ? getSubnet(ip) : 'unknown')
        })

        // Collect subnet groups
        const subnetDevices = new Map<string, TopologyDevice[]>()
        devices.forEach((d) => {
          const subnet = deviceSubnets.get(d.id) || 'unknown'
          const existing = subnetDevices.get(subnet) || []
          existing.push(d)
          subnetDevices.set(subnet, existing)
        })

        // Build force layout node descriptors
        const layoutNodes = [
          { id: 'router', isRouter: true, subnet: undefined },
          ...devices.map((d) => ({
            id: d.id,
            isRouter: false,
            subnet: deviceSubnets.get(d.id),
          })),
        ]

        const layoutLinks = devices.map((d) => ({
          source: 'router',
          target: d.id,
        }))

        // Compute positions using d3-force (on initial load)
        // On refresh, reuse existing positions
        let positionMap: Map<string, { x: number; y: number }>

        if (isInitial) {
          positionMap = computeForceLayout(
            layoutNodes,
            layoutLinks,
            pinnedRef.current,
          )
        } else {
          // Build position map from current node positions
          positionMap = new Map()
        }

        // Build device nodes
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

        // Build router node
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

        // Build subnet group background nodes
        const subnetGroupNodes: TopologyNode[] = []
        if (isInitial) {
          subnetDevices.forEach((devs, subnet) => {
            if (subnet === 'unknown' || devs.length === 0) return

            // Calculate bounding box from device positions
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

        // Build edges
        const allEdges: Edge[] = devices.map((device) => {
          const totalBps = (device.rx_bps || 0) + (device.tx_bps || 0)
          return {
            id: `router-${device.id}`,
            source: 'router',
            target: device.id,
            type: 'default',
            animated: totalBps > 100_000,
            style: {
              stroke: device.is_online ? '#3b82f6' : '#334155',
              strokeWidth: getEdgeStrokeWidth(totalBps),
              opacity: device.is_online ? 0.5 : 0.15,
            },
            zIndex: 5,
          }
        })

        if (isInitial) {
          setNodes([...subnetGroupNodes, routerNode, ...deviceNodes])
          setEdges(allEdges)
        } else {
          // On refresh, update data without changing positions
          setNodes((prev) => {
            const posMap = new Map(prev.map((n) => [n.id, n.position]))
            const updated: TopologyNode[] = []

            // Keep existing subnet groups with updated counts
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

            // Update router
            updated.push({
              ...routerNode,
              position: posMap.get('router') ?? routerNode.position,
            })

            // Update device nodes
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
        setError(
          err instanceof Error ? err.message : 'Failed to load topology',
        )
      } finally {
        setLoading(false)
      }
    },
    [setNodes, setEdges],
  )

  // Initial load
  useEffect(() => {
    buildGraph(true)
  }, [buildGraph])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => buildGraph(false), 30_000)
    return () => clearInterval(interval)
  }, [buildGraph])

  // Real-time updates via WebSocket
  useWsEvent(['device_online', 'device_offline', 'new_device'], () =>
    buildGraph(false),
  )

  // Persist position when a node is dragged
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: TopologyNode) => {
      if (node.type === 'subnetGroup') return
      const pos = { x: node.position.x, y: node.position.y }
      pinnedRef.current.set(node.id, pos)
      saveTopologyPositions([
        { node_id: node.id, x: pos.x, y: pos.y, pinned: true },
      ]).catch(() => {})
    },
    [],
  )

  // Reset layout — clear all saved positions and re-run force simulation
  const resetLayout = useCallback(async () => {
    // Reset subnet color assignments
    Object.keys(SUBNET_COLORS).forEach((k) => delete SUBNET_COLORS[k])
    colorIndex = 0
    pinnedRef.current.clear()
    await deleteTopologyPositions().catch(() => {})
    setLoading(true)
    buildGraph(true)
  }, [buildGraph])

  // Click handler — show device detail panel
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: TopologyNode) => {
      if (node.type === 'deviceNode') {
        const data = node.data as DeviceNodeData
        setSelectedDevice(data.device)
      }
    },
    [],
  )

  // Count stats for header
  const stats = useMemo(() => {
    const deviceNodes = nodes.filter((n) => n.type === 'deviceNode')
    const online = deviceNodes.filter(
      (n) => (n.data as DeviceNodeData).device.is_online,
    ).length
    const subnets = new Set(
      deviceNodes.map((n) => (n.data as DeviceNodeData).subnet),
    )
    return {
      total: deviceNodes.length,
      online,
      subnets: subnets.size,
    }
  }, [nodes])

  if (loading) {
    return (
      <PageTransition>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Building topology…</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (error) {
    return (
      <PageTransition>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              onClick={() => {
                setLoading(true)
                buildGraph(true)
              }}
              className="mt-3 text-xs text-blue-400 hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="-m-6 h-[calc(100vh-56px)]">
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
          className="bg-slate-950"
        >
          <Controls
            className="!border-slate-700 !bg-slate-900 [&>button]:!border-slate-700 [&>button]:!bg-slate-900 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-800"
            showInteractive={false}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'routerNode') return '#3b82f6'
              if (n.type === 'subnetGroup') return 'transparent'
              const data = n.data as DeviceNodeData
              return data.device?.is_online ? '#34d399' : '#475569'
            }}
            className="!border-slate-700 !bg-slate-900/90"
            maskColor="rgba(15, 23, 42, 0.7)"
          />
          <Background
            variant={BackgroundVariant.Dots}
            color="#334155"
            gap={24}
            size={1}
          />

          {/* Floating toolbar */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-900/80 px-4 py-2 backdrop-blur-sm">
            <span className="text-[11px] text-slate-400">
              {stats.total} devices · {stats.online} online · {stats.subnets}{' '}
              subnet{stats.subnets !== 1 ? 's' : ''}
            </span>
            <div className="h-3 w-px bg-slate-700" />
            <button
              onClick={resetLayout}
              className="text-slate-400 transition-colors hover:text-white"
              title="Reset layout"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => buildGraph(false)}
              className="text-slate-400 transition-colors hover:text-white"
              title="Refresh now"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {lastRefresh && (
              <span className="text-[10px] text-slate-500">
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </ReactFlow>
      </div>

      {/* Device detail slide-in panel */}
      <Sheet
        open={selectedDevice !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-slate-800 bg-slate-950 sm:max-w-md"
        >
          {selectedDevice && <DeviceDetailPanel device={selectedDevice} />}
        </SheetContent>
      </Sheet>
    </PageTransition>
  )
}
