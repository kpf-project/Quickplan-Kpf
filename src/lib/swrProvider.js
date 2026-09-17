'use client';

import { SWRConfig } from 'swr';

/**
 * Global SWR configuration provider
 * Optimizes data fetching with caching, deduplication, and revalidation
 */

// Default fetcher function for all SWR hooks
const fetcher = async (url) => {
    const response = await fetch(url);

    if (!response.ok) {
        const error = new Error('An error occurred while fetching the data.');
        error.info = await response.json().catch(() => ({}));
        error.status = response.status;
        throw error;
    }

    return response.json();
};

// Global SWR configuration optimized for performance
const swrConfig = {
    fetcher,

    // Deduplication: prevent duplicate requests within 5 seconds
    dedupingInterval: 5000,

    // Revalidation settings
    revalidateOnFocus: false,        // Don't revalidate when window regains focus
    revalidateOnReconnect: true,     // Revalidate when network reconnects
    revalidateIfStale: true,         // Revalidate if data is stale

    // Error retry configuration
    errorRetryCount: 3,              // Retry failed requests 3 times
    errorRetryInterval: 5000,        // Wait 5 seconds between retries

    // Keep previous data while revalidating
    keepPreviousData: true,

    // Performance optimization
    suspense: false,                 // Don't use React Suspense by default
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
