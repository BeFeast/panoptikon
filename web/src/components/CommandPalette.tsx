'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Activity,
  Bell,
  BellPlus,
  Cpu,
  LayoutDashboard,
  Monitor,
  MonitorSmartphone,
  Package,
  Plus,
  Radar,
  Router,
  Search,
  Settings,
  Terminal,
} from 'lucide-react'
import { searchAll } from '@/lib/api'
import type { SearchDevice, SearchAgent, SearchSshTarget, SearchAsset } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

interface SearchResults {
  devices: SearchDevice[]
  agents: SearchAgent[]
  ssh_targets: SearchSshTarget[]
  assets: SearchAsset[]
}

const EMPTY_RESULTS: SearchResults = { devices: [], agents: [], ssh_targets: [], assets: [] }

interface PageItem {
  label: string
  href: string
  icon: LucideIcon
}

const PAGES: PageItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Devices', href: '/devices', icon: MonitorSmartphone },
  { label: 'Agents', href: '/agents', icon: Cpu },
  { label: 'Traffic', href: '/traffic', icon: Activity },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Router', href: '/router', icon: Router },
  { label: 'MikroTik', href: '/router/mikrotik', icon: Router },
  { label: 'pfSense', href: '/router/pfsense', icon: Router },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [scanning, setScanning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Global Cmd+K / Ctrl+K listener ──
  // Toggles the dialog open/closed. Fires regardless of focused element so the
  // shortcut works from text inputs (Linear/GitHub/Slack convention). Uses
  // case-insensitive match so Shift+Cmd+K still triggers.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Belt-and-braces: cmdk's autoFocus normally focuses the input, but Radix
  // focus-trap timing can briefly hand focus to the dialog root first. Force
  // focus to the input whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  // ── Reset state when closed ──
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults(EMPTY_RESULTS)
    }
  }, [open])

  // ── Debounced search across all entity types ──
  useEffect(() => {
    if (!open || query.length < 2) {
      setResults(EMPTY_RESULTS)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const data = await searchAll(query)
        setResults(data)
      } catch {
        setResults(EMPTY_RESULTS)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query, open])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const handleScanNow = useCallback(async () => {
    setOpen(false)
    if (scanning) return
    setScanning(true)
    try {
      await fetch('/api/v1/scanner/trigger', { method: 'POST', credentials: 'include' })
      toast.success('Network scan complete')
    } catch {
      toast.error('Network scan failed')
    } finally {
      setTimeout(() => setScanning(false), 5000)
    }
  }, [scanning])

  const hasDevices = results.devices.length > 0
  const hasAgents = results.agents.length > 0
  const hasSsh = results.ssh_targets.length > 0
  const hasAssets = results.assets.length > 0
  const hasResults = hasDevices || hasAgents || hasSsh || hasAssets

  const groupHeadingClass =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-mesh-text-mute'

  const itemClass =
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-mesh-text outline-none aria-selected:bg-mesh-accent/12 aria-selected:text-white cursor-pointer transition-colors'

  const groupDividerClass = `border-t border-mesh-border-strong mt-1 pt-1 ${groupHeadingClass}`

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="flex flex-col flex-1 min-h-0"
      overlayClassName="fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[15vh] -translate-x-1/2 z-[100] w-[min(560px,calc(100vw-2rem))] max-h-[min(480px,60vh)] flex flex-col overflow-hidden mesh-card shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)]"
      shouldFilter={!hasResults}
    >
      {/* Search input */}
      <div className="flex items-center gap-3 border-b border-mesh-border-strong px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-mesh-text-dim" />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search pages, devices, actions…"
          autoFocus
          className="flex-1 bg-transparent text-base text-white placeholder-mesh-text-mute outline-none"
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-mesh-text-mute bg-mesh-surface-1 px-1.5 py-0.5 text-[11px] font-medium text-mesh-text-dim">
          ESC
        </kbd>
      </div>

      {/* Results list */}
      <Command.List className="flex-1 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-mesh-text-mute">
          No results found.
        </Command.Empty>

        {/* ── When search returns entity matches, show them first ── */}
        {hasDevices && (
          <Command.Group heading="Devices" className={groupHeadingClass}>
            {results.devices.map((d) => (
              <Command.Item
                key={`device-${d.id}`}
                value={`device ${d.name ?? ''} ${d.ip_address ?? ''} ${d.mac_address ?? ''}`}
                onSelect={() => navigate(`/devices?selected=${d.id}`)}
                className={itemClass}
              >
                <Monitor className="h-4 w-4 shrink-0 text-mesh-text-dim" />
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    d.is_online
                      ? 'bg-[#4ade80] ring-2 ring-[#4ade80]/30'
                      : 'bg-mesh-text-mute'
                  }`}
                />
                <span className="font-mono tabular-nums">
                  {d.name || d.ip_address || d.mac_address}
                </span>
                {(d.hostname || d.vendor) && (
                  <span className="text-mesh-text-mute">({d.hostname || d.vendor})</span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {hasAgents && (
          <Command.Group heading="Agents" className={hasDevices ? groupDividerClass : groupHeadingClass}>
            {results.agents.map((a) => (
              <Command.Item
                key={`agent-${a.id}`}
                value={`agent ${a.name ?? ''} ${a.hostname ?? ''}`}
                onSelect={() => navigate('/agents')}
                className={itemClass}
              >
                <Cpu className="h-4 w-4 shrink-0 text-mesh-text-dim" />
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    a.is_online
                      ? 'bg-[#4ade80] ring-2 ring-[#4ade80]/30'
                      : 'bg-mesh-text-mute'
                  }`}
                />
                <span>{a.name || a.id}</span>
                {a.hostname && (
                  <span className="text-mesh-text-mute">({a.hostname})</span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {hasSsh && (
          <Command.Group heading="SSH Hosts" className={(hasDevices || hasAgents) ? groupDividerClass : groupHeadingClass}>
            {results.ssh_targets.map((st) => (
              <Command.Item
                key={`ssh-${st.id}`}
                value={`ssh ${st.name} ${st.host}`}
                onSelect={() => navigate('/ssh-hosts')}
                className={itemClass}
              >
                <Terminal className="h-4 w-4 shrink-0 text-mesh-text-dim" />
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    st.is_online
                      ? 'bg-[#4ade80] ring-2 ring-[#4ade80]/30'
                      : 'bg-mesh-text-mute'
                  }`}
                />
                <span>{st.name}</span>
                <span className="text-mesh-text-mute font-mono text-xs">
                  {st.username}@{st.host}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {hasAssets && (
          <Command.Group heading="Assets" className={(hasDevices || hasAgents || hasSsh) ? groupDividerClass : groupHeadingClass}>
            {results.assets.map((asset) => (
              <Command.Item
                key={`asset-${asset.id}`}
                value={`asset ${asset.name} ${asset.location ?? ''}`}
                onSelect={() => navigate('/assets')}
                className={itemClass}
              >
                <Package className="h-4 w-4 shrink-0 text-mesh-text-dim" />
                <span>{asset.name}</span>
                {(asset.location || asset.asset_type) && (
                  <span className="text-mesh-text-mute text-xs">
                    ({asset.location || asset.asset_type})
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* ── Quick Actions ── */}
        <Command.Group heading="Actions" className={hasResults ? groupDividerClass : groupHeadingClass}>
          <Command.Item
            value="Scan Now"
            onSelect={handleScanNow}
            className={itemClass}
          >
            <Radar className="h-4 w-4 shrink-0 text-mesh-text-dim" />
            <span>Scan Now</span>
          </Command.Item>
          <Command.Item
            value="Add Agent"
            onSelect={() => navigate('/agents')}
            className={itemClass}
          >
            <Plus className="h-4 w-4 shrink-0 text-mesh-text-dim" />
            <span>Add Agent</span>
          </Command.Item>
          <Command.Item
            value="Add Alert"
            onSelect={() => navigate('/alerts')}
            className={itemClass}
          >
            <BellPlus className="h-4 w-4 shrink-0 text-mesh-text-dim" />
            <span>Add Alert</span>
          </Command.Item>
        </Command.Group>

        {/* ── Pages (navigation) — last when search results exist ── */}
        <Command.Group heading="Pages" className={groupDividerClass}>
          {PAGES.map((page) => (
            <Command.Item
              key={page.href}
              value={page.label}
              onSelect={() => navigate(page.href)}
              className={itemClass}
            >
              <page.icon className="h-4 w-4 shrink-0 text-mesh-text-dim" />
              <span>{page.label}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
