export function createDepartmentProductPager(fetchPage) {
  let current = null, revision = 0;
  async function load(search, page, cursors) {
    const request = ++revision;
    const params = { page: String(page), pageSize: "8", search, iccatCodes: "03,04,04-1,04-2" };
    if (cursors[page - 1]) params.cursor = cursors[page - 1];
    const result = await fetchPage(params);
    if (request !== revision) return null;
    if (!result.ok) throw new Error(result.error?.message || "โหลดสินค้าไม่สำเร็จ");
    const payload = result.data;
    if (!Array.isArray(payload?.data)) throw new Error("ข้อมูลสินค้าไม่ถูกต้อง");
    const hasMore = Boolean(payload.cursor?.hasMore) || page < Number(payload.pagination?.totalPages || 1);
    if (payload.cursor?.hasMore && !payload.cursor.next) throw new Error("ระบบไม่ส่งตำแหน่งสินค้าหน้าถัดไป กรุณาลองใหม่");
    current = { data: payload.data, search, page, hasMore, cursors: [...cursors.slice(0, page), payload.cursor?.next || null] };
    return current;
  }
  return {
    open: () => load("", 1, [null]),
    search: value => load(value.trim(), 1, [null]),
    next: () => current?.hasMore ? load(current.search, current.page + 1, current.cursors) : Promise.resolve(null),
    previous: () => current?.page > 1 ? load(current.search, current.page - 1, current.cursors) : Promise.resolve(null),
  };
}
