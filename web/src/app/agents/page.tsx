"use client";

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Agents</h1>
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
          Add Agent
        </button>
      </div>

      {/* Agent list placeholder */}
      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f]">
        <div className="border-b border-[#2a2a3a] p-4">
          <div className="grid grid-cols-5 text-sm font-medium text-gray-400">
            <span>Name</span>
            <span>Host</span>
            <span>Platform</span>
            <span>Last Report</span>
            <span>Status</span>
          </div>
        </div>

        <AgentRow
          name="docker-lxc"
          host="10.10.0.25"
          platform="linux-amd64"
          lastReport="2s ago"
          online={true}
        />
        <AgentRow
          name="mini"
          host="10.10.0.45"
          platform="darwin-arm64"
          lastReport="5s ago"
          online={true}
        />
        <AgentRow
          name="pi-garage"
          host="10.10.0.80"
          platform="linux-arm64"
          lastReport="3m ago"
          online={false}
        />
      </div>

      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-6">
        <h2 className="mb-2 text-lg font-medium text-white">Install Agent</h2>
        <p className="mb-4 text-sm text-gray-400">
          Run this command on the target machine to install the Panoptikon
          agent:
        </p>
        <pre className="rounded-md bg-background p-4 font-mono text-sm text-gray-300 overflow-x-auto">
          curl -fsSL http://YOUR_SERVER:8080/api/v1/agent/install/linux-amd64?key=YOUR_KEY | sh
        </pre>
      </div>
    </div>
  );
}

function AgentRow({
  name,
  host,
  platform,
  lastReport,
  online,
}: {
  name: string;
  host: string;
  platform: string;
  lastReport: string;
  online: boolean;
}) {
  return (
    <div className="grid grid-cols-5 border-b border-[#2a2a3a] p-4 text-sm last:border-b-0 hover:bg-[#1a1a25] transition-colors">
      <span className="text-white font-medium">{name}</span>
      <span className="font-mono text-gray-400">{host}</span>
      <span className="text-gray-400">{platform}</span>
      <span className="text-gray-400">{lastReport}</span>
      <span className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            online ? "bg-green-500 status-pulse" : "bg-red-500"
          }`}
        />
        <span className={online ? "text-green-400" : "text-red-400"}>
          {online ? "Online" : "Offline"}
        </span>
      </span>
    </div>
  );
}
