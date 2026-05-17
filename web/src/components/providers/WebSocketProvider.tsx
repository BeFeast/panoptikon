"use client";

import { createContext, useContext } from "react";
import { useWebSocket } from "@/lib/ws";

interface WebSocketContextValue {
  /** Whether the WebSocket is currently connected to the server. */
  connected: boolean;
  /** Time from socket construction to open, used as a lightweight live latency signal. */
  latencyMs: number | null;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  latencyMs: null,
});

/**
 * Provides a live WebSocket connection to the Panoptikon backend.
 *
 * Place this high in the component tree (e.g. app layout) so the connection
 * persists across page navigations. Child components can:
 *
 * 1. Read connection status via `useWsConnected()`
 * 2. Subscribe to specific events via `useWsEvent()`
 */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { connected, latencyMs } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ connected, latencyMs }}>
      {children}
    </WebSocketContext.Provider>
  );
}

/** Returns whether the WebSocket is currently connected. */
export function useWsConnected(): boolean {
  return useContext(WebSocketContext).connected;
}

/** Returns WebSocket status fields for compact shell status indicators. */
export function useWsStatus(): WebSocketContextValue {
  return useContext(WebSocketContext);
}
