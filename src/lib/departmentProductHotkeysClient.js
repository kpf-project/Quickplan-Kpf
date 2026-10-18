export async function requestDepartmentProductHotkeys(departmentId, binding, signal) {
  const response = await fetch(binding ? "/api/scale/live/hotkeys" : `/api/scale/live/hotkeys?departmentId=${encodeURIComponent(departmentId)}`, {
    method: binding ? "POST" : "GET", cache: "no-store", signal,
    ...(binding ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departmentId, ...binding }) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || "โหลดปุ่มลัดไม่สำเร็จ");
  return payload;
}
