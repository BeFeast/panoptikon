'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Bell,
  Cpu,
  LayoutDashboard,
  MonitorSmartphone,
  Router,
  Search,
  Settings,
} from 'lucide-react'
import { searchAll } from '@/lib/api'
import type { SearchDevice } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

interface PaletteItem {
  id: string
  label: string
  sublabel?: string
  href: string
  icon?: LucideIcon
  section: 'pages' | 'devices' | 'actions'
  isOnline?: boolean
}

const PAGES: PaletteItem[] = [
  { id: 'page-dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'pages' },
  { id: 'page-devices', label: 'Devices', href: '/devices', icon: MonitorSmartphone, section: 'pages' },
  { id: 'page-agents', label: 'Agents', href: '/agents', icon: Cpu, section: 'pages' },
  { id: 'page-traffic', label: 'Traffic', href: '/traffic', icon: Activity, section: 'pages' },
  { id: 'page-alerts', label: 'Alerts', href: '/alerts', icon: Bell, section: 'pages' },
  { id: 'page-router', label: 'Router', href: '/router', icon: Router, section: 'pages' },
  { id: 'page-settings', label: 'Settings', href: '/settings', icon: Settings, section: 'pages' },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [deviceItems, setDeviceItems] = useState<PaletteItem[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter pages by query
  const filteredPages = query.length > 0
    ? PAGES.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES

  // Flatten all items for keyboard navigation
  const allItems: PaletteItem[] = [...filteredPages, ...deviceItems]

  // ── Global Cmd+K / Ctrl+K listener ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Auto-focus input when opened ──
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setDeviceItems([])
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // ── Debounced device search ──
  useEffect(() => {
    if (!open || query.length < 2) {
      setDeviceItems([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const data = await searchAll(query)
        const devices: PaletteItem[] = data.devices.map((d: SearchDevice) => ({
          id: `device-${d.id}`,
          label: d.ip_address || d.mac_address,
          sublabel: d.hostname || d.vendor || undefined,
          href: `/devices?highlight=${d.id}`,
          section: 'devices' as const,
          isOnline: d.is_online,
        }))
        setDeviceItems(devices)
      } catch {
        setDeviceItems([])
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query, open])

  // ── Reset active index when items change ──
  useEffect(() => {
    setActiveIndex(0)
  }, [query, deviceItems.length])

  // ── Scroll active item into view ──
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('[data-active="true"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  // ── Navigate to item ──
  const handleSelect = useCallback(
    (item: PaletteItem) => {
      setOpen(false)
      router.push(item.href)
    },
    [router],
  )

  // ── Keyboard navigation inside modal ──
  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % Math.max(allItems.length, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) =>
          prev <= 0 ? Math.max(allItems.length - 1, 0) : prev - 1,
        )
        break
      case 'Enter':
        e.preventDefault()
        if (allItems[activeIndex]) {
          handleSelect(allItems[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  if (!open) return null

  // Build sections for rendering
  const pagesSection = filteredPages
  const devicesSection = deviceItems

  let runningIdx = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 backdrop-blur-sm pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[560px] max-h-[480px] flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices, pages..."
            className="flex-1 bg-transparent text-lg text-white placeholder-slate-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {/* Pages section */}
          {pagesSection.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pages
              </div>
              {pagesSection.map((item) => {
                const idx = runningIdx++
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    data-active={activeIndex === idx}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeIndex === idx
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/50'
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Devices section */}
          {devicesSection.length > 0 && (
            <div className="mt-2">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Devices
              </div>
              {devicesSection.map((item) => {
                const idx = runningIdx++
                return (
                  <button
                    key={item.id}
                    data-active={activeIndex === idx}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeIndex === idx
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/50'
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                        item.isOnline
                          ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span className="font-mono tabular-nums">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-slate-500">({item.sublabel})</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {allItems.length === 0 && query.length > 0 && (
            <div className="px-3 py-8 text-center text-sm text-slate-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
