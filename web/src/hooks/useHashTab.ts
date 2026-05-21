"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Like useState, but syncs the active tab value with the URL hash.
 *
 * Behavior:
 *   - On mount, if the URL hash matches a valid value, that tab is selected.
 *     If the hash is non-empty but invalid, it is cleared (replaced) so the
 *     default tab is shown and the URL no longer carries a broken anchor.
 *   - Calling `setTab` pushes a new history entry so browser back/forward
 *     navigates between tab selections.
 *   - Browser back/forward fires `hashchange`, which re-reads the hash and
 *     updates state to match.
 */
export function useHashTab<T extends string>(
  defaultValue: T,
  validValues?: T[],
): [T, (value: string) => void] {
  const [tab, setTabState] = useState<T>(defaultValue);

  // Keep the latest validValues + default in refs so we don't re-subscribe
  // every render (the caller often passes a fresh array each render).
  const validRef = useRef<T[] | undefined>(validValues);
  validRef.current = validValues;
  const defaultRef = useRef<T>(defaultValue);
  defaultRef.current = defaultValue;

  const isValid = useCallback((candidate: string): candidate is T => {
    const list = validRef.current;
    if (!list) return candidate.length > 0;
    return list.includes(candidate as T);
  }, []);

  // Initial read of the hash, plus invalid-hash cleanup.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && isValid(hash)) {
      setTabState(hash as T);
    } else if (hash) {
      // Invalid hash → strip it without adding a history entry so the
      // default tab loads cleanly.
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      setTabState(defaultRef.current);
    }
  }, [isValid]);

  const setTab = useCallback(
    (value: string) => {
      const next = isValid(value) ? (value as T) : defaultRef.current;
      setTabState(next);
      const currentHash = window.location.hash.slice(1);
      if (currentHash === next) return;
      // pushState so browser back/forward steps through tab selections.
      window.history.pushState(null, "", `#${next}`);
    },
    [isValid],
  );

  // Listen for hash changes (browser back/forward).
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && isValid(hash)) {
        setTabState(hash as T);
      } else if (!hash) {
        setTabState(defaultRef.current);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [isValid]);

  return [tab, setTab];
}
