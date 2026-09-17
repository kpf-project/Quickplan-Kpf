"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  PackageCheck,
  RotateCcw,
  Scale,
  ScanLine,
  Trash2,
} from "lucide-react";

const PRIMARY_NAV_LINKS = Object.freeze([]);

function NavIcon({ item, size = 16, className = "" }) {
  if (item?.iconPath) {
    const maskScale = item.iconMaskScale || 1;
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

  const Icon = item?.icon || ClipboardList;
  return <Icon size={size} className={className} />;
}

const DROPDOWN_NAVS = Object.freeze([
  {
    key: "weight",
    label: "ชั่งน้ำหนักผลิตภัณฑ์",
    icon: Scale,
    iconPath: "/icons/scale.png",
    directItems: [
      {
        href: "/production-line/weight-scale",
        label: "ชั่งน้ำหนักผลิตภัณฑ์",
        icon: Scale,
        iconPath: "/icons/scale.png",
      },
      {
        href: "/production-line/weight-scale-live",
        label: "ชั่งน้ำหนักจากเครื่องชั่ง",
        icon: ScanLine,
      },
      {
        href: "/production-line/weight-scale/cancel",
        label: "ยกเลิกชั่ง",
        icon: Ban,
      },
      {
        href: "/production-line/weight-scale/return",
        label: "ชั่งคืนผลิตภัณฑ์",
        icon: PackageCheck,
        iconPath: "/icons/delivery-service.png",
      },
      {
        href: "/production-line/weight-scale/waste",
        label: "ชั่งของเสียผลิตภัณฑ์",
        icon: Trash2,
      },
    ],
    sections: [],
  },
  {
    key: "issue",
    label: "เบิก",
    icon: ClipboardList,
    iconPath: "/icons/barcode-scanner.png",
    directItems: [
      {
        href: "/production-line/stock/issues",
        label: "เบิกสต็อก",
        icon: ClipboardList,
        iconPath: "/icons/barcode-scanner.png",
      },
      {
        href: "/production-line/stock/issues/cancel",
        label: "ยกเลิกเบิก",
        icon: RotateCcw,
      },
    ],
    sections: [],
  },
  {
    key: "report",
    label: "รายงาน",
    icon: FileText,
    directItems: [
      {
        href: "/production-line/stock/balance/summary",
        label: "รายงานเคลื่อนไหว",
        icon: FileText,
      },
      {
        href: "/production-line/attendance/report/input-output",
        label: "รายงานวัตถุดิบและผลผลิต",
        icon: FileText,
      },
    ],
    sections: [
      {
        key: "lot-balance-report",
        label: "รายงานสรุปคงเหลือราย Lot",
        icon: FileText,
        items: [
          {
            href: "/production-line/stock/balance",
            label: "รายงานสรุปคงเหลือราย Lot แบบละเอียด",
          },
          {
            href: "/production-line/stock/balance/lot",
            label: "รายงานสรุปยอดคงเหลือราย Lot",
          },
        ],
      },
      {
        key: "weight-report",
        label: "รายงานชั่ง",
        icon: Scale,
        items: [
          {
            href: "/production-line/weight-scale/report-summary",
            label: "รายงานสรุปชั่ง",
          },
          {
            href: "/production-line/weight-scale/report",
            label: "รายงานสรุปชั่งแบบละเอียด",
          },
        ],
      },
      {
        key: "issue-report",
        label: "รายงานเบิก",
        icon: ClipboardList,
        items: [
          {
            href: "/production-line/stock/issues/report-summary",
            label: "รายงานสรุปเบิก",
          },
          {
            href: "/production-line/stock/issues/report",
            label: "รายงานสรุปเบิกแบบละเอียด",
          },
        ],
      },
    ],
  },
  {
    key: "prison",
    label: "เรือนจำ",
    icon: FileText,
    iconPath: "/icons/prison.png",
    directItems: [
      {
        href: "/production-line/stock/prison/issues",
        label: "สแกนเบิกออก",
        icon: ScanLine,
      },
      {
        href: "/production-line/stock/prison/issues/cancel",
        label: "ยกเลิกเบิก",
        icon: Ban,
      },
      {
        href: "/production-line/stock/prison/inbound/cancel",
        label: "ยกเลิกชั่ง",
        icon: RotateCcw,
      },
    ],
    sections: [
      {
        key: "prison-weigh-report",
        label: "รายงานรับเข้า",
        icon: PackageCheck,
        items: [
          {
            href: "/production-line/stock/prison/report-summary",
            label: "รายงานสรุปรับเข้าเรือนจำ",
          },
          {
            href: "/production-line/stock/prison/report",
            label: "รายงานสรุปรับเข้าเรือนจำแบบละเอียด",
          },
        ],
      },
      {
        key: "prison-issue-report",
        label: "รายงานเบิก",
        icon: ClipboardList,
        items: [
          {
            href: "/production-line/stock/prison/issues/report-summary",
            label: "รายงานสรุปเบิกออกเรือนจำ",
          },
          {
            href: "/production-line/stock/prison/issues/report",
            label: "รายงานสรุปเบิกออกเรือนจำแบบละเอียด",
          },
        ],
      },
      {
        key: "prison-balance-report",
        label: "รายงานคงเหลือ",
        icon: Boxes,
        items: [
          {
            href: "/production-line/stock/prison/balance/lot",
            label: "รายงาน Lot คงค้าง",
          },
          {
            href: "/production-line/stock/prison/balance/summary",
            label: "รายงานสรุป ชั่ง-เบิก",
          },
        ],
      },
    ],
  },
]);

function isActivePath(pathname, href) {
  if (!pathname || !href) {
    return false;
  }

  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
}

function isExactActivePath(pathname, href) {
  return Boolean(pathname && href && pathname === href);
}

function shouldPrefetchRoute(href) {
  const normalizedHref = String(href || "");
  if (!normalizedHref) {
    return false;
  }

  if (normalizedHref === "/production-line/stock/balance/lot") {
    return true;
  }

  return true;
}

function getDropdownByKey(key) {
  return DROPDOWN_NAVS.find((dropdown) => dropdown.key === key) || null;
}

function isDropdownActive(pathname, dropdown) {
  if (!pathname || !dropdown) {
    return false;
  }

  // Check direct items with more precision
  const hasActiveDirectItem = (dropdown.directItems || []).some((item) => {
    if (item.href === "/production-line/stock/issues" || item.href === "/production-line/weight-scale") {
      // For main transaction pages, use exact match or specific sub-paths that ARE NOT reports
      return pathname === item.href || (pathname.startsWith(`${item.href}/`) && !pathname.includes("/report"));
    }
    return isActivePath(pathname, item.href);
  });

  if (hasActiveDirectItem) {
    return true;
  }

  return (dropdown.sections || []).some((section) =>
    section.items.some((item) => isActivePath(pathname, item.href))
  );
}

function getFirstSectionKey(dropdownKey) {
  const dropdown = getDropdownByKey(dropdownKey);
  return dropdown?.sections?.[0]?.key || null;
}

function getActiveSectionKey(pathname, dropdown) {
  if (!dropdown?.sections?.length) {
    return null;
  }

  const activeSection = dropdown.sections.find((section) =>
    section.items.some((item) => isActivePath(pathname, item.href))
  );

  return activeSection?.key || dropdown.sections[0]?.key || null;
}

export default function WeightScalePrimaryHeader({
  eyebrow = "ระบบชั่งน้ำหนัก",
  badge = "พร้อมใช้งาน",
  title,
  description = "",
  actions = null,
  compact = false,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const menuAreaRef = useRef(null);
  const [openDropdownKey, setOpenDropdownKey] = useState(null);
  const [activeSectionKey, setActiveSectionKey] = useState(getFirstSectionKey("report"));

  const prefetchRoute = useCallback(
    (href) => {
      if (!shouldPrefetchRoute(href)) return;
      router.prefetch(href);
    },
    [router]
  );

  const prefetchDropdown = useCallback(
    (dropdown) => {
      (dropdown?.directItems || []).forEach((item) => prefetchRoute(item.href));
      (dropdown?.sections || []).forEach((section) => {
        section.items.forEach((item) => prefetchRoute(item.href));
      });
    },
    [prefetchRoute]
  );

  const activeNavLabel = useMemo(() => {
    const activePrimary = PRIMARY_NAV_LINKS.find((item) => isActivePath(pathname, item.href));
    if (activePrimary) {
      return activePrimary.label;
    }

    for (const dropdown of DROPDOWN_NAVS) {
      for (const item of dropdown.directItems || []) {
        if (isActivePath(pathname, item.href)) {
          return item.label;
        }
      }

      for (const section of dropdown.sections || []) {
        const exactActiveItem = section.items.find((item) => isExactActivePath(pathname, item.href));
        const activeItem = exactActiveItem
          || section.items.find((item) => isActivePath(pathname, item.href));
        if (activeItem) {
          return activeItem.label;
        }
      }
    }

    return "";
  }, [pathname]);

  const closeMenus = useCallback(() => {
    setOpenDropdownKey(null);
  }, []);

  useEffect(() => {
    if (!openDropdownKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!menuAreaRef.current?.contains(event.target)) {
        closeMenus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeMenus, openDropdownKey]);

  return (
    <section className="relative z-[40] bg-gradient-to-r from-[#102C57] via-[#122b4d] to-[#0f172a] text-white shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_60%)]" />

      <div className={`relative mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-8 ${compact ? "py-3" : "py-4"}`}>
        <div className={compact ? "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" : "flex flex-col gap-5"}>
          {!compact ? (
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d4af37]">
                    {eyebrow}
                  </span>
                  <span className="border border-[#d4af37]/40 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
                    {badge}
                  </span>
                </div>

                <h1 className="mt-3 font-serif text-3xl font-bold uppercase leading-[1.08] tracking-[0.08em] text-white sm:text-[2.6rem]">
                  {title}
                </h1>

                {description ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{description}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            </div>
          ) : null}

          <div
            ref={menuAreaRef}
            className={`flex flex-wrap items-center gap-2 ${compact ? "flex-1" : "border-t border-white/10 pt-4"}`}
          >
            {PRIMARY_NAV_LINKS.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={shouldPrefetchRoute(item.href)}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
                  className={`inline-flex h-10 items-center justify-center gap-2 border px-4 text-sm font-black uppercase tracking-[0.12em] transition-all duration-200 ${
                    isActive
                      ? "border-[#d4af37] bg-[#d4af37] text-[#102C57] shadow-[0_4px_12px_rgba(212,175,55,0.25)]"
                      : "border-white/10 bg-white/5 text-white/85 hover:border-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
                  }`}
                >
                  <NavIcon item={item} size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {DROPDOWN_NAVS.map((dropdown) => {
              const isActive = isDropdownActive(pathname, dropdown);
              const isOpen = openDropdownKey === dropdown.key;
              const currentSection =
                dropdown.sections.find((section) => section.key === activeSectionKey)
                || dropdown.sections[0];

              return (
                <div
                  key={dropdown.key}
                  className="relative"
                  onMouseEnter={() => {
                    setOpenDropdownKey(dropdown.key);
                    prefetchDropdown(dropdown);
                    if (dropdown.sections.length) {
                      setActiveSectionKey(getActiveSectionKey(pathname, dropdown));
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdownKey((current) => {
                        if (current === dropdown.key) {
                          return null;
                        }

                        if (dropdown.sections.length) {
                          setActiveSectionKey(getActiveSectionKey(pathname, dropdown));
                        }

                        return dropdown.key;
                      });
                    }}
                    className={`inline-flex h-10 items-center justify-center gap-2 border px-4 text-sm font-black uppercase tracking-[0.12em] transition-all duration-200 ${
                      isActive || isOpen
                        ? "border-[#d4af37] bg-[#d4af37] text-[#102C57] shadow-[0_4px_12px_rgba(212,175,55,0.25)]"
                        : "border-white/10 bg-white/5 text-white/85 hover:border-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
                    }`}
                  >
                    <NavIcon item={dropdown} size={18} />
                    <span>{dropdown.label}</span>
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen ? (
                    <div
                      className="absolute left-0 top-full z-50 mt-1 min-w-[280px] border-2 border-[#d4af37] bg-[#102C57] p-1 shadow-2xl backdrop-blur-sm"
                      onMouseLeave={closeMenus}
                    >
                      {(dropdown.directItems || []).map((item) => {
                        const isItemActive = isExactActivePath(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={shouldPrefetchRoute(item.href)}
                            onClick={closeMenus}
                            onMouseEnter={() => prefetchRoute(item.href)}
                            onFocus={() => prefetchRoute(item.href)}
                            className={`flex w-full items-center justify-between px-5 py-4 text-left transition ${
                              isItemActive
                                ? "bg-[#d4af37] text-[#102C57]"
                                : "bg-[#102C57] text-white/90 hover:bg-[#d4af37] hover:text-[#102C57]"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <NavIcon item={item} size={20} />
                              <span className="block text-sm font-black uppercase tracking-wider">
                                {item.label}
                              </span>
                            </div>
                          </Link>
                        );
                      })}

                      {dropdown.directItems.length && dropdown.sections.length ? (
                        <div className="my-1 border-t border-white/10" />
                      ) : null}

                      {(dropdown.sections || []).map((section) => (
                        <div
                          key={section.key}
                          className="relative"
                          onMouseEnter={() => setActiveSectionKey(section.key)}
                        >
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#d4af37] hover:text-[#102C57] ${
                              activeSectionKey === section.key
                                ? "bg-white/5 text-white"
                                : "text-white/90"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <NavIcon item={section} size={20} />
                              <span className="block text-sm font-black uppercase tracking-wider">
                                {section.label}
                              </span>
                            </div>
                            <ChevronRight size={16} />
                          </button>

                          {activeSectionKey === section.key ? (
                            <div className="absolute left-full top-[-4px] ml-1 min-w-[340px] border-2 border-[#d4af37] bg-[#102C57] p-1 shadow-2xl">
                              {section.items.map((item) => {
                                const isItemActive = isExactActivePath(pathname, item.href);
                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    prefetch={shouldPrefetchRoute(item.href)}
                                    onClick={closeMenus}
                                    onMouseEnter={() => prefetchRoute(item.href)}
                                    onFocus={() => prefetchRoute(item.href)}
                                    className={`flex flex-col px-5 py-4 transition ${
                                      isItemActive
                                        ? "border-l-4 border-[#d4af37] bg-white/15 text-[#d4af37]"
                                        : "text-white/80 hover:bg-white/5 hover:text-white"
                                    }`}
                                  >
                                    <span className="text-sm font-bold">{item.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {activeNavLabel ? (
              <span className="ml-auto hidden text-[11px] font-black uppercase tracking-[0.2em] text-white/45 lg:inline">
                กำลังใช้งาน: {activeNavLabel}
              </span>
            ) : null}
          </div>

          {compact ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
