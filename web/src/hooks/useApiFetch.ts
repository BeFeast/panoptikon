"use client";

import useSWR, { type SWRConfiguration, type KeyedMutator } from "swr";

/**
 * SWR-based data fetching hook for API calls.
 *
 * Provides automatic caching across page navigations, polling via
 * `refreshInterval`, and a `mutate` handle for optimistic updates
 * and WebSocket-driven revalidation.
 *
 * @param key   Cache key (typically the API path + query params). Pass `null` to disable fetching.
 * @param fetcher  Async function that returns the data.
 * @param options  SWR config overrides (e.g. `refreshInterval`).
 */
export function useApiFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: SWRConfiguration<T>,
): {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  mutate: KeyedMutator<T>;
} {
  const { data, error, isLoading, mutate } = useSWR<T>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
      ...options,
    },
  );

  return {
    data: data ?? null,
    isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : String(error)
      : null,
    mutate,
  };
}
