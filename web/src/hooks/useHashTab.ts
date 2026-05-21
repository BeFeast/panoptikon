"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Like useState, but syncs the active tab value with the URL hash.
 *
 * - Opening `/page#tab-name` activates that tab on mount.
 * - Clicking a tab pushes a new history entry so the browser back/forward
 *   buttons step between previously-visited tabs.
 * - `hashchange` (fired by the browser on back/forward across hash entries)
 *   keeps the in-memory tab in sync with the URL.
 *
 * Callers typically pass a freshly-spread array for `validValues`. The hook
 * stashes the latest values in a ref so the `setTab` identity stays stable
 * across renders.
 */
export function useHashTab<T extends string>(
  defaultValue: T,
  validValues?: T[],
): [T, (value: string) => void] {
  const [tab, setTabState] = useState<T>(defaultValue);

  const defaultRef = useRef(defaultValue);
  const validRef = useRef(validValues);
  defaultRef.current = defaultValue;
  validRef.current = validValues;

  const resolveHash = useCallback((raw: string): T | null => {
    const hash = raw.replace(/^#/, "");
    if (!hash) return null;
    const valid = validRef.current;
    if (!valid || valid.includes(hash as T)) {
      return hash as T;
    }
    return null;
  }, []);

  // On mount, read the hash from the URL. Falls through to the default if the
  // hash is missing or not in the validValues list.
  useEffect(() => {
    const next = resolveHash(window.location.hash);
    if (next !== null) {
      setTabState(next);
    }
  }, [resolveHash]);

  const setTab = useCallback(
    (value: string) => {
      const valid = validRef.current;
      const next =
        valid && !valid.includes(value as T)
          ? defaultRef.current
          : (value as T);
      setTabState(next);
      if (typeof window === "undefined") return;
      const currentHash = window.location.hash.replace(/^#/, "");
      if (currentHash === next) return;
      // Push instead of replace so browser back/forward steps between tabs.
      const { pathname, search } = window.location;
      window.history.pushState(null, "", `${pathname}${search}#${next}`);
    },
    [],
  );

  // Listen for hash changes (browser back/forward across hash entries, or any
  // external hash mutation). Falls back to defaultValue when the new hash is
  // not in validValues so an invalid deep-link does not strand the panel.
  useEffect(() => {
    const onHashChange = () => {
      const next = resolveHash(window.location.hash);
      setTabState(next ?? defaultRef.current);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [resolveHash]);

  return [tab, setTab];
}
