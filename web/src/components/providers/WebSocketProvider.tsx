"use client";

import { createContext, useContext } from "react";
import { useWebSocket } from "@/lib/ws";

interface WebSocketContextValue {
  /** Whether the WebSocket is currently connected to the server. */
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
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
  const { connected } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

/** Returns whether the WebSocket is currently connected. */
export function useWsConnected(): boolean {
  return useContext(WebSocketContext).connected;
}
