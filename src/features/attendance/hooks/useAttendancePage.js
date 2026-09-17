import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAttendance } from "@/features/attendance/services/attendanceClient";

export function useAttendancePage() {
  const [badgenumber, setBadgenumber] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const hasLoadedInitial = useRef(false);

  const loadAttendance = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    setLoading(true);
    setErrorMessage("");
    try {
      const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMap[page];
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("pageSize", "20");
      if (badgenumber.trim()) {
        params.append("badgenumber", badgenumber.trim());
      }
      if (cursorValue) {
        params.append("cursor", cursorValue);
      }

      const result = await fetchAttendance(params);
      if (!result.ok) {
        throw new Error("Unable to load attendance data.");
      }

      const payload = result.data;
      setRecords(payload?.data ?? []);
      setPagination(payload?.pagination ?? { page: 1, totalPages: 1, totalRecords: 0 });
      setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
      const nextCursor = payload?.cursor?.next ?? null;
      setCursorMap((prev) => {
        const base = resetCursors ? { 1: null } : { ...prev };
        base[page] = cursorValue ?? null;
        base[page + 1] = nextCursor;
        return base;
      });
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [badgenumber, cursorMap]);

  useEffect(() => {
    if (hasLoadedInitial.current) {
      return;
    }
    loadAttendance(1, { cursor: null, resetCursors: true });
    hasLoadedInitial.current = true;
  }, [loadAttendance]);

  const handleSearch = () => {
    loadAttendance(1, { cursor: null, resetCursors: true });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  return {
    badgenumber,
    setBadgenumber,
    records,
    loading,
    errorMessage,
    pagination,
    loadAttendance,
    handleSearch,
    handleKeyDown,
    canGoNext,
  };
}
