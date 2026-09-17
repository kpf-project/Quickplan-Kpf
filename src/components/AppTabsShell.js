"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { resolveNavigationTitle } from "@/components/appNavigation";

const STORAGE_KEY = "kpf-open-tabs-v1";
const CHANGE_EVENT = "kpf-open-tabs-change";
const MAX_TABS = 12;
const EMPTY_TABS = [];
const TAB_GROUPS = Object.freeze([
  {
    key: "hr-consolidated",
    canonicalHref: "/hr/consolidated",
    matchPrefixes: ["/hr/consolidated"],
  },
  {
    key: "production-line-attendance",
    canonicalHref: "/production-line/attendance",
    matchPrefixes: ["/production-line/attendance"],
  },
  {
    key: "production-line-weight-scale-live",
    canonicalHref: "/production-line/weight-scale-live",
    matchPrefixes: ["/production-line/weight-scale-live"],
  },
  {
    key: "production-line-weight-scale",
    canonicalHref: "/production-line/weight-scale",
    matchPrefixes: ["/production-line/weight-scale"],
  },
  {
    key: "production-line-stock",
    canonicalHref: "/production-line/stock",
    matchPrefixes: ["/production-line/stock"],
  },
  {
    key: "production-line-bom",
    canonicalHref: "/production-line/bom",
    matchPrefixes: ["/production-line/bom"],
  },
  {
    key: "production-line-planning",
    canonicalHref: "/production-line/planning/schedule",
    matchPrefixes: ["/production-line/planning"],
  },
  {
    key: "production-line-settings",
    canonicalHref: "/production-line/settings",
    matchPrefixes: ["/production-line/settings"],
  },
  {
    key: "raw-materials",
    canonicalHref: "/raw-materials",
    matchPrefixes: ["/raw-materials"],
  },
  {
    key: "raw-material-receipts",
    canonicalHref: "/raw-material-receipts",
    matchPrefixes: ["/raw-material-receipts"],
  },
  {
    key: "raw-material-requisitions",
    canonicalHref: "/raw-material-requisitions",
    matchPrefixes: ["/raw-material-requisitions"],
  },
  {
    key: "stock-inventory",
    canonicalHref: "/stock-inventory",
    matchPrefixes: ["/stock-inventory"],
  },
  {
    key: "admin-products",
    canonicalHref: "/admin/products",
    matchPrefixes: ["/admin/products"],
  },
  {
    key: "admin-suppliers",
    canonicalHref: "/admin/suppliers",
    matchPrefixes: ["/admin/suppliers"],
  },
  {
    key: "admin-settings",
    canonicalHref: "/admin/settings",
    matchPrefixes: ["/admin/settings"],
  },
]);
let cachedTabsRaw = null;
let cachedTabsSnapshot = EMPTY_TABS;

function TabLogoIcon({ active }) {
  return (
    <span
      className={`relative inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center overflow-hidden transition-opacity ${
        active ? "opacity-100" : "opacity-80 group-hover:opacity-100"
      }`}
      aria-hidden="true"
    >
      <Image
        src="/brand/logo-rkt.png"
        alt=""
        fill
        sizes="16px"
        className="scale-[1.28] object-cover object-[68%_82%]"
        draggable={false}
      />
    </span>
  );
}

function isSafeInternalHref(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function normalizePathname(pathname) {
  if (!isSafeInternalHref(pathname)) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function resolveTitle(pathname) {
  const normalized = normalizePathname(pathname);
  return resolveNavigationTitle(normalized);
}

function resolveTabGroup(pathname) {
  const normalized = normalizePathname(pathname);
  return TAB_GROUPS.find((group) =>
    group.matchPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
  ) || null;
}

function resolveTabIdentity(pathname) {
  const normalized = normalizePathname(pathname);
  const group = resolveTabGroup(normalized);

  if (!group) {
    return {
      key: normalized,
      href: normalized,
      title: resolveTitle(normalized),
    };
  }

  return {
    key: group.key,
    href: normalized,
    title: resolveTitle(group.canonicalHref),
  };
}

function readStoredTabs() {
  if (typeof window === "undefined") return EMPTY_TABS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedTabsRaw) return cachedTabsSnapshot;
    const parsed = raw ? JSON.parse(raw) : [];
    cachedTabsRaw = raw;
    if (!Array.isArray(parsed)) {
      cachedTabsSnapshot = EMPTY_TABS;
      return EMPTY_TABS;
    }

    const dedupedTabs = [];
    const dedupedIndexByKey = new Map();

    parsed
      .filter((tab) => isSafeInternalHref(tab?.href) && typeof tab?.title === "string")
      .forEach((tab) => {
        const identity = resolveTabIdentity(tab.href);
        const normalizedTab = {
          key: identity.key,
          href: identity.href,
          title: identity.title,
        };

        if (dedupedIndexByKey.has(identity.key)) {
          dedupedTabs[dedupedIndexByKey.get(identity.key)] = normalizedTab;
          return;
        }

        dedupedIndexByKey.set(identity.key, dedupedTabs.length);
        dedupedTabs.push(normalizedTab);
      });

    cachedTabsSnapshot = dedupedTabs.slice(0, MAX_TABS);
    return cachedTabsSnapshot;
  } catch {
    cachedTabsRaw = null;
    cachedTabsSnapshot = EMPTY_TABS;
    return EMPTY_TABS;
  }
}

