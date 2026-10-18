"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation.js";
import { resolveNavigationTitle } from "../components/appNavigation.js";

export const STORAGE_KEY = "kpf-open-tabs-v1";
export const CHANGE_EVENT = "kpf-open-tabs-change";
export const MAX_TABS = 20;
export const EMPTY_TABS = [];

const SCROLL_PREFIX = "kpf-tab-scroll:";
const STATE_PREFIX = "kpf-tab-state:";
const UNSAVED_CHANGE_EVENT = "kpf-tab-unsaved-change";

let cachedTabsRaw = null;
let cachedTabsSnapshot = EMPTY_TABS;

// In-memory map of unsaved dirty state keyed by pathname
const dirtyTabRegistry = new Map();

/**
 * Checks if a string is a safe internal relative path
 */
export function isSafeInternalHref(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/**
 * Normalizes internal pathname
 */
export function normalizePathname(pathname) {
  if (!isSafeInternalHref(pathname)) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Resolves tab identity for 1 Tab per 1 Page
 */
export function resolveTabIdentity(rawHref) {
  const [cleanPath, queryString] = String(rawHref || "/").split("?");
  const normalized = normalizePathname(cleanPath);
  const href = queryString ? `${normalized}?${queryString}` : normalized;
  return {
    key: normalized,
    href,
    title: resolveNavigationTitle(normalized),
  };
}

/**
 * Reads stored tabs from localStorage
 */
export function readStoredTabs() {
  if (typeof window === "undefined") return EMPTY_TABS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw === cachedTabsRaw) return cachedTabsSnapshot;
    const parsed = raw ? JSON.parse(raw) : [];
    cachedTabsRaw = raw;
    if (!Array.isArray(parsed)) {
      cachedTabsSnapshot = EMPTY_TABS;
      return EMPTY_TABS;
    }

    const dedupedTabs = [];
    const seenKeys = new Set();

    parsed
      .filter((tab) => isSafeInternalHref(tab?.href))
      .forEach((tab) => {
        const identity = resolveTabIdentity(tab.href);
        if (seenKeys.has(identity.key)) return;
        seenKeys.add(identity.key);
        dedupedTabs.push(identity);
      });

    cachedTabsSnapshot = dedupedTabs.slice(-MAX_TABS);
    return cachedTabsSnapshot;
  } catch {
    cachedTabsRaw = null;
    cachedTabsSnapshot = EMPTY_TABS;
    return EMPTY_TABS;
  }
}

/**
 * Writes tabs to localStorage and dispatches change event
 */
export function writeStoredTabs(tabs) {
  if (typeof window === "undefined") return;
  const sliced = tabs.slice(-MAX_TABS);
  const raw = JSON.stringify(sliced);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedTabsRaw = raw;
    cachedTabsSnapshot = sliced;
  } catch {
    // Storage can be unavailable in private modes
  }
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/**
 * Subscribes to stored tabs changes
 */
export function subscribeTabs(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Adds or updates a tab
 */
export function upsertTab(href) {
  if (!isSafeInternalHref(href)) return;
  const identity = resolveTabIdentity(href);
  const currentTabs = readStoredTabs();
  const existingIndex = currentTabs.findIndex((tab) => tab.key === identity.key);

  if (existingIndex >= 0) {
    const next = currentTabs.map((tab, index) =>
      index === existingIndex
        ? { ...tab, key: identity.key, href: identity.href, title: identity.title }
        : tab
    );
    writeStoredTabs(next);
    return;
  }

  const next = [...currentTabs, identity].slice(-MAX_TABS);
  writeStoredTabs(next);
}

/**
 * Removes a tab by href
 */
export function removeTab(href) {
  if (!isSafeInternalHref(href)) return { closeIndex: -1, next: readStoredTabs() };
  const identity = resolveTabIdentity(href);
  const currentTabs = readStoredTabs();
  const closeIndex = currentTabs.findIndex((tab) => tab.key === identity.key);
  const next = currentTabs.filter((tab) => tab.key !== identity.key);
  writeStoredTabs(next);
  return { closeIndex, next };
}

/**
 * Closes all other tabs except keepHref
 */
export function closeOtherTabs(keepHref) {
  if (!isSafeInternalHref(keepHref)) return;
  const identity = resolveTabIdentity(keepHref);
  const currentTabs = readStoredTabs();
  const next = currentTabs.filter((tab) => tab.key === identity.key);
  if (!next.length) {
    next.push(identity);
  }
  writeStoredTabs(next);
}

/**
 * Save scroll position for a specific tab pathname in sessionStorage
 */
export function saveTabScroll(pathname, scrollY) {
  if (typeof window === "undefined" || !pathname) return;
  const key = `${SCROLL_PREFIX}${normalizePathname(pathname)}`;
  try {
    sessionStorage.setItem(key, String(Math.round(scrollY)));
  } catch {
    // sessionStorage might fail in private browsing mode or storage quotas
  }
}

/**
 * Retrieve saved scroll position for a tab pathname
 */
export function getTabScroll(pathname) {
  if (typeof window === "undefined" || !pathname) return 0;
  const key = `${SCROLL_PREFIX}${normalizePathname(pathname)}`;
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Restores scroll position for a tab pathname with retry for async content loading
 */
export function restoreTabScroll(pathname) {
  if (typeof window === "undefined" || !pathname) return;
  const targetY = getTabScroll(pathname);
  if (targetY <= 0) return;

  // Immediate scroll
  window.scrollTo({ top: targetY, behavior: "instant" });

  // Secondary RAF scroll in case layout expands after initial render
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: "instant" });
    });
  }
}

