import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/CommandPalette";
import { WebSocketProvider } from "@/components/providers/WebSocketProvider";

/**
 * Authenticated app layout with sidebar + topbar.
 * Login page uses the root layout directly (no chrome).
 *
 * WebSocketProvider keeps a persistent WS connection so all child pages
 * receive live updates (device/agent state changes) without polling.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <CommandPalette />
    </WebSocketProvider>
  );
}
