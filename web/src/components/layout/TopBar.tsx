"use client";

export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[#2a2a3a] bg-[#0d0d14] px-6">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search devices, IPs, MACs..."
          className="w-full rounded-md border border-[#2a2a3a] bg-background px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Right side: alerts bell + user avatar */}
      <div className="flex items-center gap-4">
        {/* Alerts bell */}
        <button className="relative text-gray-400 hover:text-white transition-colors">
          <span className="text-xl">🔔</span>
          {/* Unread badge */}
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
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
