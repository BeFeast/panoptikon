"use client";

import { SWRConfig } from "swr";

/**
 * App-wide SWR configuration.
 *
 * Wraps the app so every `useSWR` / `useData` call shares the same cache
 * and default settings (dedup, revalidation-on-focus, error retry).
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
