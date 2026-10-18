"use client";

import { Ban, ClipboardList, PackageCheck, Printer, RotateCcw, Scale, Wifi } from "lucide-react";
import GroupedPageNavigation from "@/components/GroupedPageNavigation";

export const STATION_GROUPS = Object.freeze([
  {
    key: "weighing",
    label: "งานชั่ง",
    icon: Scale,
    items: [
      {
        key: "inbound",
        label: "ชั่งเข้า",
        icon: Scale,
        description: "ชั่งผลผลิต / WIP ประจำแผนก (งานหลัก)",
        badge: "หลัก",
      },
      {
        key: "return",
        label: "ชั่งคืน",
        icon: RotateCcw,
        description: "ชั่งคืนสต็อกวัตถุดิบ/WIP ที่ใช้ไม่หมด",
      },
      {
        key: "void",
        label: "ยกเลิกชั่ง",
        icon: Ban,
        description: "ยกเลิกใบชั่งรับเข้าที่ยังไม่ถูกเบิก",
        tone: "rose",
      },
    ],
  },
  {
    key: "issuing",
    label: "งานเบิก",
    icon: ClipboardList,
    items: [
      {
        key: "issue",
        label: "สแกนเบิก",
        icon: ClipboardList,
        description: "สแกนบาร์โค้ดเบิกเข้าสายการผลิต (งานหลัก)",
        badge: "หลัก",
      },
      {
        key: "cancel_issue",
        label: "ยกเลิกเบิก",
        icon: RotateCcw,
        description: "ยกเลิกรายการเบิก (บล็อกหากมีใบคืน)",
        tone: "rose",
      },
    ],
  },
]);

export const STATION_MODES = Object.freeze(
  STATION_GROUPS.flatMap((group) => group.items)
);

export default function WeightScaleLiveSubHeader({
  activeMode = "inbound", onModeChange, agentConnected = false, printerOnline = false, leading, trailing,
}) {
  return <GroupedPageNavigation
    compact
    groups={STATION_GROUPS}
    value={activeMode}
    onChange={onModeChange}
    leading={leading}
    trailing={<>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1"><Wifi size={14} aria-hidden="true" />เครื่องชั่ง <strong className={agentConnected ? "text-emerald-700" : "text-rose-700"}>{agentConnected ? "พร้อม" : "ไม่เชื่อมต่อ"}</strong></span>
        <span className="inline-flex items-center gap-1"><Printer size={14} aria-hidden="true" />เครื่องพิมพ์ <strong className={printerOnline ? "text-emerald-700" : "text-amber-700"}>{printerOnline ? "พร้อม" : "ไม่เชื่อมต่อ"}</strong></span>
      </div>
      {trailing}
    </>}
    label="เมนูจุดชั่งกลาง"
  />;
}
