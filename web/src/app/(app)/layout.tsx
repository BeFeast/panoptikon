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
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <TopBar mobileMenu={<MobileSidebar />} />
            <main className="min-w-0 flex-1 px-3 pb-8 pt-4 md:px-6 md:pb-10 md:pt-6">{children}</main>
          </div>
        </div>
        <CommandPalette />
      </TooltipProvider>
    </WebSocketProvider>
  );
}
