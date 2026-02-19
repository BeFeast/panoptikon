"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface WsMessage {
  event: string;
  payload: unknown;
}

interface UseWebSocketOptions {
  /** WebSocket URL (defaults to the current host with /api/v1/ws). */
  url?: string;
  /** Auto-reconnect on disconnect. Default: true. */
  reconnect?: boolean;
  /** Reconnect interval in ms. Default: 3000. */
  reconnectInterval?: number;
}

/**
 * React hook for live WebSocket updates from the Panoptikon server.
 *
 * Usage:
 * ```tsx
 * const { lastMessage, connected } = useWebSocket();
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = `ws://${typeof window !== "undefined" ? window.location.host : "localhost:8080"}/api/v1/ws`,
    reconnect = true,
    reconnectInterval = 3000,
  } = options;

  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          setLastMessage(data);
        } catch {
          // Non-JSON message, ignore.
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        if (reconnect) {
          reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, retry.
      if (reconnect) {
        reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
      }
    }
  }, [url, reconnect, reconnectInterval]);

  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastMessage };
}
