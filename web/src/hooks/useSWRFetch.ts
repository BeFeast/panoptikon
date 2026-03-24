"use client";

import useSWR, { type SWRConfiguration, type KeyedMutator } from "swr";

interface UseSWRFetchOptions<T> extends SWRConfiguration<T> {
  /** Polling interval in milliseconds. Replaces manual setInterval. */
  refreshInterval?: number;
}

interface UseSWRFetchReturn<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
}

/**
 * SWR-based data fetching hook.
 *
 * Replaces the manual `useState` + `useEffect` + `setInterval` pattern
 * with SWR's built-in caching, deduplication, and automatic revalidation.
 *
 * @param key   Unique cache key (usually the API path). Pass `null` to skip fetching.
 * @param fetcher Function that returns a promise with the data.
 * @param options SWR config overrides (refreshInterval, etc.)
 *
 * @example
 * const { data: alerts, error, isLoading, mutate } = useSWRFetch(
 *   "/api/v1/alerts",
 *   () => fetchAlerts(100),
 *   { refreshInterval: 30_000 }
 * );
 */
export function useSWRFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: UseSWRFetchOptions<T>,
): UseSWRFetchReturn<T> {
  const { data, error, isLoading, mutate } = useSWR<T>(
    key,
    fetcher,
    options,
  );

  return {
    data,
    error: error ? (error instanceof Error ? error.message : "Failed to load") : null,
    isLoading,
    mutate,
  };
}
