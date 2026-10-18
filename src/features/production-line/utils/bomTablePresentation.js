// Keep ancestors visible when a nested material matches a table filter.
export function filterBomTreeRows(rows, filters, resolveMaterial) {
  const query = filters.query.trim().toLocaleLowerCase("th");
  const ancestors = [], visible = new Set();
  rows.forEach(row => {
    const depth = row.depth || 0;
    ancestors.length = depth;
    const material = resolveMaterial(row);
    const matches = (!query || `${row.materialGoodsCode || row.materialCode} ${row.materialName || material?.name || ""}`.toLocaleLowerCase("th").includes(query))
      && (filters.type === "all" || (row.itemType || material?.itemType) === filters.type)
      && (filters.category === "all" || material?.category === filters.category)
      && (filters.active === "all" || material?.isActive === (filters.active === "active"));
    if (matches) { visible.add(row.id); ancestors.forEach(parent => visible.add(parent.id)); }
    ancestors[depth] = row;
  });
  return rows.filter(row => visible.has(row.id));
}
