import { useState, useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/clientFetch";

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function useSuppliersPage() {
  const [searchText, setSearchText] = useState("");
  const pageSize = 100;

  const debouncedSearchText = useDebounce(searchText, 300);

  const getKey = (pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.cursor?.next) return null;

    const cursor = previousPageData?.cursor?.next;
    
    const params = new URLSearchParams();
    params.set("page", (pageIndex + 1).toString());
    params.set("pageSize", pageSize.toString());
    if (debouncedSearchText) {
      params.set("search", debouncedSearchText);
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    return `/api/suppliers?${params.toString()}`;
  };

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: false,
  });

  const currentPageData = data ? data[size - 1] : null;
  const records = currentPageData?.data ?? [];
  const pagination = currentPageData?.pagination ?? {
    page: size,
    pageSize,
    totalRecords: 0,
    totalPages: 1,
  };

  const cursorInfo = currentPageData?.cursor ?? { next: null, hasMore: false };
  const canGoNext = cursorInfo.hasMore && Boolean(cursorInfo.next);

  const loadData = (targetPage) => {
    if (targetPage > size) {
      setSize(targetPage);
    } else if (targetPage < size) {
      setSize(targetPage);
    } else {
      mutate();
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setSize(1);
  }, [debouncedSearchText, setSize]);

  return {
    records,
    loading: isLoading,
    errorMessage: error?.message || "",
    pagination: { ...pagination, page: size },
    cursorMap: {}, // No longer needed, keeping for potential API compat if UI uses it (it doesn't seem to)
    searchText,
    setSearchText,
    loadData,
    canGoNext,
  };
}
