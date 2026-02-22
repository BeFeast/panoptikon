"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle,
  XCircle,
  FileText,
  Filter,
  Terminal,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { fetchAuditLog, fetchAuditLogActions } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/types";

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actions, setActions] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLog(
        page,
        perPage,
        actionFilter || undefined
      );
      setItems(data.items);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, perPage, actionFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchAuditLogActions()
      .then(setActions)
      .catch(() => {});
  }, []);

  function handleFilterChange(value: string) {
    setActionFilter(value);
    setPage(1);
  }

  function formatAction(action: string): string {
    return action
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function formatTimestamp(ts: string): string {
    try {
      const d = new Date(ts + "Z");
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  }

  function parseCommands(json: string): string[] {
    try {
      return JSON.parse(json);
    } catch {
      return [json];
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Audit Log</h1>
          <a
            href="/settings"
            className="text-sm text-slate-400 hover:text-slate-300"
          >
            Back to Settings
          </a>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
                <FileText className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base text-white">
                  VyOS Configuration Changes
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  All write operations executed against the VyOS router.
                </CardDescription>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={actionFilter}
                  onChange={(e) => handleFilterChange(e.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="">All actions</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {formatAction(a)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                Loading audit log...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-sm text-slate-500">
                <FileText className="mb-2 h-8 w-8 text-slate-700" />
                No audit log entries yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {items.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const commands = parseCommands(entry.vyos_commands);
                  return (
                    <div key={entry.id}>
                      {/* Row */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : entry.id)
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
                      >
                        {/* Expand icon */}
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        )}

                        {/* Status */}
                        {entry.success ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        )}

                        {/* Action badge */}
                        <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          {formatAction(entry.action)}
                        </span>

                        {/* Description */}
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                          {entry.description}
                        </span>

                        {/* Timestamp */}
                        <span className="shrink-0 text-[10px] text-slate-600">
                          {formatTimestamp(entry.created_at)}
                        </span>
                      </button>

                      {/* Expanded details */}
                      {expanded && (
                        <div className="border-t border-slate-800/50 bg-slate-950/50 px-4 py-3">
                          {entry.error_msg && (
                            <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                              <p className="text-xs text-rose-400">
                                {entry.error_msg}
                              </p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <Terminal className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              VyOS Commands
                            </span>
                          </div>
                          <div className="space-y-1">
                            {commands.map((cmd, i) => (
                              <div
                                key={i}
                                className="rounded bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-300"
                              >
                                {cmd}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
                <span className="text-xs text-slate-500">
                  {total} {total === 1 ? "entry" : "entries"}
                  {totalPages > 1 &&
                    ` \u2022 Page ${page} of ${totalPages}`}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