function writeStoredTabs(tabs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.slice(0, MAX_TABS)));
  } catch {
    // Storage can be unavailable in private modes; tabs still work for this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeTabs(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function upsertTab(href) {
  const identity = resolveTabIdentity(href);
  const currentHref = identity.href;
  if (!isSafeInternalHref(currentHref)) return;
  const currentTabs = readStoredTabs();
  const existingIndex = currentTabs.findIndex((tab) => {
    const tabKey = typeof tab?.key === "string" ? tab.key : resolveTabIdentity(tab.href).key;
    return tabKey === identity.key;
  });
  if (existingIndex >= 0) {
    const next = currentTabs.map((tab, index) =>
      index === existingIndex
        ? { ...tab, key: identity.key, href: currentHref, title: identity.title }
        : tab
    );
    writeStoredTabs(next);
    return;
  }

  const next = [
    ...currentTabs,
    {
      key: identity.key,
      href: currentHref,
      title: identity.title,
    },
  ].slice(-MAX_TABS);
  writeStoredTabs(next);
}

function removeTab(href) {
  const identity = resolveTabIdentity(href);
  const currentTabs = readStoredTabs();
  const closeIndex = currentTabs.findIndex((tab) => tab.key === identity.key);
  const next = currentTabs.filter((tab) => tab.key !== identity.key);
  writeStoredTabs(next);
  return { closeIndex, next };
}

export default function AppTabsShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHref = normalizePathname(pathname);
  const currentIdentity = useMemo(() => resolveTabIdentity(currentHref), [currentHref]);
  const tabs = useSyncExternalStore(subscribeTabs, readStoredTabs, () => EMPTY_TABS);

  useEffect(() => {
    upsertTab(currentHref);
  }, [currentHref]);

  const activeIndex = useMemo(
    () => tabs.findIndex((tab) => {
      const tabKey = typeof tab?.key === "string" ? tab.key : resolveTabIdentity(tab.href).key;
      return tabKey === currentIdentity.key;
    }),
    [currentIdentity.key, tabs]
  );

  const closeTab = useCallback((event, href) => {
    event.preventDefault();
    event.stopPropagation();

    const { closeIndex, next } = removeTab(href);
    if (href === currentHref) {
      const fallback = next[Math.max(0, closeIndex - 1)] || next[0] || null;
      if (fallback) {
        startTransition(() => {
          router.push(fallback.href);
        });
      }
    }
  }, [currentHref, router]);

  const visibleTabs = tabs.length
    ? tabs
    : [{ key: currentIdentity.key, href: currentHref, title: currentIdentity.title }];

  return (
    <div className="app-tabs-shell flex min-h-screen flex-col bg-[#f8f9fa]">
      <div className="app-tabs-bar hidden md:block sticky top-0 z-[120] border-b border-[#d4af37]/25 bg-[#071a35] px-2 pt-2 shadow-[0_1px_0_rgba(212,175,55,0.22)] md:px-3">
        <div className="flex min-h-10 items-end gap-1 overflow-x-auto overflow-y-hidden">
          {visibleTabs.map((tab, index) => {
            const tabKey = typeof tab?.key === "string" ? tab.key : resolveTabIdentity(tab.href).key;
            const active = tabKey === currentIdentity.key || (!tabs.length && index === activeIndex);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                prefetch
                className={`group flex h-9 min-w-[132px] max-w-[240px] shrink-0 items-center gap-2 rounded-t-[2px] border px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "border-[#d4af37]/55 bg-[#f8f9fa] text-[#102C57]"
                    : "border-white/10 bg-[#102C57] text-white/70 hover:border-[#d4af37]/40 hover:text-white"
                }`}
                title={tab.title}
              >
                <TabLogoIcon active={active} />
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                {visibleTabs.length > 1 ? (
                  <button
                    type="button"
                    onClick={(event) => closeTab(event, tab.href)}
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] transition-colors ${
                      active
                        ? "text-[#102C57]/65 hover:bg-[#102C57]/10 hover:text-[#102C57]"
                        : "text-white/45 hover:bg-white/10 hover:text-white"
                    }`}
                    aria-label={`Close ${tab.title}`}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="app-tabs-content min-h-0 flex-1">{children}</div>
    </div>
  );
}
