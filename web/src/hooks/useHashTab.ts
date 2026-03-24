"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Like useState, but syncs the active tab value with the URL hash.
 * Opening /page#tab-name activates that tab; clicking a tab updates the hash.
 */
export function useHashTab<T extends string>(
  defaultValue: T,
  validValues?: T[],
): [T, (value: string) => void] {
  const [tab, setTabState] = useState<T>(defaultValue);

  // On mount, read hash from URL
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && (!validValues || validValues.includes(hash as T))) {
      setTabState(hash as T);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback((value: string) => {
    setTabState(value as T);
    window.history.replaceState(null, "", `#${value}`);
  }, []);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && (!validValues || validValues.includes(hash as T))) {
        setTabState(hash as T);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [validValues]);

  return [tab, setTab];
}
