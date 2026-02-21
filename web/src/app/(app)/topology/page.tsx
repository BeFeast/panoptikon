'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import dagre from '@dagrejs/dagre'
import { Network, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import {
  fetchDevices,
  fetchTopDevices,
  fetchRouterInterfaces,
  fetchTopologyPositions,
  saveTopologyPositions,
  deleteTopologyPositions,
  type NodePosition,
} from '@/lib/api'
import type { Device, TopDevice, VyosInterface } from '@/lib/types'
import { getDeviceIcon } from '@/lib/device-icons'
import { PageTransition } from '@/components/PageTransition'

// ─── Types ──────────────────────────────────────────────

type RouterNodeData = {
  label: string
  wanIp: string | null
  isOnline: boolean
}

type DeviceNodeData = {
  device: Device
  trafficBps: number
}

type RouterNodeType = Node<RouterNodeData, 'routerNode'>
type DeviceNodeType = Node<DeviceNodeData, 'deviceNode'>
type TopologyNode = RouterNodeType | DeviceNodeType

// ─── Dagre Layout ───────────────────────────────────────

const ROUTER_WIDTH = 200
const ROUTER_HEIGHT = 80
const DEVICE_WIDTH = 180
const DEVICE_HEIGHT = 68

function getLayoutedElements(
  nodes: TopologyNode[],
  edges: Edge[],
  pinnedPositions?: Map<string, { x: number; y: number }>,
): { nodes: TopologyNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 })

  nodes.forEach((n) => {
    if (pinnedPositions?.has(n.id)) return
    const isRouter = n.type === 'routerNode'
    g.setNode(n.id, {
      width: isRouter ? ROUTER_WIDTH : DEVICE_WIDTH,
      height: isRouter ? ROUTER_HEIGHT : DEVICE_HEIGHT,
    })
  })
  edges.forEach((e) => {
    if (pinnedPositions?.has(e.source) || pinnedPositions?.has(e.target)) return
    g.setEdge(e.source, e.target)
  })
  dagre.layout(g)

  return {
    nodes: nodes.map((n) => {
      // Use saved position if this node was pinned
      const pinned = pinnedPositions?.get(n.id)
      if (pinned) {
        return { ...n, position: { x: pinned.x, y: pinned.y } }
      }
      const pos = g.node(n.id)
      const isRouter = n.type === 'routerNode'
      const w = isRouter ? ROUTER_WIDTH : DEVICE_WIDTH
      const h = isRouter ? ROUTER_HEIGHT : DEVICE_HEIGHT
      return {
        ...n,
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      }
    }),
    edges,
  }
}

// ─── Custom Nodes ───────────────────────────────────────

function RouterNode({ data }: NodeProps<RouterNodeType>) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 shadow-lg shadow-blue-500/10"
      style={{ width: ROUTER_WIDTH, height: ROUTER_HEIGHT }}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
        <Network className="h-5 w-5 text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">VyOS Router</p>
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
    device.vendor,
    device.hostname,
    device.mdns_services,
  )
  const displayName = device.name || device.hostname || device.mac
  const primaryIp = device.ips?.[0] || '—'

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border border-slate-700/60 bg-slate-800/90 px-3 py-2.5 shadow-md transition-shadow hover:shadow-lg hover:shadow-slate-700/20"
      style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-700/60">
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{displayName}</p>
        <p className="truncate text-[10px] text-slate-400">{primaryIp}</p>
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

const nodeTypes: NodeTypes = {
  routerNode: RouterNode,
  deviceNode: DeviceNode,
}

// ─── Edge style helpers ─────────────────────────────────

function getEdgeStrokeWidth(bps: number): number {
  if (bps > 10_000_000) return 4
  if (bps > 1_000_000) return 3
  if (bps > 100_000) return 2
  return 1
}

// ─── Main Page ──────────────────────────────────────────

