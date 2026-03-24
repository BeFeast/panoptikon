"use client";

import { SWRConfig } from "swr";

/**
 * Global SWR configuration provider.
 * Sets sensible defaults for caching, deduplication, and revalidation.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5_000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
