/**
 * Custom SWR hook for fetching products with BOM data
 * Optimized with caching and deduplication
 */
import useSWR from 'swr';

const fetcher = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch products');
    }
    return response.json();
};

/**
 * Hook to fetch products with optional filters
 * @param {Object} filters - Filter parameters
 * @param {string} filters.categoryFilter - Category filter
 * @param {string} filters.lineFilter - Production line filter
 * @param {string} filters.statusFilter - Status filter
 * @param {string} filters.searchTerm - Search term
 * @param {Array<string>} filters.allowedCategoryCodes - Allowed category codes
 * @returns {Object} SWR response with products data
 */
export function useProducts(filters = {}) {
    const {
        categoryFilter = 'all',
        lineFilter = 'all',
        statusFilter = 'all',
        searchTerm = '',
        allowedCategoryCodes = [],
    } = filters;

    // Build query params
    const params = new URLSearchParams();

    const categories =
        categoryFilter === 'all'
            ? allowedCategoryCodes
            : [categoryFilter];

    if (categories.length > 0) {
        params.set('iccatCodes', categories.join(','));
    }

    if (searchTerm.trim()) {
        params.set('search', searchTerm.trim());
    }

    if (lineFilter !== 'all') {
        params.set('categoryId', lineFilter);
    }

    if (statusFilter !== 'all') {
        params.set('status', statusFilter);
    }

    const url = `/api/production-bom-products?${params.toString()}`;

    const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
        // Revalidate every 5 minutes for product data
        revalidateOnMount: true,
        dedupingInterval: 5000,
        // Keep previous data while fetching new data
        keepPreviousData: true,
    });

    const products = data?.data || [];

    return {
        products,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook to fetch materials/raw materials
 * @param {Array<string>} categoryOptions - Material category codes
 * @returns {Object} SWR response with materials data
 */
export function useMaterials(categoryOptions = []) {
    const params = new URLSearchParams();

    if (categoryOptions.length > 0) {
        params.set('iccatCodes', categoryOptions.join(','));
    }

    const url = `/api/production-bom-products?${params.toString()}`;

    const { data, error, isLoading, mutate } = useSWR(
        categoryOptions.length > 0 ? url : null,
        fetcher,
        {
            // Materials don't change often, cache for longer
            revalidateOnMount: true,
            dedupingInterval: 10000,
            // Don't revalidate on focus for materials
            revalidateOnFocus: false,
        }
    );

    const materials = data?.data || [];

    return {
        materials,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook to fetch BOM details for a specific product
 * @param {string} skuCode - Product SKU code
 * @param {Object} options - Additional options
 * @returns {Object} SWR response with BOM data
 */
export function useBomDetails(skuCode, options = {}) {
    const url = skuCode ? `/api/production-boms/${encodeURIComponent(skuCode)}` : null;

    const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
        // BOM data should be fresh
        revalidateOnMount: true,
        dedupingInterval: 3000,
        revalidateOnFocus: true,
        ...options,
    });

    return {
        bomData: data || {},
        items: data?.items || [],
        versions: data?.versions || [],
        bom: data?.bom || {},
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

const bomDataHooks = {
    useProducts,
    useMaterials,
    useBomDetails,
};

export default bomDataHooks;
