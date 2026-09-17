import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
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

export function useEmployeesPage() {
  const pageSize = 20;
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [departmentFilter, setDepartmentFilter] = useState("");

  const debouncedFilterText = useDebounce(filterText, 300);
  const { data: departmentPayload } = useSWR("/api/hr-departments", fetcher, {
    revalidateOnFocus: false,
  });

  const getKey = (pageIndex, previousPageData) => {
    // If we have previous data but no next cursor, we've reached the end.
    if (previousPageData && !previousPageData.cursor?.next) return null;

    const cursor = previousPageData?.cursor?.next;
    
    const params = new URLSearchParams({
      page: (pageIndex + 1).toString(),
      pageSize: pageSize.toString(),
      status: statusFilter,
    });
    
    if (debouncedFilterText) params.set("search", debouncedFilterText);
    if (departmentFilter) params.set("department", departmentFilter);
    if (cursor) params.set("cursor", cursor);

    return `/api/employees?${params.toString()}`;
  };

  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: false,
    persistSize: true,
  });

  const currentPageData = data ? data[size - 1] : null;

  const employees = useMemo(() => {
    return currentPageData?.data ?? [];
  }, [currentPageData]);

  const pagination = useMemo(() => ({
    page: size,
    pageSize,
    totalRecords: 0,
    totalPages: 1,
    ...(currentPageData?.pagination ?? {}),
  }), [currentPageData, pageSize, size]);

  const canGoNext = size < pagination.totalPages;
  const canGoBack = size > 1;

  const loadEmployees = (targetPage) => {
    if (targetPage === 0) {
      mutate();
      return;
    }
    if (targetPage > 0 && targetPage <= pagination.totalPages) {
      setSize(targetPage);
    }
  };
  
  // Reset pagination when filters change
  useEffect(() => {
    setSize(1);
  }, [debouncedFilterText, statusFilter, departmentFilter, setSize]);

  const departments = useMemo(
    () => (Array.isArray(departmentPayload?.departments) ? departmentPayload.departments : []),
    [departmentPayload]
  );

  const supabaseReady =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return {
    pageSize,
    employees,
    filterText,
    setFilterText,
    statusFilter,
    setStatusFilter,
    departmentFilter,
    setDepartmentFilter,
    departments,
    pagination,
    loading: isLoading || isValidating,
    errorMessage: error?.message || "",
    supabaseReady,
    loadEmployees,
    canGoNext,
    canGoBack,
  };
}
