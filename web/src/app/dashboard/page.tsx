"use client";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Router Status"
          value="Online"
          subtitle="VyOS 1.4 • Uptime: 42d 7h"
          status="online"
        />
        <StatCard
          title="Active Devices"
          value="23"
          subtitle="3 new this week"
          status="online"
        />
        <StatCard
          title="WAN Bandwidth"
          value="↓ 45.2 Mbps"
          subtitle="↑ 12.8 Mbps"
          status="online"
        />
        <StatCard
          title="Active Alerts"
          value="2"
          subtitle="1 unread"
          status="warning"
        />
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-6">
          <h2 className="mb-4 text-lg font-medium text-white">
            Recent Activity
          </h2>
          <p className="text-sm text-gray-500">
            Device state changes will appear here.
          </p>
        </div>
        <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-6">
          <h2 className="mb-4 text-lg font-medium text-white">
            Bandwidth Overview
          </h2>
          <p className="text-sm text-gray-500">
            Traffic charts will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  status,
}: {
  title: string;
  value: string;
  subtitle: string;
  status: "online" | "offline" | "warning";
}) {
  const statusColors = {
    online: "bg-green-500",
    offline: "bg-red-500",
    warning: "bg-amber-500",
  };

  return (
    <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">{title}</span>
        <span
          className={`h-2 w-2 rounded-full ${statusColors[status]} status-pulse`}
        />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
