import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { WebSocketProvider } from "@/components/providers/WebSocketProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar mobileMenu={<MobileSidebar />} />
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6">{children}</main>
          </div>
        </div>
        <CommandPalette />
      </TooltipProvider>
    </WebSocketProvider>
  );
}
