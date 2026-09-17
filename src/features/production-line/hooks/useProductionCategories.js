/**
 * Custom SWR hook for production categories (lines)
 */
import useSWR from 'swr';

const fetcher = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }
    return response.json();
};

/**
 * Hook to fetch production categories/lines
 * @returns {Object} SWR response with line options
 */
export function useProductionCategories() {
    const { data, error, isLoading, mutate } = useSWR(
        '/api/production-categories',
        fetcher,
        {
            // Categories rarely change, cache aggressively
            revalidateOnMount: true,
            dedupingInterval: 60000, // 1 minute
            revalidateOnFocus: false,
        }
    );

    return {
        lineOptions: data?.data || [],
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook to fetch unique product categories
 * @returns {Object} SWR response with category options
 */
export function useUniqueCategories() {
    const { data, error, isLoading, mutate } = useSWR(
        '/api/production-unique-categories',
        fetcher,
        {
            // Categories rarely change, cache aggressively
            revalidateOnMount: true,
            dedupingInterval: 60000, // 1 minute
            revalidateOnFocus: false,
        }
    );

    return {
        categoryOptions: data?.data || [],
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

const productionCategoryHooks = {
    useProductionCategories,
    useUniqueCategories,
};

export default productionCategoryHooks;
