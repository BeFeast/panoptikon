"use client";

import useSWR from "swr";
import { useId } from "react";

/**
 * Generic data loader hook — fetches data and exposes loading/error state.
 *
 * Now backed by SWR for automatic caching, deduplication, and error retry.
 * The API is backwards-compatible with the previous useState/useEffect version.
 */
export function useData<T>(fetcher: () => Promise<T>) {
  const id = useId();
  const { data, error, isLoading, mutate } = useSWR<T>(id, fetcher);

  return {
    data: data ?? null,
    loading: isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to load"
      : null,
    reload: async () => {
      await mutate();
    },
  };
}