/**
 * Sets dirty / unsaved state for a tab pathname
 */
export function setTabUnsaved(pathname, isDirty, message = "") {
  const normalized = normalizePathname(pathname);
  if (isDirty) {
    dirtyTabRegistry.set(normalized, {
      isDirty: true,
      message: message || "คุณมีข้อมูลที่ยังไม่ได้บันทึกในแท็บนี้ ต้องการปิดแท็บหรือไม่?",
    });
  } else {
    dirtyTabRegistry.delete(normalized);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UNSAVED_CHANGE_EVENT, {
        detail: {
          pathname: normalized,
          isDirty: Boolean(isDirty),
          message: isDirty ? dirtyTabRegistry.get(normalized)?.message : "",
        },
      })
    );
  }
}

/**
 * Checks if a tab has unsaved changes
 */
export function isTabUnsaved(pathname) {
  const normalized = normalizePathname(pathname);
  return dirtyTabRegistry.has(normalized);
}

/**
 * Gets the warning message for an unsaved tab
 */
export function getTabUnsavedMessage(pathname) {
  const normalized = normalizePathname(pathname);
  return dirtyTabRegistry.get(normalized)?.message || "คุณมีข้อมูลที่ยังไม่ได้บันทึกในแท็บนี้ ต้องการปิดแท็บหรือไม่?";
}

/**
 * Subscribes to unsaved tab changes
 */
export function subscribeUnsavedChanges(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UNSAVED_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener(UNSAVED_CHANGE_EVENT, callback);
  };
}

/**
 * Hook for pages/components to guard unsaved changes:
 * - Marks the current tab as unsaved in the tab bar
 * - Warns on window beforeunload
 * - Automatically cleans up on unmount or when isDirty becomes false
 */
export function useUnsavedChanges(isDirty, message = "คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?") {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) {
      setTabUnsaved(pathname, Boolean(isDirty), message);
    }
    return () => {
      if (pathname) {
        setTabUnsaved(pathname, false);
      }
    };
  }, [pathname, isDirty, message]);

  useEffect(() => {
    if (!isDirty || typeof window === "undefined") return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, message]);
}

/**
 * Hook for isolating and persisting component state per tab in sessionStorage
 * as specified in docs/tab-wbapp.md
 */
export function useTabState(tabId, initialState) {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined" || !tabId) return initialState;
    try {
      const saved = sessionStorage.getItem(`${STATE_PREFIX}${tabId}`);
      return saved ? JSON.parse(saved) : initialState;
    } catch {
      return initialState;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || !tabId) return;
    try {
      sessionStorage.setItem(`${STATE_PREFIX}${tabId}`, JSON.stringify(state));
    } catch {
      // Storage quota or disabled storage
    }
  }, [tabId, state]);

  const resetState = useCallback(() => {
    setState(initialState);
    if (typeof window !== "undefined" && tabId) {
      try {
        sessionStorage.removeItem(`${STATE_PREFIX}${tabId}`);
      } catch {}
    }
  }, [tabId, initialState]);

  return [state, setState, resetState];
}
