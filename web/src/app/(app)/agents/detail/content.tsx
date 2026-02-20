"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAgent, fetchAgentReports } from "@/lib/api";
import type { Agent, AgentReport } from "@/lib/types";
import { formatBytes, formatPercent, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";

export default function AgentDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const [agent, setAgent] = useState<Agent | null>(null);
  const [reports, setReports] = useState<AgentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [a, r] = await Promise.all([
        fetchAgent(id),
        fetchAgentReports(id, 100),
      ]);
      setAgent(a);
      setReports(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      router.replace("/agents");
      return;
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [id, load, router]);

  useWsEvent(["agent_report", "agent_online", "agent_offline"], load);

  if (!id) return null;

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!agent || !reports) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Reports come DESC from API, reverse for chronological charts
  const chronological = [...reports].reverse();

  const chartData = chronological.map((r) => {
    const memPercent =
      r.mem_total && r.mem_total > 0 && r.mem_used != null
        ? (r.mem_used / r.mem_total) * 100
        : null;
    return {
      time: new Date(r.reported_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      cpu: r.cpu_percent,
      ram: memPercent != null ? Math.round(memPercent * 10) / 10 : null,
    };
  });

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          Back to Agents
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">
            {agent.name ?? agent.id.slice(0, 8)}
          </h1>
          <Badge
            variant="outline"
            className={
              agent.is_online
                ? "border-green-500/50 text-green-400"
                : "border-red-500/50 text-red-400"
            }
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                agent.is_online ? "bg-green-500 status-pulse" : "bg-red-500"
              }`}
            />
            {agent.is_online ? "Online" : "Offline"}
          </Badge>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Last seen: {agent.last_report_at ? timeAgo(agent.last_report_at) : "Never"}
          {agent.hostname && <> · {agent.hostname}</>}
          {agent.os_name && <> · {agent.os_name} {agent.os_version ?? ""}</>}
        </p>
      </div>

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CPU Chart */}
          <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-3">CPU Usage %</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    stroke="#2a2a3a"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    stroke="#2a2a3a"
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#16161f",
                      border: "1px solid #2a2a3a",
                      borderRadius: "6px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "CPU"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RAM Chart */}
          <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-3">RAM Usage %</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    stroke="#2a2a3a"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    stroke="#2a2a3a"
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#16161f",
                      border: "1px solid #2a2a3a",
                      borderRadius: "6px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "RAM"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ram"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-8 text-center">
          <p className="text-gray-500">No report data available yet.</p>
        </div>
      )}

      {/* Reports table */}
      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f]">
        <div className="px-4 py-3 border-b border-[#2a2a3a]">
          <h2 className="text-sm font-medium text-gray-400">
            Recent Reports ({reports.length})
          </h2>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No reports yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a3a] hover:bg-transparent">
                <TableHead className="text-gray-500">Time</TableHead>
                <TableHead className="text-gray-500">CPU %</TableHead>
                <TableHead className="text-gray-500">RAM Used</TableHead>
                <TableHead className="text-gray-500">RAM Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id} className="border-[#2a2a3a]">
                  <TableCell className="text-gray-400 font-mono text-xs">
                    {new Date(report.reported_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-white">
                    {report.cpu_percent != null
                      ? formatPercent(report.cpu_percent)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-white">
                    {report.mem_used != null
                      ? formatBytes(report.mem_used)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-white">
                    {report.mem_total != null
                      ? formatBytes(report.mem_total)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
