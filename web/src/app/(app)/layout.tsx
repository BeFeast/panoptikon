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
 * SWRProvider enables data caching and deduplication across pages.
 * WebSocketProvider keeps a persistent WS connection so all child pages
 * receive live updates (device/agent state changes) without polling.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
    <WebSocketProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen overflow-clip">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-clip">
            <TopBar mobileMenu={<MobileSidebar />} />
            <Breadcrumbs />
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-8 pt-4 md:px-6 md:pb-10 md:pt-6">
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
