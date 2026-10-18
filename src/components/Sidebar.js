"use client";

import { useCallback, useMemo, useState, useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart2,
  Boxes,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Database,
  Fingerprint,
  Gauge,
  Layers,
  LogOut,
  MoreVertical,
  Package,
  ScanFace,
  Settings,
  Truck,
  Warehouse,
} from "lucide-react";
import {
  buildNavItems as buildSharedNavItems,
  GROUP_PERMISSION_KEYS as SHARED_GROUP_PERMISSION_KEYS,
} from "@/components/appNavigation";
import { usePermissions } from "@/lib/usePermissions";
import { useUserProfile } from "@/lib/useUserProfile";

const buildNavItems = (requisitionHref) => [
  {
    key: "hr",
    label: "HR",
    icon: Fingerprint,
    children: [
      {
        href: "/hr/consolidated",
        label: "รายงานสแกนนิ้ว",
        icon: Fingerprint,
        permissionsAny: ["admin-consolidated"],
      },
      {
        href: "/admin/employees",
        label: "ทะเบียนพนักงาน",
        icon: Fingerprint,
        permissionsAny: ["admin-employees"],
      },
    ],
  },
  {
    key: "production_line",
    label: "ไลน์ผลิต",
    icon: Boxes,
    children: [
      {
        href: "/production-line/attendance",
        label: "บันทึกงานไลน์ผลิต",
        icon: ScanFace,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/attendance/piece-rate-scan",
        label: "บันทึกเนื้อขนมป้ายแยม",
        icon: ScanFace,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/weight-scale",
        label: "ชั่งน้ำหนักผลิตภัณฑ์",
        icon: Gauge,
        iconPath: "/icons/scale.png",
        sidebarIconMaskScale: 1.3,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/weight-scale-live",
        label: "ชั่งน้ำหนักจากเครื่องชั่ง",
        icon: Activity,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/stock",
        label: "นำเข้าสต็อกตั้งต้น",
        icon: Database,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/bom",
        label: "BOM ไลน์การผลิต",
        icon: Layers,
        permissionsAny: ["production-line-bom-view", "production-line-bom-manage"],
      },
      {
        href: "/production-line/planning/schedule",
        label: "วางแผนการผลิต",
        icon: Calendar,
        permissionsAny: ["production-line-planning-view", "production-line-planning-manage"],
      },


      {
        href: "/production-line/settings",
        label: "ตั้งค่า",
        icon: Settings,
        permissionsAny: [
          "production-line-settings-view",
          "production-line-settings-manage",
        ],
      },
    ],
  },
  {
    key: "raw_materials",
    label: "คลังวัตถุดิบ",
    icon: Warehouse,
    children: [
      {
        href: "/raw-materials",
        label: "สต็อกคลังวัตถุดิบ",
        icon: Package,
        permissionsAny: ["raw-materials-summary", "raw-materials-lot"],
      },
      {
        href: requisitionHref,
        label: "ใบเบิกวัตถุดิบ",
        icon: ClipboardList,
        permissionsAny: ["admin-requisition", "admin-returns"],
      },
      {
        href: "/raw-material-requisitions/export",
        label: "export ใบเบิก",
        icon: ClipboardList,
        permissionsAny: [
          "admin-requisition",
          "production-line-planning-view",
          "production-line-planning-manage",
          "plan.view_claim_all",
          "plan.claim_material",
          "plan.consolidate_cross_qa",
        ],
      },
    ],
  },
  {
    key: "data_admin",
    label: "Data",
    icon: Database,
    children: [
      {
        href: "/stock-inventory",
        label: "สต็อกวัตถุดิบ",
        icon: Package,
        permissionsAny: ["stock-inventory"],
      },
      {
        href: "/admin/products",
        label: "สินค้า",
        icon: Boxes,
        permissionsAny: ["admin-products"],
      },
      {
        href: "/admin/products/trade-codes",
        label: "รหัสซื้อขาย",
        icon: Boxes,
        permissionsAny: ["admin-products"],
      },
      {
        href: "/admin/sku-min-max",
        label: "Min-Max",
        icon: BarChart2,
        permissionsAny: ["admin-sku-min-max"],
      },
      {
        href: "/admin/performance",
        label: "Performance",
        icon: Activity,
        permissionsAny: ["admin-settings"],
        adminOnly: true,
      },
      {
        href: "/admin/suppliers",
        label: "ซัพพลายเออร์",
        icon: Truck,
        permissionsAny: ["admin-suppliers"],
      },
      {
        href: "/admin/department-lookup-27",
        label: "แผนก Lookup 27",
        icon: Database,
        permissionsAny: ["admin-products", "admin-settings"],
      },
    ],
  },
  {
    href: "/admin/settings",
    label: "ตั้งค่าระบบ",
    icon: Settings,
    permissionsAny: ["admin-settings"],
    adminOnly: true,
  },
];

