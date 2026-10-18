"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/clientFetch";

/**
 * Global SWR configuration provider
 * Optimizes data fetching with caching, deduplication, and revalidation
 */

// Global SWR configuration optimized for perceived zero-latency performance
const swrConfig = {
  fetcher,

  // Deduplication: prevent duplicate requests within 10 seconds across page navigations
  dedupingInterval: 10000,

  // Revalidation settings (stale-while-revalidate)
  revalidateOnFocus: false, // Don't revalidate when window regains focus
  revalidateOnReconnect: true, // Revalidate when network reconnects
  revalidateIfStale: true, // Serve cached data immediately, revalidate in background

  // Error retry configuration
  errorRetryCount: 2,
  errorRetryInterval: 5000,

  // Keep previous data while revalidating so UI never blanks out
  keepPreviousData: true,

  // Performance optimization
  suspense: false,
};

/**
 * SWR Provider component to wrap the application
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function SWRProvider({ children }) {
    return (
        <SWRConfig value={swrConfig}>
            {children}
        </SWRConfig>
    );
}

export default SWRProvider;
