"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "kpf-route-state-v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function normalizePathname(pathname) {
  const raw = String(pathname || (typeof window !== "undefined" ? window.location?.pathname : "") || "/");
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function mergeWithDefault(defaultValue, storedValue) {
  if (
    defaultValue &&
    storedValue &&
    typeof defaultValue === "object" &&
    typeof storedValue === "object" &&
    !Array.isArray(defaultValue) &&
    !Array.isArray(storedValue)
  ) {
    return { ...defaultValue, ...storedValue };
  }
  return storedValue ?? defaultValue;
}

function readStoredState(storageKey, defaultValue) {
  if (!canUseStorage()) return defaultValue;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return defaultValue;
    return mergeWithDefault(defaultValue, JSON.parse(raw));
  } catch {
    return defaultValue;
  }
}

function writeStoredState(storageKey, value) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage quota/private-mode failures; the page still works without persistence.
  }
}

export function usePersistentRouteState(scope, defaultValue) {
  const pathname = usePathname();
  const stableDefaultValue = useMemo(() => defaultValue, [defaultValue]);
  const storageKey = useMemo(
    () => `${STORAGE_PREFIX}:${normalizePathname(pathname)}:${String(scope || "default")}`,
    [pathname, scope]
  );
  const [state, setState] = useState(() => readStoredState(storageKey, stableDefaultValue));

  useEffect(() => {
    setState(readStoredState(storageKey, stableDefaultValue));
  }, [stableDefaultValue, storageKey]);

  useEffect(() => {
    writeStoredState(storageKey, state);
  }, [state, storageKey]);

  const updateState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  return [state, updateState];
}
