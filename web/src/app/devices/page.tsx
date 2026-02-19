"use client";

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Devices</h1>
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
          Scan Now
        </button>
      </div>

      {/* Placeholder device grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <DeviceCard
          name="docker-lxc"
          ip="10.10.0.25"
          mac="52:54:00:12:34:56"
          vendor="QEMU/KVM"
          online={true}
        />
        <DeviceCard
          name="iPhone (Oleg)"
          ip="10.10.0.112"
          mac="AA:BB:CC:DD:EE:FF"
          vendor="Apple, Inc."
          online={true}
        />
        <DeviceCard
          name="Unknown Device"
          ip="10.10.0.203"
          mac="28:6C:07:AA:BB:CC"
          vendor="XIAOMI"
          online={false}
        />
      </div>
    </div>
  );
}

function DeviceCard({
  name,
  ip,
  mac,
  vendor,
  online,
}: {
  name: string;
  ip: string;
  mac: string;
  vendor: string;
  online: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-5 hover:border-accent/50 transition-colors cursor-pointer">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            online ? "bg-green-500 status-pulse" : "bg-red-500"
          }`}
        />
        <span className="font-medium text-white truncate">{name}</span>
      </div>
      <div className="mt-3 space-y-1">
        <p className="font-mono text-sm text-gray-400">{ip}</p>
        <p className="font-mono text-xs text-gray-500">{mac}</p>
        <p className="text-xs text-gray-500">{vendor}</p>
      </div>
    </div>
  );
}
