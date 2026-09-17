"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { Layers, Plus, Trash2, Users, Workflow } from "lucide-react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

function buildDepartmentKey(item) {
  const code = String(item?.ownerDepartmentCode || "").trim();
  const name = String(item?.ownerDepartmentName || "").trim();
  return `${code}::${name}`;
}

function buildDepartmentLabel(item) {
  const code = String(item?.ownerDepartmentCode || "").trim();
  const name = String(item?.ownerDepartmentName || "").trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || "ยังไม่ผูกแผนก";
}

function getInitialAddDraft(categories, categoryProductOptions) {
  const firstCategory = categories[0] || null;
  const firstCategoryId = firstCategory ? String(firstCategory.id) : "";
  const firstProduct = firstCategoryId ? (categoryProductOptions.get(firstCategoryId) || [])[0] : null;
  return {
    categoryId: firstCategoryId,
    skuCode: String(firstProduct?.SKU_CODE || ""),
    quantity: "1",
    lineStaffCount: "",
    lineMachineNo: "",
    workStartTime: "08:00",
    workEndTime: "16:00",
    itemNote: "",
  };
}

const PlanningBoardCard = memo(function PlanningBoardCard({
  item,
  categories,
  categoryProductOptions,
  onSave,
  onRemove,
}) {
  const [draft, setDraft] = useState(() => ({
    categoryId: String(item?.categoryId || ""),
    skuCode: String(item?.skuCode || ""),
    quantity: String(item?.quantity ?? ""),
    lineStaffCount: item?.lineStaffCount ?? "",
    lineMachineNo: item?.lineMachineNo ?? "",
    workStartTime: item?.workStartTime || "",
    workEndTime: item?.workEndTime || "",
    itemNote: item?.itemNote || "",
  }));
  const [savingField, setSavingField] = useState("");
  const rowCategoryProducts = useMemo(
    () => categoryProductOptions.get(String(draft.categoryId || "")) || [],
    [categoryProductOptions, draft.categoryId]
  );

  async function commit(field, value) {
    setSavingField(field);
    await onSave(item.id, value);
    setSavingField("");
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a6d1f]">
            {item.categoryName || "ยังไม่ระบุประเภท"}
          </div>
          <div className="mt-1 text-sm font-bold text-[#102C57]">{item.skuCode || "ยังไม่ระบุสินค้า"}</div>
          <div className="text-xs text-slate-500">{item.skuName || "-"}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
            {savingField ? "กำลังบันทึก..." : "พร้อมใช้งาน"}
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            <Trash2 size={14} />
            ลบ
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">ประเภท</div>
        <select
          value={draft.categoryId}
          onChange={async (event) => {
            const categoryId = event.target.value;
            const nextProducts = categoryProductOptions.get(categoryId) || [];
            const nextSkuCode = String(nextProducts[0]?.SKU_CODE || "");
            setDraft((prev) => ({ ...prev, categoryId, skuCode: nextSkuCode }));
            await commit("categoryId", { categoryId, skuCode: nextSkuCode });
          }}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        >
          <option value="">เลือกประเภท</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">สินค้า</div>
        <select
          value={draft.skuCode}
          onChange={async (event) => {
            const skuCode = event.target.value;
            setDraft((prev) => ({ ...prev, skuCode }));
            await commit("skuCode", { skuCode });
          }}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        >
          <option value="">เลือกสินค้า</option>
          {rowCategoryProducts.map((product) => (
            <option key={product.SKU_CODE} value={product.SKU_CODE}>
              {product.SKU_CODE} - {product.SKU_NAME}
            </option>
          ))}
        </select>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">จำนวน</div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.quantity}
          onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
          onBlur={() => commit("quantity", { quantity: draft.quantity })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm font-semibold text-[#102C57] outline-none transition focus:border-[#102C57]"
        />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">คน</div>
        <input
          type="number"
          min="0"
          step="1"
          value={draft.lineStaffCount}
          onChange={(event) => setDraft((prev) => ({ ...prev, lineStaffCount: event.target.value }))}
          onBlur={() => commit("lineStaffCount", { lineStaffCount: draft.lineStaffCount })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-center text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">เครื่อง</div>
        <input
          type="number"
          min="0"
          step="1"
          value={draft.lineMachineNo}
          onChange={(event) => setDraft((prev) => ({ ...prev, lineMachineNo: event.target.value }))}
          onBlur={() => commit("lineMachineNo", { lineMachineNo: draft.lineMachineNo })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-center text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">เริ่ม</div>
        <input
          type="time"
          value={draft.workStartTime}
          onChange={(event) => setDraft((prev) => ({ ...prev, workStartTime: event.target.value }))}
          onBlur={() => commit("workStartTime", { workStartTime: draft.workStartTime })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500">สิ้นสุด</div>
        <input
          type="time"
          value={draft.workEndTime}
          onChange={(event) => setDraft((prev) => ({ ...prev, workEndTime: event.target.value }))}
          onBlur={() => commit("workEndTime", { workEndTime: draft.workEndTime })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
        />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-500">หมายเหตุ</div>
        <textarea
          value={draft.itemNote}
          onChange={(event) => setDraft((prev) => ({ ...prev, itemNote: event.target.value }))}
          onBlur={() => commit("itemNote", { itemNote: draft.itemNote })}
          rows={2}
          className="min-h-[76px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#102C57]"
          placeholder="หมายเหตุรายสินค้า"
        />
      </div>
    </article>
  );
});

export default function LinePlanningBoard({
  items,
  selectedDate,
  categories,
  categoryProductOptions,
  onCreateItem,
  onUpdateItem,
  onRemoveItem,
  isSaving,
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [addDraft, setAddDraft] = useState(() => getInitialAddDraft(categories, categoryProductOptions));
  const effectiveAddDraft = addDraft.categoryId
    ? addDraft
    : getInitialAddDraft(categories, categoryProductOptions);
  const [isAdding, setIsAdding] = useState(false);
  const addProductOptions = useMemo(
    () => categoryProductOptions.get(String(effectiveAddDraft.categoryId || "")) || [],
    [categoryProductOptions, effectiveAddDraft.categoryId]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = String(deferredQuery || "").trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => {
      const searchable = [
        item?.skuCode,
        item?.skuName,
        item?.categoryName,
        item?.ownerDepartmentCode,
        item?.ownerDepartmentName,
        item?.itemNote,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return searchable.includes(normalizedQuery);
    });
  }, [deferredQuery, items]);

  const groupedItems = useMemo(() => {
    const byDepartment = new Map();
    filteredItems.forEach((item) => {
      const key = buildDepartmentKey(item);
      if (!byDepartment.has(key)) {
        byDepartment.set(key, {
          key,
          label: buildDepartmentLabel(item),
          rows: [],
          staffTotal: 0,
          qtyTotal: 0,
          machineSet: new Set(),
        });
      }
      const group = byDepartment.get(key);
      group.rows.push(item);
      group.staffTotal += Number(item?.lineStaffCount || 0) || 0;
      group.qtyTotal += Number(item?.quantity || 0) || 0;
      if (item?.lineMachineNo !== null && item?.lineMachineNo !== undefined && item?.lineMachineNo !== "") {
        group.machineSet.add(String(item.lineMachineNo));
      }
    });
    return Array.from(byDepartment.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((group) => ({
        ...group,
        machineList: Array.from(group.machineSet).sort((a, b) => Number(a) - Number(b)),
      }));
  }, [filteredItems]);

  async function handleAdd() {
    setIsAdding(true);
    await onCreateItem({
      ...effectiveAddDraft,
      date: selectedDate,
      endDate: selectedDate,
    });
    setIsAdding(false);
  }

  return (
    <section className="rounded-[28px] border border-[#102C57]/15 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a6d1f]">Global Line Planning Board</div>
          <h4 className="mt-1 text-lg font-bold text-[#102C57]">ตารางวางแผนรายวัน {formatDate(selectedDate)}</h4>
          <p className="mt-1 text-sm text-slate-500">
            แยกตามแผนกชัดเจน และกรอกประเภท สินค้า คน เวลา เครื่อง และหมายเหตุได้ในบอร์ดเดียว
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-[#102C57]/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#102C57]">
            {items.length.toLocaleString()} รายการ
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {groupedItems.length.toLocaleString()} แผนก
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {isSaving ? "กำลังซิงก์ข้อมูล..." : "เชื่อม Supabase แล้ว"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-2xl border border-[#102C57]/10 bg-white p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#102C57]">
            <Plus size={16} />
            เพิ่มงานผลิตลงวันนี้
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
            <select
              value={effectiveAddDraft.categoryId}
              onChange={(event) => {
                const categoryId = event.target.value;
                const nextProducts = categoryProductOptions.get(categoryId) || [];
                setAddDraft((prev) => ({
                  ...prev,
                  categoryId,
                  skuCode: String(nextProducts[0]?.SKU_CODE || ""),
                }));
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
            >
              <option value="">เลือกประเภท</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={effectiveAddDraft.skuCode}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, skuCode: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57] md:col-span-2 xl:col-span-2"
            >
              <option value="">เลือกสินค้า</option>
              {addProductOptions.map((product) => (
                <option key={product.SKU_CODE} value={product.SKU_CODE}>
                  {product.SKU_CODE} - {product.SKU_NAME}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={effectiveAddDraft.quantity}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, quantity: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm text-slate-700 outline-none focus:border-[#102C57]"
              placeholder="จำนวน"
            />
            <input
              type="number"
              min="0"
              step="1"
              value={effectiveAddDraft.lineStaffCount}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, lineStaffCount: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm text-slate-700 outline-none focus:border-[#102C57]"
              placeholder="คน"
            />
            <input
              type="number"
              min="0"
              step="1"
              value={effectiveAddDraft.lineMachineNo}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, lineMachineNo: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm text-slate-700 outline-none focus:border-[#102C57]"
              placeholder="เครื่อง"
            />
            <input
              type="time"
              value={effectiveAddDraft.workStartTime}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, workStartTime: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
            />
            <input
              type="time"
              value={effectiveAddDraft.workEndTime}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, workEndTime: event.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <textarea
              value={effectiveAddDraft.itemNote}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, itemNote: event.target.value }))}
              rows={2}
              className="min-h-[76px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#102C57]"
              placeholder="หมายเหตุรายสินค้า เช่น รันก่อนบ่าย / เครื่อง 2 ต้องเผื่อ setup"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#102C57] px-5 text-sm font-semibold text-white transition hover:bg-[#0b2244] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              {isAdding ? "กำลังเพิ่ม..." : "เพิ่มลงตาราง"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#102C57]/10 bg-white p-3">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#102C57]">Board Filter</div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาแผนก, SKU, สินค้า"
            className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
          />
          <div className="mt-4 space-y-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <Layers size={12} />
                แผนกทั้งหมด
              </div>
              <div className="mt-1 text-lg font-bold text-[#102C57]">{groupedItems.length.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <Users size={12} />
                คนรวม
              </div>
              <div className="mt-1 text-lg font-bold text-[#102C57]">
                {formatNumber(groupedItems.reduce((sum, group) => sum + group.staffTotal, 0), 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <Workflow size={12} />
                ปริมาณรวม
              </div>
              <div className="mt-1 text-lg font-bold text-[#102C57]">
                {formatNumber(groupedItems.reduce((sum, group) => sum + group.qtyTotal, 0), 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {groupedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-[#102C57]">ยังไม่มีแผนในวันที่เลือก</div>
            <p className="mt-1 text-xs text-slate-500">เพิ่มรายการจากฟอร์มด้านบน แล้วบอร์ดจะแยกตามแผนกให้อัตโนมัติ</p>
          </div>
        ) : null}

        {groupedItems.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-[24px] border border-[#102C57]/15 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-[linear-gradient(90deg,#102C57_0%,#183866_55%,#f4efe1_100%)] px-4 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#f2d68a]">Department Lane</div>
                <h5 className="mt-1 text-base font-bold">{group.label}</h5>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">{group.rows.length.toLocaleString()} รายการ</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">คนรวม {formatNumber(group.staffTotal, 0)}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">ปริมาณ {formatNumber(group.qtyTotal, 0)}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  เครื่อง {group.machineList.length ? group.machineList.join(", ") : "-"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 p-3 sm:grid-cols-1 xl:grid-cols-2">
              {group.rows.map((item) => (
                <PlanningBoardCard
                  key={[
                    item.id,
                    item.categoryId,
                    item.skuCode,
                    item.quantity,
                    item.lineStaffCount,
                    item.lineMachineNo,
                    item.workStartTime,
                    item.workEndTime,
                    item.itemNote,
                  ].join("|")}
                  item={item}
                  categories={categories}
                  categoryProductOptions={categoryProductOptions}
                  onSave={onUpdateItem}
                  onRemove={onRemoveItem}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
