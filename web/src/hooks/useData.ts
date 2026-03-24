"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { useRef } from "react";

// Instance counter for generating stable unique keys for legacy callers
let instanceCounter = 0;

/**
 * Generic data-fetching hook powered by SWR.
 *
 * Supports two call signatures:
 *
 * 1. Legacy (backward-compatible):
 *    `useData(fetcher)` — auto-generates a stable cache key.
 *
 * 2. Keyed (preferred for new code):
 *    `useData(key, fetcher, opts?)` — explicit cache key enables SWR
 *    deduplication, cross-component caching, and polling via refreshInterval.
 */
export function useData<T>(
  keyOrFetcher: string | null | (() => Promise<T>),
  fetcherOrOpts?: (() => Promise<T>) | SWRConfiguration<T>,
  maybeOpts?: SWRConfiguration<T>,
) {
  // Disambiguate overloaded signatures
  const isLegacy = typeof keyOrFetcher === "function";

  // For legacy callers, generate a stable unique key per hook instance
  const legacyKeyRef = useRef<string | null>(null);
  if (isLegacy && !legacyKeyRef.current) {
    legacyKeyRef.current = `__useData_${++instanceCounter}`;
  }

  const key = isLegacy ? legacyKeyRef.current : keyOrFetcher;
  const fetcher = isLegacy
    ? (keyOrFetcher as () => Promise<T>)
    : (fetcherOrOpts as () => Promise<T>);
  const opts: SWRConfiguration<T> = isLegacy
    ? ((fetcherOrOpts as SWRConfiguration<T> | undefined) ?? {})
    : (maybeOpts ?? {});

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    key,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      ...opts,
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    isValidating,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to load"
      : null,
    reload: async (): Promise<void> => { await mutate(); },
    mutate,
  };
}
