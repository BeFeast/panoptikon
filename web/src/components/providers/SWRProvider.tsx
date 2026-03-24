"use client";

import { SWRConfig } from "swr";

/**
 * Global SWR configuration provider.
 *
 * Sets sensible defaults:
 * - revalidateOnFocus disabled (avoids flicker on tab switch)
 * - dedupingInterval keeps concurrent identical requests from firing
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 2000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
