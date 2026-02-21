"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchAll } from "@/lib/api";
import type { SearchResponse, SearchDevice, SearchAgent, SearchAlert } from "@/lib/types";

export function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build a flat list of navigable items for keyboard navigation
  const flatItems = useCallback((): Array<{ type: string; id: string; label: string }> => {
    if (!results) return [];
    const items: Array<{ type: string; id: string; label: string }> = [];
    for (const d of results.devices) {
      items.push({ type: "device", id: d.id, label: d.ip_address || d.hostname || d.mac_address });
    }
    for (const a of results.agents) {
      items.push({ type: "agent", id: a.id, label: a.name || a.id });
    }
    for (const al of results.alerts) {
      items.push({ type: "alert", id: al.id, label: al.message });
    }
    return items;
  }, [results]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await searchAll(query);
        setResults(data);
        setIsOpen(true);
        setActiveIndex(-1);
      } catch {
        setResults(null);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function navigateTo(type: string, id: string) {
    setIsOpen(false);
    setQuery("");
    if (type === "device") {
      router.push(`/devices?highlight=${id}`);
    } else if (type === "agent") {
      router.push(`/agents`);
    } else if (type === "alert") {
      router.push(`/alerts`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const items = flatItems();
    if (!isOpen || items.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) {
          navigateTo(items[activeIndex].type, items[activeIndex].id);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  }

  const hasResults =
    results &&
    (results.devices.length > 0 || results.agents.length > 0 || results.alerts.length > 0);
  const noResults = results && !hasResults;

  // Track running index across sections for keyboard nav
  let runningIndex = 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-md" ref={containerRef}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results && query.length >= 2) setIsOpen(true);
          }}
          placeholder="Search devices, IPs, MACs..."
          className="w-full rounded-md border border-slate-800 bg-background px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-accent focus:outline-none"
        />

        {/* Search Results Dropdown */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-slate-800 bg-slate-950 shadow-xl">
            {noResults && (
              <div className="px-4 py-3 text-sm text-slate-500">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {hasResults && (
              <>
                {/* Devices */}
                {results.devices.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Devices
                    </div>
                    {results.devices.map((d: SearchDevice) => {
                      const idx = runningIndex++;
                      return (
                        <button
                          key={d.id}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                            activeIndex === idx ? "bg-slate-800" : ""
                          }`}
                          onClick={() => navigateTo("device", d.id)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              d.is_online ? "bg-emerald-500" : "bg-slate-500"
                            }`}
                          />
                          <span className="text-white">
                            {d.ip_address || d.mac_address}
                          </span>
                          {d.hostname && (
                            <span className="text-slate-500">({d.hostname})</span>
                          )}
                          {d.vendor && (
                            <span className="ml-auto text-xs text-slate-600">{d.vendor}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Agents */}
                {results.agents.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 border-t border-slate-800">
                      Agents
                    </div>
                    {results.agents.map((a: SearchAgent) => {
                      const idx = runningIndex++;
                      return (
                        <button
                          key={a.id}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                            activeIndex === idx ? "bg-slate-800" : ""
                          }`}
                          onClick={() => navigateTo("agent", a.id)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              a.is_online ? "bg-emerald-500" : "bg-slate-500"
                            }`}
                          />
                          <span className="text-white">{a.name || a.id}</span>
                          {a.hostname && (
                            <span className="text-slate-500">({a.hostname})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Alerts */}
                {results.alerts.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 border-t border-slate-800">
                      Alerts
                    </div>
                    {results.alerts.map((al: SearchAlert) => {
                      const idx = runningIndex++;
                      return (
                        <button
                          key={al.id}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                            activeIndex === idx ? "bg-slate-800" : ""
                          }`}
                          onClick={() => navigateTo("alert", al.id)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <SeverityBadge severity={al.severity} />
                          <span className="text-white truncate max-w-[300px]">
                            {al.message.length > 60
                              ? al.message.slice(0, 60) + "…"
                              : al.message}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right side: alerts bell + user avatar */}
      <div className="flex items-center gap-4">
        {/* Alerts bell */}
        <button className="relative text-slate-400 hover:text-white transition-colors">
          <span className="text-xl">🔔</span>
          {/* Unread badge */}
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            2
          </span>
        </button>

        {/* User avatar */}
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
          A
        </button>
      </div>
    </header>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    WARNING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    INFO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  const cls = colors[severity] || colors.WARNING;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {severity}
    </span>
  );
}
