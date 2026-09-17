"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/clientFetch";

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useDepartmentLookup27Page() {
  const pageSize = 100;
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearchText = useDebounce(searchText, 300);

  const handleSearchTextChange = (value) => {
    setSearchText(value);
    setPage(1);
  };

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", pageSize.toString());
    if (debouncedSearchText) {
      params.set("search", debouncedSearchText);
    }
    return `/api/department-lookup-27?${params.toString()}`;
  }, [debouncedSearchText, page, pageSize]);

  const { data, error, isLoading, mutate } = useSWR(apiUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const records = Array.isArray(data?.data) ? data.data : [];
  const pagination = data?.pagination ?? {
    page,
    pageSize,
    totalRecords: 0,
    totalPages: 1,
  };

  return {
    records,
    loading: isLoading,
    errorMessage: error?.message || "",
    pagination,
    searchText,
    setSearchText: handleSearchTextChange,
    reload: mutate,
    canGoPrevious: page > 1,
    canGoNext: page < (pagination?.totalPages ?? 1),
    goToPage: setPage,
  };
}