const GROUP_PERMISSION_KEYS = {
  hr: ["admin-consolidated", "admin-employees"],
  production_line: [
    "production-line-attendance",
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-bom-view",
    "production-line-bom-manage",
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.claim_material",
    "plan.release_claim",
    "plan.reassign_claim",
    "plan.view_claim_all",
    "plan.verify_materials",
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  raw_materials: [
    "raw-materials-summary",
    "raw-materials-lot",
    "raw-materials-movement",
    "admin-requisition",
    "admin-returns",
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_claim_all",
    "plan.claim_material",
    "plan.consolidate_cross_qa",
  ],
  data_admin: [
    "stock-inventory",
    "admin-products",
    "admin-sku-min-max",
    "admin-suppliers",
    "admin-settings",
  ],
};

void buildNavItems;
void GROUP_PERMISSION_KEYS;

function SidebarIcon({ item, size = 20, className = "" }) {
  if (item?.iconPath) {
    const maskScale = item.sidebarIconMaskScale || item.iconMaskScale || 1;
    const maskSize = `${maskScale * 100}%`;

    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 bg-current ${className}`}
        style={{
          width: size,
          height: size,
          WebkitMask: `url("${item.iconPath}") center / ${maskSize} no-repeat`,
          mask: `url("${item.iconPath}") center / ${maskSize} no-repeat`,
        }}
      />
    );
  }

  const Icon = item?.icon || Package;
  return <Icon size={size} className={className} />;
}

function shouldPrefetchNavigationRoute(href) {
  const normalizedHref = String(href || "");
  if (!normalizedHref) {
    return false;
  }

  return !(
    normalizedHref.includes("/report")
    || normalizedHref.includes("/balance/")
  );
}

const emptySubscribe = () => () => {};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isEmbedded = useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== "undefined" && (window.self !== window.top || window.location.search.includes("reportCenter=1")),
    () => false
  );

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [mobileExpandedKey, setMobileExpandedKey] = useState(null);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({
    data_admin: true,
    raw_materials: true,
  });
  const permissionState = usePermissions();
  const profile = useUserProfile();

  const permissionSet = useMemo(
    () => new Set(permissionState.permissions),
    [permissionState.permissions]
  );

  const hasPermission = useCallback(
    (required = []) => {
      if (!permissionState.loaded) {
        return false;
      }
      if (permissionState.isAdmin) {
        return true;
      }
      if (!Array.isArray(required) || required.length === 0) {
        return false;
      }
      return required.some((perm) => permissionSet.has(perm));
    },
    [permissionSet, permissionState.isAdmin, permissionState.loaded]
  );

  const requisitionHref = hasPermission(["admin-requisition"])
    ? "/raw-material-requisitions/requisition"
    : "/raw-material-requisitions/return";

  const navItems = useMemo(() => buildSharedNavItems(requisitionHref), [requisitionHref]);

  const visibleNavItems = useMemo(() => {
    if (!permissionState.loaded) {
      return [];
    }
    return navItems.reduce((acc, item) => {
      if (item.children) {
        const groupPermissions = SHARED_GROUP_PERMISSION_KEYS[item.key]
          || item.permissionsAny
          || item.children.flatMap((child) => child.permissionsAny || []);
        if (!hasPermission(groupPermissions)) {
          return acc;
        }
        const children = item.children.filter((child) =>
          (!child.adminOnly || permissionState.isAdmin) &&
          hasPermission(child.permissionsAny)
        );
        if (children.length > 0 && (!item.adminOnly || permissionState.isAdmin)) {
          acc.push({ ...item, children });
        }
        return acc;
      }
      if ((!item.adminOnly || permissionState.isAdmin) && hasPermission(item.permissionsAny)) {
        acc.push(item);
      }
      return acc;
    }, []);
  }, [hasPermission, navItems, permissionState.isAdmin, permissionState.loaded]);

  const isActiveLink = useCallback(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  );

  const isActiveExact = useCallback(
    (href) => pathname === href,
    [pathname]
  );

  const toggleGroup = (key) => {
    if (!isSidebarExpanded) {
      setIsSidebarExpanded(true);
    }
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    visibleNavItems.forEach((item) => {
      if (item.children && item.children.some((child) => isActiveLink(child.href))) {
        setExpandedGroups((prev) => ({ ...prev, [item.key]: true }));
      }
    });
  }, [isActiveLink, visibleNavItems]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    router.push("/login");
  }, [router]);
  const requestLogout = useCallback(() => {
    setMobileAccountMenuOpen(false);
    setShowLogoutConfirm(true);
  }, []);
  const closeLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(false);
  }, []);
  const confirmLogout = useCallback(async () => {
    setShowLogoutConfirm(false);
    await handleLogout();
  }, [handleLogout]);

  const mobileNavItems = useMemo(() => visibleNavItems, [visibleNavItems]);
  const mobileExpandedGroup = useMemo(
    () => mobileNavItems.find((item) => item.key === mobileExpandedKey),
    [mobileExpandedKey, mobileNavItems]
  );
  const mobileVisibleChildren = useMemo(
    () => mobileExpandedGroup?.children || [],
    [mobileExpandedGroup]
  );
  const prefetchHrefs = useMemo(() => {
    const hrefSet = new Set();
    visibleNavItems.forEach((item) => {
      if (item?.href && shouldPrefetchNavigationRoute(item.href)) {
        hrefSet.add(item.href);
      }
      if (Array.isArray(item?.children)) {
        item.children.forEach((child) => {
          if (child?.href && shouldPrefetchNavigationRoute(child.href)) {
            hrefSet.add(child.href);
          }
        });
      }
    });
    return Array.from(hrefSet);
  }, [visibleNavItems]);
  const prefetchRoute = useCallback((href) => {
    if (!shouldPrefetchNavigationRoute(href)) return;
    router.prefetch(href);
  }, [router]);
  const mobileSettingsHref = useMemo(() => {
    const direct = visibleNavItems.find((item) => item?.href && item.href.includes("/settings"));
    if (direct?.href) return direct.href;
    for (const item of visibleNavItems) {
      if (!Array.isArray(item?.children)) continue;
      const child = item.children.find((entry) => entry?.href && entry.href.includes("/settings"));
      if (child?.href) return child.href;
    }
    return null;
  }, [visibleNavItems]);

  useEffect(() => {
    if (!prefetchHrefs.length) return;

    const runPrefetch = () => {
      prefetchHrefs.forEach((href) => {
        router.prefetch(href);
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(runPrefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = setTimeout(runPrefetch, 250);
    return () => clearTimeout(timer);
  }, [prefetchHrefs, router]);

  if (isEmbedded) {
    return null;
  }

  return (
    <>
      <aside
        className="app-sidebar-desktop hidden md:flex flex-col bg-[var(--surface-navy,#102C57)] text-white h-screen sticky top-0 transition-all duration-300 ease-in-out z-50"
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
        style={{
          width: isSidebarExpanded ? 256 : 80,
          transition: "width 0.35s ease",
        }}
      >
        <div
          className={`flex h-20 items-center px-6 shadow-md bg-[#0b2142] overflow-hidden whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? "gap-3" : "justify-center"
            }`}
        >
          <Image
            src="/brand/LOGO-KPF1.png"
            alt="KPF"
            width={56}
            height={40}
            className="h-10 w-14 min-w-[3.5rem] object-contain drop-shadow-sm"
            unoptimized
          />
          {isSidebarExpanded && (
            <div className="flex flex-col">
              <span className="text-sm font-bold uppercase tracking-widest text-[#d4af37]">
                KPF
              </span>
              <span className="text-[10px] uppercase tracking-wider text-white/50">
                Quickplan
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 flex flex-col gap-2 p-4 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map((item) => {
            if (item.children) {
              const visibleChildren = item.children.filter((child) =>
                (!child.adminOnly || permissionState.isAdmin) &&
                hasPermission(child.permissionsAny)
              );
              if (visibleChildren.length === 0) {
                return null;
              }
              const isExpanded = Boolean(expandedGroups[item.key]);
              const isChildActive = visibleChildren.some((child) =>
                isActiveLink(child.href)
              );

              return (
                <div key={item.key} className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleGroup(item.key)}
                    className={`rounded-xl py-3 text-sm font-bold transition-all duration-200 whitespace-nowrap overflow-hidden ${isSidebarExpanded
                      ? "flex items-center justify-between px-4"
                      : "flex items-center justify-center px-0"
                      } ${isChildActive
                        ? "text-[#d4af37] bg-white/5"
                        : "text-white/80 hover:bg-white/5 hover:text-white"
                      }`}
                  >
                    <div
                      className={`flex items-center ${isSidebarExpanded ? "gap-3" : "gap-0 relative"
                        }`}
                    >
                      <SidebarIcon
                        item={item}
                        size={20}
                        className={`min-w-[20px] ${isChildActive ? "text-[#d4af37]" : "text-white/60"
                          }`}
                      />
                      <span
                        className={`transition-all duration-300 ease-in-out ${isSidebarExpanded
                          ? "opacity-100 translate-x-0 relative"
                          : "opacity-0 pointer-events-none absolute -left-12"
                          }`}
                        aria-hidden={!isSidebarExpanded}
                      >
                        {item.label}
                      </span>
                    </div>
                    {isSidebarExpanded && (
                      <div className="text-white/50 transition-all duration-200">
                        {isExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </div>
                    )}
                  </button>
                  {isSidebarExpanded && (
                    <div
                      className={`flex flex-col gap-1 transition-all duration-300 overflow-hidden ${isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                    >
                      {visibleChildren.map((child) => {
                        const active = isActiveExact(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            prefetch={shouldPrefetchNavigationRoute(child.href)}
                            onMouseEnter={() => prefetchRoute(child.href)}
                            onFocus={() => prefetchRoute(child.href)}
                            className={`flex items-center gap-3 rounded-xl py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap overflow-hidden ml-2 px-4 pl-8 ${active
                              ? "text-[#d4af37] bg-white/10"
                              : "text-white/60 hover:text-white hover:bg-white/5"
                              }`}
                          >
                            <SidebarIcon
                              item={child}
                              size={16}
                              className={active ? "text-[#d4af37]" : "text-white/50"}
                            />
                            <span
                              className={`transition-all duration-300 ease-in-out ${isSidebarExpanded
                                ? "opacity-100 translate-x-0"
                                : "opacity-0 -translate-x-5"
                                }`}
                              aria-hidden={!isSidebarExpanded}
                            >
                              {child.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = isActiveExact(item.href);
            return isSidebarExpanded ? (
              <Link
                key={item.href}
                href={item.href}
                prefetch={shouldPrefetchNavigationRoute(item.href)}
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                className={`flex items-center gap-3 rounded-xl py-3 px-4 text-sm font-medium transition-all duration-200 whitespace-nowrap overflow-hidden ${isActive
                  ? "bg-white/10 text-[#d4af37] shadow-sm backdrop-blur-sm"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
              >
                <SidebarIcon
                  item={item}
                  size={20}
                  className={isActive ? "text-[#d4af37]" : "text-white/50"}
                />
                <span
                  className={`transition-all duration-300 ease-in-out ${isSidebarExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-5"
                    }`}
                >
                  {item.label}
                </span>
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                prefetch={shouldPrefetchNavigationRoute(item.href)}
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                className={`flex items-center justify-center rounded-xl py-3 px-0 text-sm font-medium transition-all duration-200 whitespace-nowrap overflow-hidden ${isActive
                  ? "bg-white/10 text-[#d4af37]"
                  : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
              >
                <SidebarIcon
                  item={item}
                  size={20}
                  className={isActive ? "text-[#d4af37]" : "text-white/50"}
                />
              </Link>
            );
          })}
        </nav>

        {isSidebarExpanded ? (
          <div className="p-4 border-t border-white/10">
            <div className="flex flex-col gap-3 rounded-2xl bg-white/10 p-4 text-white">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#d4af37] mb-1">
                  ผู้ใช้งาน
                </p>
                <p className="text-sm font-semibold">
                  {profile.username || "ไม่ระบุชื่อ"}
                </p>
                <p className="text-[11px] text-white/70">
                  {profile.department || "ยังไม่ได้ระบุแผนก"}
                </p>
              </div>
              <button
                type="button"
                onClick={requestLogout}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-[#d4af37]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white hover:border-[#d4af37] hover:bg-[#d4af37]/20 transition"
              >
                <LogOut size={16} />
                ออกจากระบบ
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center border-t border-white/10 p-4">
            <button
              type="button"
              onClick={() => setIsSidebarExpanded(true)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {mobileExpandedGroup?.children || mobileAccountMenuOpen ? (
        <button
          type="button"
          aria-hidden="true"
          onClick={() => {
            setMobileExpandedKey(null);
            setMobileAccountMenuOpen(false);
          }}
          className="app-sidebar-mobile-overlay md:hidden fixed inset-0 z-40 bg-black/30"
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          setMobileExpandedKey(null);
          setMobileAccountMenuOpen((prev) => !prev);
        }}
        className="app-sidebar-mobile-trigger md:hidden fixed top-3 right-3 z-[60] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-[var(--surface-navy,#102C57)] text-white shadow-lg"
        aria-label="เมนูผู้ใช้"
      >
        <MoreVertical size={16} />
      </button>

      {mobileAccountMenuOpen ? (
        <div className="app-sidebar-mobile-panel md:hidden fixed right-3 top-14 z-[61] w-[220px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
          <p className="text-[11px] font-semibold text-[#102C57]">{profile.username || "ไม่ระบุชื่อ"}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{profile.department || "ยังไม่ได้ระบุแผนก"}</p>
          <div className="mt-3 flex gap-2">
            {mobileSettingsHref ? (
              <Link
                href={mobileSettingsHref}
                onClick={() => {
                  setMobileAccountMenuOpen(false);
                  setMobileExpandedKey(null);
                }}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                ตั้งค่า
              </Link>
            ) : null}
            <button
              type="button"
              onClick={requestLogout}
              className="inline-flex h-8 items-center justify-center rounded-md border border-rose-300 px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-sidebar-mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50">
        {mobileVisibleChildren.length > 0 ? (
          <div className="bg-[#0b2142] border-t border-white/10 px-3 py-3">
            <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pb-1">
              {mobileVisibleChildren.map((child) => {
                const active = isActiveExact(child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    prefetch={shouldPrefetchNavigationRoute(child.href)}
                    onMouseEnter={() => prefetchRoute(child.href)}
                    onFocus={() => prefetchRoute(child.href)}
                    onClick={() => setMobileExpandedKey(null)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold transition ${active
                      ? "border-[#d4af37] bg-[var(--surface-navy,#102C57)] text-[#f2d68a]"
                      : "border-white/10 text-white/70 hover:text-white hover:border-white/30"
                      }`}
                  >
                    <SidebarIcon item={child} size={16} />
                    <span className="leading-none">{child.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <nav className="bg-[var(--surface-navy,#102C57)] border-t border-white/10 text-white flex justify-around items-center px-2 py-2 shadow-[0_-6px_24px_rgba(15,23,42,0.25)]">
          {mobileNavItems.map((item) => {
            if (item.children) {
              const isChildActive = item.children.some((child) => isActiveLink(child.href));
              const isExpanded = mobileExpandedKey === item.key;
              const visibleChildren = item.children || [];
              const singleChild = visibleChildren.length === 1 ? visibleChildren[0] : null;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (singleChild) {
                      setMobileExpandedKey(null);
                      prefetchRoute(singleChild.href);
                      router.push(singleChild.href);
                      return;
                    }
                    setMobileExpandedKey(isExpanded ? null : item.key);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-200 relative ${isChildActive || isExpanded ? "text-[#d4af37]" : "text-white/50 hover:text-white"
                    }`}
                >
                  <div
                    className={`absolute inset-0 bg-white/10 rounded-xl transition-all duration-200 ${isChildActive || isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-90"
                      }`}
                  />
                  <SidebarIcon item={item} size={20} className="relative z-10" />
                  <span className="text-[9px] font-medium relative z-10 leading-none">
                    {item.label}
                  </span>
                </button>
              );
            }

            const isActive = isActiveExact(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={shouldPrefetchNavigationRoute(item.href)}
                onMouseEnter={() => prefetchRoute(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                onClick={() => setMobileExpandedKey(null)}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-200 relative ${isActive ? "text-[#d4af37]" : "text-white/50 hover:text-white"
                  }`}
              >
                <div
                  className={`absolute inset-0 bg-white/10 rounded-xl transition-all duration-200 ${isActive ? "opacity-100 scale-100" : "opacity-0 scale-90"
                    }`}
                />
                <SidebarIcon item={item} size={20} className="relative z-10" />
                <span className="text-[9px] font-medium relative z-10 leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#102C57]">ยืนยันการออกจากระบบ</h3>
            <p className="mt-2 text-xs text-slate-600">ต้องการออกจากระบบใช่หรือไม่</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLogoutConfirm}
                className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="h-8 rounded-md bg-rose-600 px-3 text-xs font-semibold text-white"
              >
                ยืนยันออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
