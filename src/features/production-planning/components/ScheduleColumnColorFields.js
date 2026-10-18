"use client";

import ScheduleHighlightPicker from "./ScheduleHighlightPicker";

export default function ScheduleColumnColorFields({ headerColor, bodyColor, onChange }) {
  return <>
    <ScheduleHighlightPicker label="สีหัวคอลัมน์" value={headerColor} onChange={color => onChange({ headerColor: color })} />
    <ScheduleHighlightPicker label="สีเนื้อหาคอลัมน์" value={bodyColor} onChange={color => onChange({ bodyColor: color })} />
  </>;
}
