'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  Cable,
  MonitorSmartphone,
  Crown,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import { fetchMeshTopology } from '@/lib/api'
import type { MeshNode, MeshTopologyResponse } from '@/lib/types'
import { PageTransition } from '@/components/PageTransition'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ─── Types ──────────────────────────────────────────────

type MeshNodeData = {
  node: MeshNode
}

type MeshNodeType = Node<MeshNodeData, 'meshNode'>

// ─── Layout ─────────────────────────────────────────────

const NODE_WIDTH = 240
const NODE_HEIGHT = 120

/** Derive a stable unique key for a mesh node. */
function nodeKey(node: MeshNode, index: number): string {
  return node.mac || node.ip || `node-${index}`
}

/** Simple radial layout: main node center, satellites in a circle around it. */
function computeLayout(nodes: MeshNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const mainIdx = nodes.findIndex((n) => n.is_main)
  const main = mainIdx >= 0 ? nodes[mainIdx] : undefined
  const satellites = nodes
    .map((n, i) => ({ node: n, originalIndex: i }))
    .filter((entry) => !entry.node.is_main)

  // Center the main node
  if (main) {
    positions.set(nodeKey(main, mainIdx), { x: 0, y: 0 })
  }

  // Place satellites in a circle
  const radius = 300
  satellites.forEach(({ node: sat, originalIndex }, i) => {
    const angle = (2 * Math.PI * i) / Math.max(satellites.length, 1) - Math.PI / 2
    positions.set(nodeKey(sat, originalIndex), {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  })

  return positions
}

// ─── Custom Node ────────────────────────────────────────

function MeshNodeComponent({ data }: NodeProps<MeshNodeType>) {
  const { node } = data
  const isMain = node.is_main

  const backhaulIcon = node.backhaul_type === 'wired' || node.backhaul_type === 'main'
    ? Cable
    : Wifi

  const BackhaulIcon = backhaulIcon

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-lg transition-shadow hover:shadow-xl ${
        isMain
          ? 'border-amber-500/30 bg-gradient-to-br from-slate-800 to-slate-900 shadow-amber-500/10'
          : node.is_online
            ? 'border-blue-500/30 bg-gradient-to-br from-slate-800 to-slate-900 shadow-blue-500/10'
            : 'border-slate-600/30 bg-slate-900 shadow-slate-700/10'
      }`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-blue-500" />

      {/* Header row */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isMain ? 'bg-amber-500/20' : 'bg-blue-500/20'
          }`}
        >
          {isMain ? (
            <Crown className={`h-5 w-5 ${isMain ? 'text-amber-400' : 'text-blue-400'}`} />
          ) : (
            <Wifi className="h-5 w-5 text-blue-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {node.name || 'Mesh Node'}
          </p>
          <p className="truncate font-mono text-xs text-slate-400">{node.ip || '—'}</p>
        </div>
        <span
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
            node.is_online
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
              : 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]'
          }`}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <MonitorSmartphone className="h-3 w-3" />
          {node.online_devices} device{node.online_devices !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <BackhaulIcon className="h-3 w-3" />
          {isMain ? 'Main' : node.backhaul_type}
        </span>
      </div>

      {/* Model badge */}
      <div className="flex items-center gap-1.5">
        <Badge
          variant="outline"
          className="border-slate-700 text-[10px] text-slate-500"
        >
          {node.model || node.hardware || 'Unknown'}
        </Badge>
        {isMain && (
          <Badge className="bg-amber-500/10 text-[10px] text-amber-400 border-amber-500/20">
            CAP
          </Badge>
        )}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  meshNode: MeshNodeComponent,
}

// ─── Node Detail Panel ──────────────────────────────────

function MeshNodeDetailPanel({ node }: { node: MeshNode }) {
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              node.is_main ? 'bg-amber-500/20' : 'bg-blue-500/20'
            }`}
          >
            {node.is_main ? (
              <Crown className="h-5 w-5 text-amber-400" />
            ) : (
              <Wifi className="h-5 w-5 text-blue-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-white">
              {node.name || 'Mesh Node'}
            </SheetTitle>
            <SheetDescription>
              {node.is_online ? (
                <span className="text-emerald-400">Online</span>
              ) : (
                <span className="text-rose-400">Offline</span>
              )}
              {node.is_main && ' — Main Router (CAP)'}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <Separator className="my-4 bg-slate-800" />

      <div className="space-y-3">
        <InfoRow label="IP Address" value={node.ip || '—'} mono />
        <InfoRow label="MAC Address" value={node.mac} mono />
        <InfoRow label="Model" value={node.model || '—'} />
        <InfoRow label="Hardware" value={node.hardware || '—'} />
        <InfoRow
          label="Role"
          value={node.is_main ? 'Main Router (CAP)' : 'Satellite'}
        />
        <InfoRow
          label="Backhaul"
          value={
            node.is_main
              ? 'N/A (Main)'
              : node.backhaul_type === 'wired'
                ? 'Wired'
                : node.backhaul_type === 'wifi'
                  ? `Wireless (signal: ${node.signal})`
                  : node.backhaul_type
          }
        />
        <InfoRow
          label="Connected Devices"
          value={String(node.online_devices)}
        />
        {node.parent_mac && (
          <InfoRow label="Parent MAC" value={node.parent_mac} mono />
        )}
      </div>
    </>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`text-sm text-slate-300 ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export default function MeshPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<MeshNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null)

  const buildGraph = useCallback(
    async (isInitial: boolean) => {
      try {
        const data: MeshTopologyResponse = await fetchMeshTopology()
        const { nodes: meshNodes } = data

        // Compute positions on initial load; preserve on refresh
        let positionMap: Map<string, { x: number; y: number }>

        if (isInitial) {
          positionMap = computeLayout(meshNodes)
        } else {
          positionMap = new Map()
        }

        const flowNodes: MeshNodeType[] = meshNodes.map((mn, idx) => {
          const id = nodeKey(mn, idx)
          const pos = positionMap.get(id)
          return {
            id,
            type: 'meshNode' as const,
            position: pos
              ? { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 }
              : { x: 0, y: 0 },
            data: { node: mn },
            draggable: true,
          }
        })

        // Edges: each satellite connects to the main node (or its parent)
        const mainIdx = meshNodes.findIndex((n) => n.is_main)
        const mainId = mainIdx >= 0 ? nodeKey(meshNodes[mainIdx], mainIdx) : ''
        const allEdges: Edge[] = meshNodes
          .map((n, i) => ({ node: n, idx: i }))
          .filter((entry) => !entry.node.is_main)
          .map(({ node: satellite, idx }) => {
            const targetId = nodeKey(satellite, idx)
            const sourceId = satellite.parent_mac || mainId
            const isWired = satellite.backhaul_type === 'wired'
            return {
              id: `${sourceId}-${targetId}`,
              source: sourceId,
              target: targetId,
              type: 'default',
              animated: !isWired,
              label: isWired ? 'Wired' : 'Wireless',
              labelStyle: { fill: '#64748b', fontSize: 10 },
              labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
              labelBgPadding: [4, 2] as [number, number],
              style: {
                stroke: satellite.is_online
                  ? isWired
                    ? '#3b82f6'
                    : '#8b5cf6'
                  : '#334155',
                strokeWidth: isWired ? 2.5 : 1.5,
                strokeDasharray: isWired ? undefined : '5 5',
                opacity: satellite.is_online ? 0.7 : 0.2,
              },
            }
          })

        if (isInitial) {
          setNodes(flowNodes)
          setEdges(allEdges)
        } else {
          // On refresh, update data without changing positions
          setNodes((prev) => {
            const posMap = new Map(prev.map((n) => [n.id, n.position]))
            return flowNodes.map((n) => ({
              ...n,
              position: posMap.get(n.id) ?? n.position,
            }))
          })
          setEdges(allEdges)
        }

        setLastRefresh(new Date())
        setError(null)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load mesh topology',
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

  // Poll every 20s (more aggressive since no auth needed)
  useEffect(() => {
    const interval = setInterval(() => buildGraph(false), 20_000)
    return () => clearInterval(interval)
  }, [buildGraph])

  // Click handler — show node detail panel
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: MeshNodeType) => {
      setSelectedNode(node.data.node)
    },
    [],
  )

  // Count stats for header
  const stats = useMemo(() => {
    const meshNodes = nodes.map((n) => n.data.node)
    const online = meshNodes.filter((n) => n.is_online).length
    const totalDevices = meshNodes.reduce((sum, n) => sum + n.online_devices, 0)
    return {
      total: meshNodes.length,
      online,
      totalDevices,
    }
  }, [nodes])

  if (loading) {
    return (
      <PageTransition>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Loading mesh topology…</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (error) {
    return (
      <PageTransition>
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <Card className="w-full max-w-md border-slate-800 bg-slate-900">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
                <WifiOff className="h-8 w-8 text-rose-400" />
              </div>
              <h1 className="text-xl font-semibold text-white">
                Mesh Topology Unavailable
              </h1>
              <p className="text-center text-sm text-slate-400">
                Could not load mesh topology from the Xiaomi router. Make sure the router is powered on and the IP address is correct in Settings.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setLoading(true)
                    buildGraph(true)
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Link href="/settings/xiaomi-mesh">
                  <Button
                    variant="outline"
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
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
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
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
              const data = n.data as MeshNodeData
              if (data.node?.is_main) return '#f59e0b'
              return data.node?.is_online ? '#34d399' : '#475569'
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
              <span>{stats.total} node{stats.total !== 1 ? 's' : ''}</span>
              {' · '}
              <span>{stats.online} online</span>
              {' · '}
              <span>{stats.totalDevices} device{stats.totalDevices !== 1 ? 's' : ''}</span>
            </span>
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

      {/* Node detail slide-in panel */}
      <Sheet
        open={selectedNode !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedNode(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-slate-800 bg-slate-950 sm:max-w-md"
        >
          {selectedNode && <MeshNodeDetailPanel node={selectedNode} />}
        </SheetContent>
      </Sheet>
    </PageTransition>
  )
}