export default function TopologyPage() {
  const router = useRouter()
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Track pinned positions locally so refreshes preserve them
  const pinnedRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const buildGraph = useCallback(
    async (isInitial: boolean) => {
      try {
        const fetches: [Promise<Device[]>, Promise<TopDevice[]>, Promise<VyosInterface[]>, Promise<NodePosition[]>?] = [
          fetchDevices(),
          fetchTopDevices(100),
          fetchRouterInterfaces().catch(() => [] as VyosInterface[]),
        ]

        // Fetch saved positions on initial load
        if (isInitial) {
          fetches.push(fetchTopologyPositions().catch(() => [] as NodePosition[]))
        }

        const [devices, topDevices, interfaces, savedPositions] = await Promise.all(fetches)

        // Populate pinned map from server on initial load
        if (isInitial && savedPositions) {
          pinnedRef.current = new Map(
            savedPositions.filter((p) => p.pinned).map((p) => [p.node_id, { x: p.x, y: p.y }]),
          )
        }

        // Find WAN IP from router interfaces
        const wanIf = interfaces.find(
          (i) =>
            i.name === 'eth0' ||
            i.description?.toLowerCase().includes('wan') ||
            i.name?.startsWith('pppoe'),
        )
        const wanIp = wanIf?.ip_address ?? null

        // Build traffic map from top devices
        const trafficMap = new Map<string, number>()
        topDevices.forEach((td: TopDevice) => {
          trafficMap.set(td.id, (td.rx_bps || 0) + (td.tx_bps || 0))
        })

        // Build nodes
        const routerNode: TopologyNode = {
          id: 'router',
          type: 'routerNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'VyOS Router',
            wanIp,
            isOnline: true,
          },
          draggable: true,
        }

        const deviceNodes: TopologyNode[] = devices.map((device) => ({
          id: device.id,
          type: 'deviceNode' as const,
          position: { x: 0, y: 0 },
          data: {
            device,
            trafficBps: trafficMap.get(device.id) || 0,
          },
          draggable: true,
        }))

        const allNodes: TopologyNode[] = [routerNode, ...deviceNodes]

        // Build edges
        const allEdges: Edge[] = devices.map((device) => {
          const totalBps = trafficMap.get(device.id) || 0
          return {
            id: `router-${device.id}`,
            source: 'router',
            target: device.id,
            type: 'default',
            animated: totalBps > 100_000,
            style: {
              stroke: device.is_online ? '#3b82f6' : '#334155',
              strokeWidth: getEdgeStrokeWidth(totalBps),
              opacity: device.is_online ? 0.7 : 0.25,
            },
          }
        })

        // Apply dagre layout only on initial load; pinned nodes keep saved positions
        if (isInitial) {
          const layouted = getLayoutedElements(allNodes, allEdges, pinnedRef.current)
          setNodes(layouted.nodes)
          setEdges(layouted.edges)
        } else {
          // On refresh, update data without changing positions
          setNodes((prev) => {
            const posMap = new Map(prev.map((n) => [n.id, n.position]))
            return allNodes.map((n) => ({
              ...n,
              position: posMap.get(n.id) ?? n.position,
            }))
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

  // Initial load
  useEffect(() => {
    buildGraph(true)
  }, [buildGraph])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => buildGraph(false), 30_000)
    return () => clearInterval(interval)
  }, [buildGraph])

  // Persist position when a node is dragged
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: TopologyNode) => {
      const pos = { x: node.position.x, y: node.position.y }
      pinnedRef.current.set(node.id, pos)
      saveTopologyPositions([
        { node_id: node.id, x: pos.x, y: pos.y, pinned: true },
      ]).catch(() => {})
    },
    [],
  )

  // Reset layout — clear all saved positions and re-run dagre
  const resetLayout = useCallback(async () => {
    pinnedRef.current.clear()
    await deleteTopologyPositions().catch(() => {})
    setLoading(true)
    buildGraph(true)
  }, [buildGraph])

  // Click handler — navigate to devices page with device selected
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: TopologyNode) => {
      if (node.type === 'deviceNode') {
        const device = (node.data as DeviceNodeData).device
        router.push(`/devices?selected=${device.id}`)
      }
    },
    [router],
  )

  if (loading) {
    return (
      <PageTransition>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Loading topology…</p>
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
          minZoom={0.3}
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
              const data = n.data as DeviceNodeData
              return data.device?.is_online ? '#34d399' : '#475569'
            }}
            className="!border-slate-700 !bg-slate-900/90"
            maskColor="rgba(15, 23, 42, 0.7)"
          />
          <Background variant={BackgroundVariant.Dots} color="#334155" gap={24} size={1} />

          {/* Floating toolbar */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 backdrop-blur-sm">
            <button
              onClick={resetLayout}
              className="text-slate-400 transition-colors hover:text-white"
              title="Reset layout"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <div className="h-3 w-px bg-slate-700" />
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
    </PageTransition>
  )
}
