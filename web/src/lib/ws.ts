"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────

export interface WsMessage {
  event: string;
  data: unknown;
}

/** All event types the backend may broadcast to UI clients. */
export type WsEventType =
  | "device_online"
  | "device_offline"
  | "new_device"
  | "agent_online"
  | "agent_offline"
  | "agent_report";

// ─── Custom DOM event for decoupled pub/sub ─────────────

const WS_EVENT_NAME = "panoptikon:ws";

/** Dispatch a WebSocket message as a DOM CustomEvent so any component can listen. */
function dispatchWsEvent(msg: WsMessage) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WS_EVENT_NAME, { detail: msg }));
  }
}

// ─── useWsEvent — subscribe to specific WS events ──────

/**
 * Subscribe to one or more WebSocket event types.
 * Calls `handler` whenever a matching event arrives.
 *
 * ```tsx
 * useWsEvent(["device_online", "device_offline", "new_device"], () => {
 *   refetchDevices();
 * });
 * ```
 */
export function useWsEvent(
  events: WsEventType | WsEventType[],
  handler: (msg: WsMessage) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const eventList = Array.isArray(events) ? events : [events];
  // Stable key so useEffect doesn't re-run on every render
  const eventsKey = eventList.join(",");

  useEffect(() => {
    const listener = (e: Event) => {
      const msg = (e as CustomEvent<WsMessage>).detail;
      if (eventList.includes(msg.event as WsEventType)) {
        handlerRef.current(msg);
      }
    };

    window.addEventListener(WS_EVENT_NAME, listener);
    return () => window.removeEventListener(WS_EVENT_NAME, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);
}

// ─── useWebSocket — main hook ───────────────────────────

interface UseWebSocketOptions {
  /** Override the WebSocket URL. Auto-detected from window.location by default. */
  url?: string;
  /** Auto-reconnect on disconnect. Default: true. */
  reconnect?: boolean;
  /** Initial reconnect delay in ms. Default: 1000. */
  initialDelay?: number;
  /** Maximum reconnect delay in ms. Default: 30000. */
  maxDelay?: number;
}

/**
 * React hook for live WebSocket updates from the Panoptikon server.
 *
 * - Connects to the `/api/v1/ws` endpoint (auto-detects ws/wss from page protocol).
 * - Reconnects with exponential backoff on disconnect (1s → 30s).
 * - Dispatches incoming messages as DOM CustomEvents (`panoptikon:ws`).
 * - Returns `connected` boolean for UI indicators.
 *
 * Usage:
 * ```tsx
 * const { connected } = useWebSocket();
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    reconnect = true,
    initialDelay = 1000,
    maxDelay = 30000,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const delayRef = useRef(initialDelay);
  const mountedRef = useRef(true);

  // Build WS URL from window.location (works for both dev proxy and production)
  const getUrl = useCallback(() => {
    if (options.url) return options.url;
    if (typeof window === "undefined") return "ws://localhost:8080/api/v1/ws";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/v1/ws`;
  }, [options.url]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(getUrl());

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setConnected(true);
        delayRef.current = initialDelay; // Reset backoff on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          dispatchWsEvent(data);
        } catch {
          // Non-JSON message — ignore.
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        if (reconnect) {
          const delay = delayRef.current;
          // Exponential backoff: double the delay, cap at maxDelay
          delayRef.current = Math.min(delay * 2, maxDelay);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror — it handles reconnection.
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection creation failed — schedule retry.
      if (reconnect && mountedRef.current) {
        const delay = delayRef.current;
        delayRef.current = Math.min(delay * 2, maxDelay);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    }
  }, [getUrl, reconnect, initialDelay, maxDelay]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
