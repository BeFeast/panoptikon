import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { WebSocketProvider } from "@/components/providers/WebSocketProvider";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Authenticated app layout with sidebar + topbar.
 * Login page uses the root layout directly (no chrome).
 *
 * SWRProvider enables cache-across-navigation for all data fetching hooks.
 * WebSocketProvider keeps a persistent WS connection so all child pages
 * receive live updates (device/agent state changes) without polling.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <WebSocketProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen overflow-clip bg-slate-950/70">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-[linear-gradient(180deg,rgba(15,23,42,0.45),rgba(2,6,23,0.18))]">
            <TopBar mobileMenu={<MobileSidebar />} />
            <Breadcrumbs />
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-8 pt-3 md:px-5 md:pb-10 md:pt-5">
              <div className="mx-auto w-full max-w-[1700px]">{children}</div>
            </main>
          </div>
        </div>
        <CommandPalette />
      </TooltipProvider>
    </WebSocketProvider>
    </SWRProvider>
  );
}
