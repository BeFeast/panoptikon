"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/devices", label: "Devices", icon: "💻" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/router", label: "Router", icon: "🔀" },
  { href: "/traffic", label: "Traffic", icon: "📈" },
  { href: "/alerts", label: "Alerts", icon: "🔔" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col border-r border-[#2a2a3a] bg-[#0d0d14]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-[#2a2a3a] px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
          P
        </div>
        <span className="text-lg font-semibold text-white">Panoptikon</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-gray-400 hover:bg-[#16161f] hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#2a2a3a] p-4">
        <p className="text-xs text-gray-600">Panoptikon v0.1.0</p>
      </div>
    </aside>
  );
}
