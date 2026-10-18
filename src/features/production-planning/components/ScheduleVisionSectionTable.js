"use client";

import { useMemo } from "react";
import GenericScheduleTable from "./GenericScheduleTable";
import { importTableData } from "@/lib/scheduleImportReview";

export default function ScheduleVisionSectionTable({ section, rows, onUpdate, onDelete }) {
  const table = useMemo(() => importTableData(section, rows), [section, rows]);
  return <div className="overflow-x-auto">
    <GenericScheduleTable section={section} {...table} sectionShifts={section.shifts ?? []} onUpdate={onUpdate} onDelete={onDelete} />
  </div>;
}
