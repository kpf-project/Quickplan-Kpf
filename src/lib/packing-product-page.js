export async function loadPackingProductPage(db, { page = "1", search = "", allowedCodes } = {}) {
  if (!/^[1-9]\d{0,4}$/.test(String(page))) throw Object.assign(new Error("Invalid page"), { status: 400 });
  const pageNumber = Number(page);
  const term = String(search).trim();
  if (term.length > 200) throw Object.assign(new Error("คำค้นยาวเกินไป"), { status: 400 });
  if (allowedCodes && !allowedCodes.length) return { data: [], totalCount: 0, page: pageNumber, pageSize: 25 };
  let query = db.from("products_cache").select("sku_code,sku_name,iccat_code,uom_name,image_url", { count: "exact" })
    .in("iccat_code", ["04", "04-1", "04-2"]).order("sku_code");
  if (allowedCodes) query = query.in("sku_code", allowedCodes);
  if (term) {
    const literal = term.replace(/[\\%_]/g, "\\$&").replace(/"/g, '\\"');
    query = query.or(`sku_code.ilike."%${literal}%",sku_name.ilike."%${literal}%"`);
  }
  const { data, count, error } = await query.range((pageNumber - 1) * 25, pageNumber * 25 - 1);
  if (error) throw Object.assign(new Error("ไม่สามารถโหลดรายการสินค้าได้"), { status: 500 });
  return { data: (data || []).map(row => ({ code: row.sku_code, name: row.sku_name, unitName: row.uom_name,
    uomName: row.uom_name, imageUrl: row.image_url, categoryCode: row.iccat_code })), totalCount: count || 0, page: pageNumber, pageSize: 25 };
}
