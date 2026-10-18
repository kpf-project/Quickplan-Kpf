import { isProductInImportScope } from "./scheduleImportScope.js";

const EMPTY_MARKERS = new Set(["", "-", "—", "–", "null", "n/a"]);

export function normalizeImportText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ช็อค/g, "ช็อก")
    .replace(/สตรอเบอร์รี่|สตรอเบอรี่|สตรอฯ/g, "สตรอ")
    .replace(/คุกกี้ห้อน|ห้อนหอย|ก้อนหอย|\bห้อน\b/g, "ก้นหอย")
    .replace(/\s+/g, " ")
    .replace(/[.,;:()\[\]{}_/\\-]/g, "")
    .trim();
}

export function buildImportSignature({ brand, product, size }) {
  return [brand, product, size].map(normalizeImportText).join("|");
}

export function parseImportNumber(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (EMPTY_MARKERS.has(raw)) return null;
  // Match leading number (with optional commas and decimals), ignoring trailing units like กก., กระบะ, ลัง, ปี๊บ, คน, ชุด, etc.
  const match = raw.match(/^([0-9,]+(?:\.[0-9]+)?)(?:\s*([^\d\s].*))?$/u);
  if (!match) return undefined;
  const numStr = match[1].replace(/,/g, "");
  const number = Number(numStr);
  return Number.isFinite(number) ? number : undefined;
}

export function isDateInRange(value, dateFrom, dateTo) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    && value >= dateFrom
    && value <= dateTo;
}

function nullableString() {
  return { anyOf: [{ type: "string" }, { type: "null" }] };
}

export function buildVisionExtractionSchema(template) {
  const sections = template?.sections ?? [];
  const sectionIds = sections.map((section) => section.id);
  const cellKeys = [...new Set(sections.flatMap((section) =>
    (section.production_schedule_column_defs ?? [])
      .filter((column) => !["brand_auto", "sku_picker", "shift"].includes(column.col_type))
      .map((column) => column.key)
  ))];
  const productKeys = [...new Set(sections.flatMap((section) =>
    (section.production_schedule_column_defs ?? [])
      .filter((column) => column.col_type === "sku_picker")
      .map((column) => column.key)
  ))];

  return {
    type: "object",
    properties: {
      documentTitle: nullableString(),
      detectedDepartment: nullableString(),
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sectionId: { type: "string", enum: sectionIds },
            workDate: nullableString(),
            sourceRowLabel: nullableString(),
            sourceShift: nullableString(),
            cells: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  columnKey: { type: "string", enum: cellKeys.length ? cellKeys : ["__none__"] },
                  rawValue: nullableString(),
                },
                required: ["columnKey", "rawValue"],
                additionalProperties: false,
              },
            },
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  columnKey: { type: "string", enum: productKeys.length ? productKeys : ["__none__"] },
                  sourceBrand: nullableString(),
                  sourceProduct: nullableString(),
                  sourceSize: nullableString(),
                  sourceFormula: nullableString(),
                  suggestedSkuCode: nullableString(),
                },
                required: ["columnKey", "sourceBrand", "sourceProduct", "sourceSize", "sourceFormula"],
                additionalProperties: false,
              },
            },
            uncertainFields: { type: "array", items: { type: "string" } },
          },
          required: [
            "sectionId",
            "workDate",
            "sourceRowLabel",
            "sourceShift",
            "cells",
            "products",
            "uncertainFields",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["documentTitle", "detectedDepartment", "rows"],
    additionalProperties: false,
  };
}

export function buildVisionPrompt({ template, dateFrom, dateTo, shiftsBySection, catalog = [], scopesBySection = null }) {
  const sectionText = (template?.sections ?? []).map((section) => {
    const columns = (section.production_schedule_column_defs ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((column) => `${column.key}=${column.label} (${column.col_type}${column.group_label ? ` [${column.group_label}]` : ""})`)
      .join(", ");
    const shifts = (shiftsBySection?.get(section.id) ?? [])
      .map((shift) => `${shift.name} ${shift.startTime}-${shift.endTime}`)
      .join(", ");

    let catalogSummary = "";
    if (catalog?.length) {
      const categoryIds = scopesBySection?.get(section.id) ?? [];
      const scopedProducts = catalog.filter((p) =>
        p.hasBom && (!scopesBySection || isProductInImportScope(p, categoryIds))
      );
      if (scopedProducts.length) {
        const lines = scopedProducts.slice(0, 60).map((p) => {
          return `${p.skuCode}: ${p.brand ? `[${p.brand}] ` : ""}${p.name} (${p.unit || "-"})${p.formulaOptions?.length ? ` [สูตร: ${p.formulaOptions.map(f => f.formula_name || f.formula_code).join("/")}]` : ""}`;
        });
        catalogSummary = `\n  - รายการสินค้า Master Catalog ในระบบที่อนุญาตสำหรับ Section นี้:\n    * ${lines.join("\n    * ")}`;
      }
    }

    return `sectionId=${section.id}; section=${section.name}; columns=[${columns}]; shifts=[${shifts}]${catalogSummary}`;
  }).join("\n");

  return `คุณเป็นระบบถอดข้อมูลตารางแผนการผลิตภาษาไทยของโรงงาน KPF จากภาพเอกสาร
อ่านเฉพาะค่าที่มองเห็น ห้ามคาดเดาค่าที่ไม่มี และใช้ null สำหรับช่องว่าง เครื่องหมายขีด หรือข้อความอ่านไม่ได้
ช่วงวันที่แผนงานเบื้องต้นคือ ${dateFrom} ถึง ${dateTo} หากในหัวกระดาษหรือตารางระบุวันที่ชัดเจน (เช่น 05/10/2569 - 10/10/2569) ให้อ่านวันที่จริงตามที่ระบุในเอกสาร โดยแปลง พ.ศ. เป็น ค.ศ. (เช่น 2569 เป็น 2026) ในรูปแบบ YYYY-MM-DD

กฎการจับคู่ Section และตารางในเอกสาร:
สำหรับแผนกบิสกิต ทุก Section ใช้กะ 1 แต่เวลาเริ่มและเลิกงานอาจต่างกัน ให้อ่านเวลาจากหัวตารางของ Section นั้นและเก็บ sourceShift เช่น "กะ 1 (07:00-19:00)" หรือ "กะ 1 (07:00-17:00)" ห้ามใช้เวลาของ Section อื่นมาแทน และห้ามตีความช่วงเวลาเป็นชื่อกะใหม่ กฎนี้ไม่ใช้กับแผนกเวเฟอร์สติ๊กที่แยกกะ 1/2
1. หากเอกสารมีหลายตารางย่อยในใบเดียว ให้ดูชื่อหัวตารางเพื่อเลือก sectionId ให้ถูกต้อง:
   - ตารางที่มีหัวข้อ "ส่วนงานป้ายครีม" -> section "ส่วนงานป้ายครีม":
     * คอลัมน์เครื่องจักร: เครื่อง 1, 2 (หรือ "รอบบรรจุ") -> cell columnKey="machine"
     * คอลัมน์จำนวนงานที่ได้ (กระบะ, ปี๊บ, ลัง) -> cell columnKey="qty"
     * คอลัมน์หมายเหตุ: เช่น "OEM CJ / บรรจุ 400 g" -> cell columnKey="note"
     * หากเป็นแถวรอบบรรจุ หรือหมายเหตุ OEM CJ: sourceBrand="รอบบรรจุ", sourceSize="รอบบรรจุ"
     * กฎผลิตภัณฑ์: ในส่วนงานป้ายครีม หากในเอกสารระบุ "คุกกี้นม" (เช่น "คุกกี้นม ครีมวานิลลา", "คุกกี้นม ครีมทุเรียน", "คุกกี้นม ครีมช็อกฯ", "คุกกี้นม ครีมสตรอฯ") ให้ดึงชื่อตามที่ระบุ (สำหรับแบรนด์ KPF/แม่มะลิ จะตรงกับสินค้ากลุ่ม "แม่มะลิ คุกกี้ [รส]", สำหรับระฆังทองจะตรงกับกลุ่ม "คุกกี้แซนวิช")
     * "คุกกี้ก้นหอย" หรือ "ก้นหอย" เป็นคนละชนิดกับคุกกี้นม/แซนวิช ต้องเก็บคำว่า "ก้นหอย" ใน sourceProduct ตามแถวจริง ห้ามเปลี่ยนเป็นคุกกี้นมหรือคัดลอกชนิดจากแถวติดกัน (สำหรับแบรนด์ KPF/แม่มะลิ จะตรงกับสินค้ากลุ่ม "แม่มะลิ ก้นหอย [รส]")
   - ตารางที่มีหัวข้อ "ส่วนขนมปังกรอบบรรจุปี๊บ" -> section "ส่วนขนมปังกรอบบรรจุปี๊บ":
     * จำนวนคน: เช่น 3 -> cell columnKey="people"
     * จำนวนงานที่ได้ (ปี๊บ, ลัง) -> cell columnKey="qty"
     * sourceSize: "XL" (ปี๊บใหญ่ 5 กก.), "L" (ลัง 1.1 กก. กล่อง*6ปี๊บ)
     * ข้อยกเว้นเฉพาะ ABC/AEC: อ่าน ABC, A B C, AEC, A E C ตามใบและเก็บชื่อเดิม ระบบถือเป็นตระกูล ABC เดียวกัน (แบรนด์ KPF/แม่มะลิ ตรงกับ "แม่มะลิ AEC รสเค็ม"; แบรนด์ระฆังทอง ตรงกับ "ขนมปังกรอบ รสเค็มรูป ABC"); XL = 4 กก. ไม่ใช่ 5 กก.; L = 1.1 กก. ไม่ใช่ 1.2 กก.; หากระบุ "ลัง 4 กก." เก็บให้ครบและใช้หน่วย master "กล่อง" ห้ามเปลี่ยนแบรนด์หรือคัดลอกไซส์จากแถวอื่น กฎนี้ไม่ใช้กับสินค้าอื่น
   - ตารางที่มีหัวข้อ "ส่วนงานป้ายแยม / เรือนจำ":
     * คอลัมน์ฝั่งซ้าย (หัวตารางสีเขียว ป้ายแยม):
       - sectionId -> section "ส่วนงานป้ายแยม"
       - อ่านแบรนด์แยกตามแต่ละแถวจากเอกสาร ห้ามเปลี่ยน "ระฆังทอง" เป็น "รอบรรจุ" และห้ามคัดลอกแบรนด์จากแถวอื่น
       - เฉพาะแถวที่แบรนด์เขียน "รอบรรจุ" (หรือ "รอบบรรจุ") หมายถึงเนื้อขนม WIP ไม่ใช่ทุกแถวในส่วนงานป้ายแยม
       - ชนิดผลิตภัณฑ์: เช่น "ขนมปังกรอบ แยมสตรอฯ", "เนื้อขนม BEEVER สับปะรด", "เนื้อขนม BEEVER สตรอฯ", "ขนมปังกรอบ แยมสับปะรด"
       - ไซส์: sourceSize="-" ตามช่องขีดในเอกสาร ห้ามใช้แบรนด์มาเติมเป็นไซส์
       - อ่านรสตามจริง รวมถึงบลูเบอร์รี่ ห้ามเปลี่ยนบลูเบอร์รี่เป็นสตรอหรือสับปะรด
       - จำนวนคน: cell columnKey="jamPeople"
       - จำนวนงานที่ได้ (กระบะ): cell columnKey="jamQty"
     * คอลัมน์ฝั่งขวา (หัวตารางสีฟ้าอ่อน บรรจุปี๊บงานเรือนจำ):
       - ข้อสำคัญ: วันที่ช่องฝั่งขวาเป็นลายตารางสีเทา แรเงา หรือว่าง ห้ามสร้างแถวเรือนจำเด็ดขาด! อ่านวันที่จากเอกสารและดึงเฉพาะแถวที่มีข้อมูลผลิตจริง ห้ามยึดวันที่จากตัวอย่างอื่น
       - sectionId -> section "บรรจุปี๊บงานเรือนจำ"
       - แบรนด์: sourceBrand="แม่มะลิ" หรือ "ระฆังทอง"
       - ชนิดผลิตภัณฑ์: sourceProduct="ขนมปังกรอบ แยมสับปะรด"
       - ไซส์: sourceSize="XL", "L", หรือ "ลัง 5 กก"
       - จำนวนคน: cell columnKey="people"
       - จำนวน (ปี๊บ, ลัง): cell columnKey="qty"
   - ข้อสำคัญ: ไม่ต้องสร้างแถวสำหรับ section "เครื่องบรรจุแนวนอน" หรือ "งานห้องบรรจุ 400 กรัม" เนื่องจากในเอกสารไม่มี
   - แผนกเวเฟอร์สติ๊ก (เตา 2 เลน & 3 เลน):
     * คอลัมน์เครื่องจักรและเตา:
       - machine = "3 เลน", furnace_name = "เตา 3" (หรือ "2 เลน", "เตา 2")
       - ข้อสำคัญ: ช่องเตาที่เป็นสีเทา ลายจุด แรเงา หรือว่าง (เช่น เตา 2 เลน) คือเตาที่ไม่ได้เดินเครื่อง ห้ามสร้าง row ออกมาเด็ดขาด! ดึงเฉพาะเตาที่มีรายการผลิตจริง (เช่น เตา 3 เลน)
     * การแยกกลุ่มกะ 1 และ กะ 2:
       - ในตารางจะมีกลุ่มคอลัมน์ "กะ 1" และ "กะ 2" โดยแต่ละกะจะมีคอลัมน์ย่อยคือ:
         ชุดแป้ง -> cell columnKey="qty"
         ขนมที่เดินงานได้ (กก.) -> cell columnKey="daily_yield_kg"
         จำนวนบรรจุ (ปี๊บ/ลัง) -> cell columnKey="target_packages"
       - กฎการสร้างแถวตามกะ:
         1. หากวันนั้นผลิตสินค้าเดียวกันทั้ง 2 กะ (มีตัวเลขทั้งกะ 1 และกะ 2):
            ให้แตกเป็น 2 rows แถวแรก sourceShift="กะ 1" และแถวที่สอง sourceShift="กะ 2"
         2. หากวันนั้นแบ่งเป็น 2 บรรทัดย่อย (บรรทัดแรกผลิตเฉพาะกะ 1 กะ 2 เป็นขีด '-', บรรทัดสองผลิตเฉพาะกะ 2 กะ 1 เป็นขีด '-'):
            สร้างเฉพาะแถวของกะที่มีตัวเลขจริง (กะใดเป็นเครื่องหมายขีด '-' ห้ามสร้างแถวออกมาเด็ดขาด)
     * แบรนด์ (sourceBrand):
       - ถ้าในเอกสารเขียน "KPF" ให้ใส่ sourceBrand="KPF" (ในแผนกสติ๊ก หมายถึงสินค้าที่ขึ้นต้นด้วย "แม่มะลิ")
       - ถ้าในเอกสารเขียน "ระฆังทอง" ให้ใส่ sourceBrand="ระฆังทอง"
     * ชนิดผลิตภัณฑ์ (sourceProduct):
       - อ่านข้อความให้ครบถ้วน เช่น "เรนโบว์ ครีมช็อกฯ", "สติ๊ก ครีมช็อกฯ", "สติ๊ก ครีมส้ม", "เรนโบว์ ครีมส้ม", "แฟนซี สตรอ - ช็อก ครีมสตรอฯ", "สติ๊กลายจุด ครีมช็อกฯ"
       - "สติ๊ก" ธรรมดา, "สติ๊กลายจุด", "เรนโบว์" และ "แฟนซี" เป็นคนละชนิด ห้ามเติมหรือเปลี่ยนชนิดจากการคาดเดารสชาติหรือขนาด
     * ไซส์ (sourceSize):
       - หากระบุ 180g หรือ 400g ให้เก็บขนาดกรัมตามต้นฉบับ ห้ามแปลงเป็น L, XL, 1.1 กก. หรือ 5 กก.
       - อ่านชื่อรุ่น เช่น Switzerland ไว้ใน sourceProduct ตามจริง แต่ห้ามเติมชื่อรุ่นเมื่อไม่มีในเอกสาร
       - "XL" (ปี๊บใหญ่ 5 กก.) ให้ใส่ sourceSize="XL"
       - "L" (ปี๊บเล็ก 1.1 กก. บรรจุลัง 6 ปี๊บ) ให้ใส่ sourceSize="L"
   - แผนกขาไก่: ตารางมีแบรนด์ (ระฆังทอง, เนื้อขนม), ชนิดผลิตภัณฑ์, ไซส์, น้ำหนักบรรจุ, จำนวนชุดแป้ง, น้ำหนัก, จำนวนบรรจุ

2. การแยกแถวสินค้า และแถวบำรุงรักษา:
   - สร้างหนึ่ง output row ต่อหนึ่งรายการผลิตต่อหนึ่งกะ
   - หากเป็นแถวล้างเตาอบ ทำความสะอาด หรือซ่อมบำรุง (เช่น "ล้างเตาอบไอน้ำ / เตาเบิร์นเนอร์") ให้ใส่ข้อความในคอลัมน์ note และเว้น products ให้ sourceProduct=null

3. คอลัมน์สินค้าและการระบุไซส์ (products):
   - สำหรับ sku_picker:
     * ให้เก็บข้อความที่มองเห็นจริงลง products (sourceBrand, sourceProduct, sourceSize, sourceFormula)
     * หากสามารถเทียบกับรายการ Master Catalog ของ Section นั้นได้อย่างมั่นใจ ให้ระบุ suggestedSkuCode ด้วย (เช่น "B01-1001", "B01-1019", "BL0-5005", "B03-0014") หากไม่มั่นใจให้ระบุ null
   - sourceSize:
     * หากระบุ "บรรจุลัง" หรือ "ลัง" (สำหรับขาไก่) ให้ใส่ sourceSize="บรรจุลัง" (หมายถึงสินค้าหน่วยเป็นถุง เช่น 1ถุง)
     * หากระบุ "XL" (4-5 กก.) ให้ใส่ sourceSize="XL" (หมายถึงสินค้าบรรจุปี๊บ)
     * หากระบุ "L" (1.1 กก.) ให้ใส่ sourceSize="L" (หมายถึงสินค้าบรรจุปี๊บ หรือลัง 6 ปี๊บ)
     * หากระบุ "เนื้อขนม" หรือ "รอบบรรจุ" ให้ใส่ sourceProduct="เนื้อขนม..." (หมายถึง WIP)
   - สำหรับ brand_auto ห้ามใส่ใน cells เพราะระบบจะเติมจากสินค้า master อัตโนมัติ

Template: ${template?.name || "-"}
${sectionText}`;
}

function tokenize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ช็อค/g, "ช็อก")
    .replace(/สตรอเบอร์รี่|สตรอเบอรี่|สตรอฯ/g, "สตรอ")
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((token) => token.length >= 2);
}

function buildProductPatch(column, product, formula) {
  const patch = { [column.key]: product.name };
  if (column.auto_fill_field) patch[column.auto_fill_field] = product.brand;
  patch.formulaCode = formula?.formula_code ?? null;
  patch.formulaName = formula?.formula_name ?? null;
  patch.bomVersionId = formula?.bom_version_id ?? null;
  patch.formula_code = patch.formulaCode;
  patch.formula_name = patch.formulaName;
  patch.bom_version_id = patch.bomVersionId;
  return patch;
}

export function buildSectionProductOptions(section, catalog, categoryIds) {
  const products = catalog.filter(product => isProductInImportScope(product, categoryIds) && product.hasBom);
  return Object.fromEntries((section.production_schedule_column_defs ?? [])
    .filter(column => column.col_type === "sku_picker")
    .map(column => [column.key, products.flatMap(product => (product.formulaOptions ?? []).map(formula => ({
      selectionKey: `${product.skuCode}::${formula.formula_code}`,
      skuCode: product.skuCode,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      formulaCode: formula.formula_code,
      formulaName: formula.formula_name,
      rowPatch: buildProductPatch(column, product, formula),
    })))]));
}

function explicitGramWeight(value) {
  const match = String(value || "").normalize("NFKC").toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(?:กรัม|ก(?![ก-๙])\.?|g\b)/u);
  return match ? Number(match[1]) : null;
}

function matchesWaferProduct(source, product, section) {
  if (!/เวเฟอร์สติ๊ก|สติ๊ก|เรนโบว์|แฟนซี/.test(`${section?.name || ""} ${source?.sourceProduct || ""}`)) return true;
  if (!/สติ๊ก|เรนโบว์|แฟนซี/.test(product.name)) return false;
  const sourceName = normalizeImportText(source?.sourceProduct);
  const productName = normalizeImportText(product.name);
  for (const family of ["ลายจุด", "เรนโบว์", "แฟนซี"]) {
    if (sourceName.includes(family) !== productName.includes(family)) return false;
  }
  const flavors = ["ช็อก", "สตรอ", "ส้ม", "ใบเตย"];
  if (flavors.some((flavor) => sourceName.includes(flavor))
    && flavors.some((flavor) => sourceName.includes(flavor) !== productName.includes(flavor))) return false;
  const grams = explicitGramWeight(source?.sourceSize) ?? explicitGramWeight(source?.sourceProduct);
  if (grams === null) return true;
  // Printed model names may be absent from master data; explicit pack weight must still match.
  return /เวเฟอร์สติ๊ก|สติ๊ก/.test(product.name)
    && explicitGramWeight(product.name) === grams;
}

function matchesJamProduct(source, product, section) {
  if (!/ป้ายแยม|เรือนจำ/.test(section?.name || "")) return true;
  const sourceName = normalizeImportText(source?.sourceProduct);
  const productName = normalizeImportText(product.name);
  const brand = normalizeImportText(source?.sourceBrand);
  const wantsWip = /รอ(?:บ)?บรรจุ|เนื้อขนม/.test(`${brand} ${sourceName}`);
  const isWip = product.itemType === "WIP" || /^WKB-/.test(product.skuCode) || /เนื้อขนม/.test(productName);
  if (wantsWip && !isWip) return false;
  if (!wantsWip && /ระฆังทอง|แม่มะลิ|kpf/.test(brand)) {
    if (isWip) return false;
    const expectedBrand = /kpf|แม่มะลิ/.test(brand) ? /แม่มะลิ|เคพีเอฟ|kpf/ : /ระฆังทอง/;
    if (!expectedBrand.test(normalizeImportText(`${product.brand} ${product.name}`))) return false;
  }
  const flavors = [/บลู|blueberry/, /สตรอ/, /สับปะรด|สัปปะรด|สัปบะรด/];
  if (flavors.some((flavor) => flavor.test(sourceName))
    && flavors.some((flavor) => flavor.test(sourceName) !== flavor.test(productName))) return false;
  return !/beever|บีเวอร์/.test(sourceName) || /beever|บีเวอร์/.test(productName);
}

function packWeightGrams(value) {
  const match = String(value || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(กก\.?|kg\b|กรัม|ก\.|g\b)/u);
  return match ? Number(match[1]) * (/กก|kg/.test(match[2]) ? 1000 : 1) : null;
}

function isAbcTinSource(source, section) {
  return /ขนมปังกรอบบรรจุปี๊บ/.test(section?.name || "")
    && /\ba\s*[be]\s*c\b/i.test(String(source?.sourceProduct || "").normalize("NFKC"));
}

export function matchesImportProduct(source, product, section) {
  if (!product?.hasBom || !matchesWaferProduct(source, product, section) || !matchesJamProduct(source, product, section)) return false;
  const cream = /ป้ายครีม/.test(section?.name || "");
  const tin = /ขนมปังกรอบบรรจุปี๊บ/.test(section?.name || "");
  const wafer = /เวเฟอร์สติ๊ก|สติ๊ก/.test(`${section?.name || ""} ${source?.sourceProduct || ""}`);
  const prison = /เรือนจำ/.test(section?.name || "");
  if (!cream && !tin && !wafer && !prison) return true;
  const name = normalizeImportText(product.name);
  const text = normalizeImportText(source?.sourceProduct);
  const abcTin = isAbcTinSource(source, section);
  if (abcTin && !/\ba\s*[be]\s*c\b/.test(name)) return false;
  const brand = normalizeImportText(source?.sourceBrand);
  const wip = /รอ(?:บ)?บรรจุ|เนื้อขนม/.test(`${brand} ${text}`);
  const productWip = product.itemType === "WIP" || /^WKB-/.test(product.skuCode) || /เนื้อขนม/.test(name);
  if (wip !== productWip) return false;
  const productBrand = normalizeImportText(`${product.brand} ${product.name}`);
  const isMaeMali = /แม่มะลิ|kpf|เคพีเอฟ/.test(productBrand);
  if (cream && /คุกกี้|ก้นหอย|แซนวิช|แซนวิส/.test(text)) {
    if ((!/คุกกี้/.test(name) && !/ก้นหอย/.test(name)) || /แยม/.test(name)) return false;
    if (/ก้นหอย/.test(text) && (!/ก้นหอย/.test(name) || /แซนวิช|แซนวิส/.test(name))) return false;
    if (/คุกกี้\s*นม|แซนวิช|แซนวิส/.test(text)) {
      if (/ก้นหอย/.test(name)) return false;
      if (isMaeMali && !/คุกกี้/.test(name)) return false;
      if (!isMaeMali && !/แซนวิช|แซนวิส/.test(name)) return false;
    }
    if (!/ก้นหอย/.test(text) && /ก้นหอย/.test(name)) return false;
  }
  if (tin && (/แยม|คุกกี้/.test(name) || (!/ขนมปังกรอบ|แครกเกอร์|งาหอม|สมุย/.test(name) && !/\ba\s*[be]\s*c\b/.test(name)))) return false;
  const flavors = [/วานิลลา|วนิลา/, /ทุเรียน/, /ใบเตย/, /กาแฟ/, /สตรอ/, /ช็อก/, /มะพร้าว/, /งาหอม|รสงา/];
  if (flavors.some(flavor => flavor.test(text))
    && flavors.some(flavor => flavor.test(text) !== flavor.test(name))) return false;
  if (/สมุย/.test(text) && !/สมุย/.test(name)) return false;
  if (!wip && /ระฆัง/.test(brand) && !/ระฆัง/.test(productBrand)) return false;
  if (!wip && /kpf|แม่มะลิ|เคพีเอฟ/.test(brand) && !/แม่มะลิ|เคพีเอฟ|kpf/.test(productBrand)) return false;
  const size = String(source?.sourceSize || "").toLowerCase();
  const requestedWeight = packWeightGrams(size) ?? (/\bxl\b/.test(size) ? (abcTin ? 4000 : 5000) : /\bl\b/.test(size) ? 1100 : null);
  if (abcTin && ![4000, 1100].includes(packWeightGrams(product.name))) return false;
  if (abcTin && /ลัง/.test(size) && !/^กล่อง(?:$|[\s*×x])/i.test(String(product.unit || "").trim())) return false;
  if (!wip && requestedWeight !== null && packWeightGrams(product.name) !== requestedWeight) return false;
  if (/ลัง/.test(size) && !/ลัง|ถุง|กล่อง/.test(`${product.name} ${product.unit}`)) return false;
  return true;
}

function candidateVariants(source, column, catalog, section = null, rowData = null) {
  const sourceProduct = normalizeImportText(source?.sourceProduct);
  const sourceBrand = normalizeImportText(source?.sourceBrand);
  const sourceSize = normalizeImportText(source?.sourceSize);
  const sourceFormula = normalizeImportText(source?.sourceFormula);
  const sourceTokens = new Set(tokenize(`${source?.sourceProduct || ""} ${source?.sourceSize || ""}`));

  const rawBrand = String(source?.sourceBrand || "").trim();
  const rawBrandUpper = rawBrand.toUpperCase();
  const isKpfBrand = rawBrandUpper === "KPF" || rawBrandUpper === "เคพีเอฟ" || rawBrandUpper.includes("KPF") || /แม่มะลิ/.test(rawBrand);
  const isRakhangBrand = /ระฆัง/.test(rawBrand);
  const isPrisonSection = /เรือนจำ/.test(section?.name || "");

  // ตรวจสอบแผนก:
  const isChickenDept = /ขาไก่/.test(section?.name || "") || /ขาไก่/.test(sourceProduct);
  const isWaferStickDept = /เวเฟอร์สติ๊ก|สติ๊ก/i.test(section?.name || "")
    || /สติ๊ก|เรนโบว์|แฟนซี/.test(sourceProduct);
  const isBiscuitDept = /บิสกิต|ป้ายครีม|ป้ายแยม|เรือนจำ|ขนมปังกรอบ/.test(section?.name || "")
    || /คุกกี้|งาหอม|สมุย|บีเวอร์|beever|แครกเกอร์|ออลพาย|allpine|โคบิส/.test(sourceProduct);
  const rowSizeStr = String(rowData?.size || source?.sourceSize || "").trim();
  const isDashSize = !rowSizeStr || rowSizeStr === "-" || rowSizeStr === "—" || rowSizeStr === "--";

  return catalog
    .filter((product) => matchesImportProduct(source, product, section))
    .map((product) => {
      const normalizedName = normalizeImportText(product.name);
      const normalizedBrand = normalizeImportText(product.brand);
      const nameTokens = tokenize(product.name);
      const overlap = [...sourceTokens].filter((sourceToken) =>
        normalizedName.includes(sourceToken)
        || nameTokens.some((nameToken) => sourceToken.includes(nameToken))
      ).length;
      let score = overlap * 10;
      if (sourceProduct && normalizedName === sourceProduct) score += 1000;
      if (sourceProduct && (normalizedName.includes(sourceProduct) || sourceProduct.includes(normalizedName))) score += 100;
      if (sourceBrand && normalizedBrand && (normalizedBrand.includes(sourceBrand) || sourceBrand.includes(normalizedBrand))) score += 50;
      if (source?.suggestedSkuCode && String(source.suggestedSkuCode).trim().toUpperCase() === product.skuCode.toUpperCase()) {
        score += 2500;
      }

      // Brand mapping rules:
      // KPF -> แม่มะลิ หรือ เคพีเอฟ (สำหรับเวเฟอร์สติ๊ก และบิสกิต KPF = แม่มะลิ)
      // ระฆังทอง -> ระฆังทอง
      if (isKpfBrand) {
        if (/แม่มะลิ|เคพีเอฟ|kpf/.test(normalizedName) || /แม่มะลิ|เคพีเอฟ|kpf/.test(normalizedBrand) || product.skuCode.startsWith("V17-") || (isBiscuitDept && (product.skuCode.startsWith("B01-") || product.skuCode.startsWith("B03-") || product.skuCode.startsWith("B06-")))) {
          score += (isWaferStickDept || isBiscuitDept ? 2500 : 400);
        } else if (/ระฆัง/.test(normalizedName) || /ระฆัง/.test(normalizedBrand) || product.skuCode.startsWith("VL0-") || (isBiscuitDept && product.skuCode.startsWith("BL0-"))) {
          score -= (isWaferStickDept || isBiscuitDept ? 2500 : 600);
        }
      } else if (isRakhangBrand) {
        if (/ระฆัง/.test(normalizedName) || /ระฆัง/.test(normalizedBrand) || product.skuCode.startsWith("VL0-") || (isBiscuitDept && product.skuCode.startsWith("BL0-"))) {
          score += (isWaferStickDept || isBiscuitDept ? 2500 : 400);
        } else if (/แม่มะลิ|เคพีเอฟ/.test(normalizedName) || /แม่มะลิ|เคพีเอฟ/.test(normalizedBrand) || product.skuCode.startsWith("V17-") || (isBiscuitDept && (product.skuCode.startsWith("B01-") || product.skuCode.startsWith("B03-") || product.skuCode.startsWith("B06-")))) {
          score -= (isWaferStickDept || isBiscuitDept ? 2500 : 600);
        }
      }

      // Factory Domain Knowledge:
      // 1. "เนื้อขนม" หรือ "รอบรรจุ" = WIP
      const isWipBrand = /เนื้อขนม|รอ(?:บ)?บรรจุ/.test(rawBrand);
      const isWipRequested = /เนื้อขนม|รอ(?:บ)?บรรจุ/.test(`${sourceBrand} ${sourceProduct} ${sourceSize}`)
        || isWipBrand
        || (isChickenDept && isDashSize);

      const isProductWip = product.itemType === "WIP" || /เนื้อขนม/.test(product.name);

      if (isWipRequested) {
        if (isProductWip) score += 3000;
        else score -= 3000;
      } else {
        if (isProductWip) score -= 1500;
        else score += 100;
      }

      // 2. แผนกเวเฟอร์สติ๊ก (Wafer Stick Domain Knowledge):
      if (isWaferStickDept) {
        // Size & Packaging: XL = 5 กก. ปี๊บใหญ่, L = 1.1 กก. กล่อง*6ปี๊บ (ลัง)
        const isStickXl = /\bxl\b/.test(sourceSize) || /\bxl\b/.test(sourceProduct) || /ปี๊บ/.test(sourceSize);
        const isStickL = /\bl\b/.test(sourceSize) || /\bl\b/.test(sourceProduct) || /ลัง/.test(sourceSize) || /1\.1/.test(sourceSize);

        const is5KgPail = /5\s*กก|5000/.test(product.name) || /ปี๊บ.*5กก|ปี๊บ\/5กก/.test(product.unit);
        const is11KgCarton = /1\.1\s*กก|1100/.test(product.name) || /กล่อง\*6ปี๊บ|กล่อง/.test(product.unit);

        if (isStickXl) {
          if (is5KgPail) score += 2000;
          if (is11KgCarton) score -= 2000;
        } else if (isStickL) {
          if (is11KgCarton) score += 2000;
          if (is5KgPail) score -= 2000;
        }

        // ชนิดสายผลิตภัณฑ์สติ๊ก:
        // 2.1 เรนโบว์ (Rainbow)
        const isSourceRainbow = /เรนโบว์/.test(sourceProduct);
        const isProdRainbow = /เรนโบว์/.test(normalizedName);
        if (isSourceRainbow) {
          if (isProdRainbow) score += 1800;
          else score -= 1800;
        } else {
          if (isProdRainbow) score -= 800;
        }

        // 2.2 แฟนซี (Fancy)
        const isSourceFancy = /แฟนซี|สตรอ\s*-\s*ช็อก|ส้ม\s*-\s*ช็อก|ใบเตย\s*-\s*ช็อก|สตรอ\s*-\s*ใบเตย/.test(sourceProduct);
        const isProdFancy = /แฟนซี/.test(normalizedName);
        if (isSourceFancy) {
          if (isProdFancy) score += 1800;
          else score -= 1800;
        } else {
          if (isProdFancy) score -= 800;
        }

        // 2.3 ลายจุด (Polka dot)
        const isSourcePolka = /ลายจุด/.test(sourceProduct);
        const isProdPolka = /ลายจุด/.test(normalizedName);
        if (isSourcePolka) {
          if (isProdPolka) score += 2500;
          else score -= 2500;
        } else {
          if (isProdPolka) score -= 1500;
        }

        // 2.4 Flavor matching (รสชาติเฉพาะของสติ๊ก)
        const hasChoc = /ช็อก|ช็อค/.test(sourceProduct);
        const hasOrange = /ส้ม/.test(sourceProduct);
        const hasStraw = /สตรอ/.test(sourceProduct);
        const hasPandan = /ใบเตย/.test(sourceProduct);

        const prodHasChoc = /ช็อก|ช็อค/.test(normalizedName);
        const prodHasOrange = /ส้ม/.test(normalizedName);
        const prodHasStraw = /สตรอ/.test(normalizedName);
        const prodHasPandan = /ใบเตย/.test(normalizedName);

        if (hasStraw && hasChoc) {
          if (prodHasStraw && prodHasChoc) score += 1200;
          if (prodHasOrange || prodHasPandan) score -= 1000;
        } else if (hasPandan && hasChoc) {
          if (prodHasPandan && prodHasChoc) score += 1200;
          if (prodHasOrange || prodHasStraw) score -= 1000;
        } else if (hasOrange && hasChoc) {
          if (prodHasOrange && prodHasChoc) score += 1200;
          if (prodHasStraw || prodHasPandan) score -= 1000;
        } else {
          if (hasChoc && !hasStraw) {
            if (prodHasChoc && !prodHasStraw) score += 800;
            if (prodHasOrange || prodHasPandan || prodHasStraw) score -= 800;
          }
          if (hasOrange && !hasChoc) {
            if (prodHasOrange && !prodHasChoc) score += 800;
            if (prodHasChoc || prodHasStraw || prodHasPandan) score -= 800;
          }
          if (hasStraw && !hasChoc) {
            if (prodHasStraw && !prodHasChoc) score += 800;
            if (prodHasChoc || prodHasOrange || prodHasPandan) score -= 800;
          }
          if (hasPandan && !hasChoc) {
            if (prodHasPandan && !prodHasChoc) score += 800;
            if (prodHasChoc || prodHasOrange || prodHasStraw) score -= 800;
          }
        }
      }

      // 2.5 แผนกบิสกิต (Biscuit Department Domain Knowledge):
      if (isBiscuitDept) {
        const is5KgBag = /ลัง\s*5\s*กก|5\s*กก.*ถุง|ถุง.*5\s*กก/.test(`${sourceSize} ${sourceProduct}`);
        const isBiscuitXl = !is5KgBag && (/\bxl\b/.test(sourceSize) || /\bxl\b/.test(sourceProduct) || /ปี๊บ/.test(sourceSize));
        const isBiscuitL = !is5KgBag && (/\bl\b/.test(sourceSize) || /\bl\b/.test(sourceProduct) || /ลัง/.test(sourceSize) || /1\.1/.test(sourceSize));

        const is5KgPail = (/5\s*กก|5000/.test(product.name) || /ปี๊บ.*5กก|ปี๊บ\/5กก/.test(product.unit)) && (/ปี๊บ/.test(product.unit) || /ปี๊บ/.test(product.name));
        const is11KgCarton = (/1\.1\s*กก|1100|1\.2\s*กก/.test(product.name) || /กล่อง\*6ปี๊บ/.test(product.unit)) && !/5\s*กก/.test(product.name);
        const isProd5KgBag = /5\s*กก.*ถุง|1ถุง|กล่อง\*1ถุง/.test(`${product.name} ${product.unit}`);

        if (isAbcTinSource(source, section)) {
          // ABC packaging has its own exact weight/unit guards before ranking.
          score += 2000;
        } else if (is5KgBag) {
          if (isProd5KgBag || product.skuCode === "BL0-5030") score += 3000;
          else score -= 2000;
        } else if (isBiscuitXl) {
          if (is5KgPail) score += 2000;
          if (is11KgCarton) score -= 2000;
          if (isProd5KgBag) score -= 2000;
        } else if (isBiscuitL) {
          if (is11KgCarton) score += 2000;
          if (is5KgPail) score -= 2000;
          if (isProd5KgBag) score -= 2000;
        }

        // คุกกี้แซนวิช (คุกกี้นม) vs คุกกี้ก้นหอย:
        // ในแผนกบิสกิต โดยเฉพาะส่วนงานป้ายครีม "คุกกี้นม" คือ "คุกกี้แซนวิช" (หรือ คุกกี้แซนวิส)
        const isMilkCookie = /คุกกี้นม/.test(sourceProduct) || /คุกกี้นม/.test(source?.sourceProduct || "");
        const isSandwich = /แซนวิช|แซนวิส/.test(sourceProduct) || isMilkCookie;
        const isKonhoy = /ก้นหอย/.test(sourceProduct);

        const prodIsSandwich = /แซนวิช|แซนวิส/.test(normalizedName) || (isMilkCookie && isKpfBrand && /คุกกี้/.test(normalizedName) && !/ก้นหอย/.test(normalizedName));
        const prodIsKonhoy = /ก้นหอย/.test(normalizedName);

        if (isSandwich && !isKonhoy) {
          if (prodIsSandwich) score += 2000;
          else if (prodIsKonhoy) score -= 2500;
        } else if (isKonhoy) {
          if (prodIsKonhoy) score += 1500;
          else if (prodIsSandwich) score -= 2500;
        }

        // คุกกี้ (แซนวิช / ก้นหอย) ให้แยกคะแนนตามรสชาติอย่างเข้มงวด:
        if (isSandwich || isKonhoy) {
          const hasVanilla = /วานิลลา|วนิลา/.test(sourceProduct);
          const hasDurian = /ทุเรียน/.test(sourceProduct);
          const hasPandan = /ใบเตย/.test(sourceProduct);
          const hasCoffee = /กาแฟ/.test(sourceProduct);
          const hasStraw = /สตรอ/.test(sourceProduct);
          const hasChoc = /ช็อก|ช็อค/.test(sourceProduct);

          const prodHasVanilla = /วานิลลา|วนิลา/.test(normalizedName);
          const prodHasDurian = /ทุเรียน/.test(normalizedName);
          const prodHasPandan = /ใบเตย/.test(normalizedName);
          const prodHasCoffee = /กาแฟ/.test(normalizedName);
          const prodHasStraw = /สตรอ/.test(normalizedName);
          const prodHasChoc = /ช็อก|ช็อค/.test(normalizedName);

          if (hasVanilla) {
            if (prodHasVanilla) score += 1500;
            else if (prodHasDurian || prodHasPandan || prodHasCoffee || prodHasStraw || prodHasChoc) score -= 2000;
          } else if (hasDurian) {
            if (prodHasDurian) score += 1500;
            else if (prodHasVanilla || prodHasPandan || prodHasCoffee || prodHasStraw || prodHasChoc) score -= 2000;
          } else if (hasPandan) {
            if (prodHasPandan) score += 1500;
            else if (prodHasVanilla || prodHasDurian || prodHasCoffee || prodHasStraw || prodHasChoc) score -= 2000;
          } else if (hasCoffee) {
            if (prodHasCoffee) score += 1500;
            else if (prodHasVanilla || prodHasDurian || prodHasPandan || prodHasStraw || prodHasChoc) score -= 2000;
          } else if (hasStraw) {
            if (prodHasStraw) score += 1500;
            else if (prodHasVanilla || prodHasDurian || prodHasPandan || prodHasCoffee || prodHasChoc) score -= 2000;
          } else if (hasChoc) {
            if (prodHasChoc) score += 1500;
            else if (prodHasVanilla || prodHasDurian || prodHasPandan || prodHasCoffee || prodHasStraw) score -= 2000;
          }
        }

        if ((isBiscuitXl || isBiscuitL) && (product.itemType === "WIP" || /^WKB-/.test(product.skuCode) || /เนื้อขนม|แผนคุกกี้/.test(product.name))) {
          score -= 3000;
        }

        // ขนมปังกรอบ & แครกเกอร์:
        const isNgahom = /งาหอม/.test(sourceProduct);
        const isCoconut = /มะพร้าว/.test(sourceProduct);
        const isSamui = /สมุย/.test(sourceProduct);

        const prodIsNgahom = /งาหอม|รสงา/.test(normalizedName);
        const prodIsCoconut = /มะพร้าว/.test(normalizedName);
        const prodIsSamui = /สมุย/.test(normalizedName);

        if (isNgahom) {
          if (prodIsNgahom) score += 1500;
          else if (prodIsCoconut || prodIsSamui) score -= 2000;
        } else if (isCoconut) {
          if (prodIsCoconut) score += 1500;
          else if (prodIsNgahom || prodIsSamui) score -= 2000;
        } else if (isSamui) {
          if (prodIsSamui) score += 1500;
          else if (prodIsNgahom) score -= 2000;
        }

        // ป้ายแยม & เรือนจำ:
        const isPineapple = /สับปะรด|สัปปะรด/.test(sourceProduct);
        const isStrawberry = /สตรอ/.test(sourceProduct);
        const isBeever = /beever|บีเวอร์/.test(sourceProduct);

        const prodIsPineapple = /สับปะรด|สัปปะรด/.test(normalizedName);
        const prodIsStrawberry = /สตรอ/.test(normalizedName);
        const prodIsBeever = /beever|บีเวอร์/.test(normalizedName);

        if (isBeever) {
          if (prodIsBeever) score += 1500;
          else score -= 1500;
        }

        if (isPineapple) {
          if (prodIsPineapple) score += 1000;
          if (prodIsStrawberry) score -= 1500;
        } else if (isStrawberry) {
          if (prodIsStrawberry) score += 1000;
          if (prodIsPineapple) score -= 1500;
        }
      }

      // 3. Size & Packaging rules ทั่วไป (เช่น ขาไก่ บรรจุลัง 5000 กรัม = ถุง 5 กก.):
      const packWeight = Number(rowData?.packWeight || 0);
      const sizeContext = `${sourceSize || ""} ${sourceProduct || ""} ${rowData?.size || ""}`.toLowerCase();
      const isCarton = !isWaferStickDept && !isBiscuitDept && /บรรจุลัง|ลัง|ถุง|bag/.test(sizeContext);
      const is5000g = packWeight === 5000 || /5000|5\s*กก/.test(`${sizeContext} ${source?.sourceProduct || ""}`);

      const isXl = !isWaferStickDept && !isBiscuitDept && !isCarton && (/\bxl\b|5\s*กก|5000|4\s*กก|4000/.test(sizeContext));
      const isL = !isWaferStickDept && !isBiscuitDept && !isCarton && !isXl && (/\bl\b|1\.1|1100/.test(sizeContext));

      const productUnit = `${product.unit || ""}`.toLowerCase();
      const productName = `${product.name || ""}`.toLowerCase();
      const isProductBag = /ถุง/.test(productUnit) || /ถุง|1ถุง/.test(productName);
      const isProductPail = /ปี๊บ/.test(productUnit) || /ปี๊บ/.test(productName);

      if (isCarton) {
        if (isProductBag) score += (is5000g ? 1600 : 1200);
        if (isProductPail) score -= 1500;
      } else if (isXl || isL) {
        if (isProductPail) score += 800;
        if (isProductBag) score -= 1200;
      }

      const productHas5Kg = /5\s*กก|4\s*กก|5\.5\s*กก|5000/.test(productName);
      const productHas11Kg = /1\.1\s*กก|1\.2\s*กก|1100/.test(productName);

      if (isXl) {
        if (productHas5Kg) score += 600;
        else if (productHas11Kg) score -= 600;
      }
      if (isL) {
        if (productHas11Kg) score += 600;
        else if (productHas5Kg) score -= 600;
      }

      // 4. Flavor specificity สำหรับแผนกอื่นๆ (5 รส vs ดั้งเดิม)
      const isFiveSpices = /5\s*รส|ทรงเครื่อง/.test(sourceProduct);
      const isOriginal = /ดั้งเดิม/.test(sourceProduct);
      const prodIsFiveSpices = /5\s*รส|ทรงเครื่อง/.test(product.name);
      const prodIsOriginal = /ดั้งเดิม/.test(product.name);

      if (isFiveSpices) {
        if (prodIsFiveSpices) score += 400;
        if (prodIsOriginal) score -= 600;
      }
      if (isOriginal) {
        if (prodIsOriginal) score += 400;
        if (prodIsFiveSpices) score -= 600;
      }

      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "th"))
    .slice(0, 8)
    .flatMap(({ product, score }) => {
      const formulas = product.formulaOptions ?? [];
      const matchedFormula = sourceFormula
        ? formulas.find((formula) => normalizeImportText(`${formula.formula_code} ${formula.formula_name}`)
          .includes(sourceFormula))
        : null;
      let choices = formulas;
      if (sourceFormula) {
        choices = matchedFormula ? [matchedFormula] : [];
      } else if (isPrisonSection) {
        // เฉพาะ section เรือนจำ: คัดเลือกสูตรที่มีคำว่า "เรือนจำ" หรือรหัส "RJ"
        const prisonFormulas = formulas.filter((f) =>
          /เรือนจำ/.test(f.formula_name || "") || String(f.formula_code).toUpperCase() === "RJ"
        );
        if (prisonFormulas.length > 0) choices = prisonFormulas;
      } else {
        // ส่วนงานปกติที่ไม่ใช่เรือนจำ: ให้ตัดสูตรเรือนจำออกหากมีสูตรปกติอื่น
        const standardFormulas = formulas.filter((f) =>
          !/เรือนจำ/.test(f.formula_name || "") && String(f.formula_code).toUpperCase() !== "RJ"
        );
        if (standardFormulas.length > 0) choices = standardFormulas;
      }

      return choices.map((formula) => ({
        selectionKey: `${product.skuCode}::${formula.formula_code}`,
        skuCode: product.skuCode,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        formulaCode: formula.formula_code,
        formulaName: formula.formula_name,
        score,
        rowPatch: buildProductPatch(column, product, formula),
      }));
    });
}

function resolveShift(sourceShift, shiftOptions) {
  const needle = normalizeImportText(sourceShift).replace(/\s/g, "");
  if (!needle) return null;
  return shiftOptions.find((shift) => {
    const values = [shift.id, shift.code, shift.name, `${shift.name}${shift.startTime}${shift.endTime}`]
      .map((value) => normalizeImportText(value).replace(/\s/g, ""));
    return values.some((value) => value && (value === needle || value.includes(needle) || needle.includes(value)));
  }) ?? null;
}

export function resolveVisionRows({ extraction, template, catalog, aliases, shiftsBySection, dateFrom, dateTo, scopesBySection }) {
  const sectionMap = new Map((template?.sections ?? []).map((section) => [section.id, section]));
  const aliasMap = new Map((aliases ?? []).map((alias) => [
    `${alias.section_def_id}::${alias.product_column_key}::${alias.source_signature}`,
    alias,
  ]));

  return (extraction?.rows ?? []).map((sourceRow, index) => {
    const section = sectionMap.get(sourceRow.sectionId);
    const columns = (section?.production_schedule_column_defs ?? []).slice().sort((a, b) => a.display_order - b.display_order);
    const columnMap = new Map(columns.map((column) => [column.key, column]));
    const rowData = Object.fromEntries(columns.map((column) => [column.key, null]));
    const issues = [];
    const warnings = [...new Set(sourceRow.uncertainFields ?? [])];

    if (!section) issues.push("ไม่พบ section ในเทมเพลตที่เลือก");
    if (!sourceRow.workDate) {
      issues.push("ไม่พบวันที่ผลิตในแถว");
    } else if (!isDateInRange(sourceRow.workDate, dateFrom, dateTo)) {
      warnings.push(`วันที่ ${sourceRow.workDate} อยู่นอกช่วงแผนเดิม (${dateFrom} ถึง ${dateTo})`);
    }

    (sourceRow.cells ?? []).forEach((cell) => {
      const column = columnMap.get(cell.columnKey);
      if (!column || ["brand_auto", "sku_picker", "shift"].includes(column.col_type)) return;
      if (column.col_type === "number") {
        const parsed = parseImportNumber(cell.rawValue);
        if (parsed === undefined) issues.push(`${column.label}: ตัวเลขไม่ถูกต้อง (${cell.rawValue})`);
        else rowData[column.key] = parsed;
      } else {
        const raw = String(cell.rawValue ?? "").trim();
        rowData[column.key] = EMPTY_MARKERS.has(raw.toLowerCase()) ? null : raw;
      }
    });

    const shiftColumn = columns.find((column) => column.col_type === "shift");
    if (shiftColumn) {
      const sectionShifts = shiftsBySection.get(section?.id) ?? [];
      const isBiscuit = /บิสกิต|ป้ายแยม|ป้ายครีม|เรือนจำ|ขนมปังกรอบ|บรรจุแนวนอน|ห้องบรรจุ 400/.test(`${template?.name || ""} ${section?.name || ""}`);
      const shift = isBiscuit
        ? sectionShifts.find((item) => /^(?:SHIFT[_ -]?0?1|S0?1|0?1)$/i.test(item.code || "")
          || /^กะ\s*0?1(?:\D|$)/.test(item.name || ""))
        : resolveShift(sourceRow.sourceShift, sectionShifts);
      if (!shift) {
        issues.push(`จับคู่กะไม่ได้: ${sourceRow.sourceShift || "ไม่มีข้อมูล"}`);
      } else {
        const printedTime = isBiscuit ? String(sourceRow.sourceShift || "").match(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[.:]([0-5]\d)\b/) : null;
        const startTime = printedTime ? `${printedTime[1].padStart(2, "0")}:${printedTime[2]}` : shift.startTime;
        const endTime = printedTime ? `${printedTime[3].padStart(2, "0")}:${printedTime[4]}` : shift.endTime;
        rowData[shiftColumn.key] = `${shift.name} (${startTime}-${endTime})`;
        rowData.shiftId = shift.id;
        rowData.shiftCode = shift.code;
        rowData.shiftName = shift.name;
        rowData.workStartTime = startTime;
        rowData.workEndTime = endTime;
      }
    }

    const hasNoteContent = Boolean(rowData.note && String(rowData.note).trim());
    const hasAnyValidProductSource = (sourceRow.products ?? []).some(
      (p) => p.sourceProduct && !EMPTY_MARKERS.has(String(p.sourceProduct).trim().toLowerCase())
    );
    const isMaintenanceRow = hasNoteContent && !hasAnyValidProductSource;

    const productSources = isMaintenanceRow ? [] : (sourceRow.products ?? []);

    const resolvedProducts = productSources.map((sourceProduct) => {
      const column = columnMap.get(sourceProduct.columnKey);
      if (!column || column.col_type !== "sku_picker") {
        issues.push(`คอลัมน์สินค้า ${sourceProduct.columnKey || "ไม่ทราบ"} ไม่อยู่ใน section`);
        return { ...sourceProduct, status: "invalid", candidates: [] };
      }
      const signature = buildImportSignature({
        brand: sourceProduct.sourceBrand,
        product: sourceProduct.sourceProduct,
        size: sourceProduct.sourceSize,
      });
      const categoryIds = scopesBySection?.get(section.id) ?? [];
      const sectionCatalog = scopesBySection
        ? catalog.filter(product => isProductInImportScope(product, categoryIds)) : catalog;
      if (scopesBySection && !categoryIds.length) issues.push(`${section.name}: ยังไม่ได้กำหนดหมวดหมู่สำหรับ Import`);
      const candidates = candidateVariants(sourceProduct, column, sectionCatalog, section, rowData);
      const alias = aliasMap.get(`${section.id}::${column.key}::${signature}`);
      const aliasProduct = alias ? sectionCatalog.find((product) => product.skuCode === alias.sku_code
        && matchesImportProduct(sourceProduct, product, section)) : null;
      const aliasFormula = aliasProduct?.formulaOptions?.find((formula) =>
        (!alias.formula_code || formula.formula_code === alias.formula_code)
        && (!sourceProduct.sourceFormula || normalizeImportText(`${formula.formula_code} ${formula.formula_name}`).includes(normalizeImportText(sourceProduct.sourceFormula)))
      );
      const aliasCandidate = aliasProduct && aliasFormula ? {
        selectionKey: `${aliasProduct.skuCode}::${aliasFormula.formula_code}`,
        skuCode: aliasProduct.skuCode,
        name: aliasProduct.name,
        brand: aliasProduct.brand,
        unit: aliasProduct.unit,
        formulaCode: aliasFormula.formula_code,
        formulaName: aliasFormula.formula_name,
        score: 2000,
        rowPatch: buildProductPatch(column, aliasProduct, aliasFormula),
      } : null;
      if (aliasCandidate && !candidates.some((candidate) => candidate.selectionKey === aliasCandidate.selectionKey)) {
        candidates.unshift(aliasCandidate);
      }
      const unknownShorthand = /\b(?:a\s*b\s*c|a\s*e\s*c)\b/i.test(sourceProduct.sourceProduct || "");
      const unspecifiedCookieFamily = /ก้นหอย/.test(sourceProduct.sourceProduct || "")
        && candidates.length === 1 && !/ก้นหอย/.test(candidates[0].name)
        || /คุกกี้นม|แซนวิช|แซนวิส/.test(sourceProduct.sourceProduct || "")
        && candidates.length === 1 && !/คุกกี้นม|แซนวิช|แซนวิส|แม่มะลิ\s*คุกกี้/.test(candidates[0].name);
      const incompleteSource = !String(sourceProduct.sourceBrand || "").trim()
        || (!String(sourceProduct.sourceSize || "").trim()
          && packWeightGrams(sourceProduct.sourceProduct) === null
          && !/เนื้อขนม|รอ(?:บ)?บรรจุ/.test(sourceProduct.sourceBrand || ""))
        || !/คุกกี้|แครกเกอร์|ขนมปังกรอบ|สติ๊ก|เรนโบว์|แฟนซี|ขาไก่|beever|บีเวอร์|เนื้อขนม|แป้ง|abc|aec/i.test(sourceProduct.sourceProduct || "");
      const automatic = aliasCandidate || (!unknownShorthand && !unspecifiedCookieFamily && !incompleteSource && candidates.length === 1 && candidates[0].score >= 1000 ? candidates[0] : null);
      const chosen = automatic || candidates[0] || null;

      if (chosen) {
        Object.assign(rowData, chosen.rowPatch);
      }

      const isExact = Boolean(automatic);
      const isSuggested = !isExact && Boolean(chosen);

      if (!chosen && candidates.length) {
        warnings.push(`${column.label}: ต้องยืนยันสินค้า — ${unknownShorthand ? "ชื่อย่อยังไม่มีคู่ที่ยืนยัน" : `พบ ${candidates.length} ตัวเลือก กรุณาตรวจชนิด รส แบรนด์ ขนาด และสูตร`}`);
      } else if (!chosen) {
        issues.push(`${column.label}: ไม่พบสินค้าหรือสูตรที่ตรงกับ “${sourceProduct.sourceProduct || "ไม่ทราบ"}”`);
      } else if (isSuggested) {
        warnings.push(`${column.label}: AI แนะนำ “${chosen.name} (${chosen.formulaName})” อัตโนมัติ (แก้ไขได้)`);
      }

      return {
        ...sourceProduct,
        signature,
        status: chosen ? "resolved" : "review",
        isSuggested,
        isExact,
        learnAlias: false,
        reviewReason: !chosen && candidates.length ? "กรุณายืนยันสินค้าและสูตร: ตรวจชนิด รส แบรนด์ และขนาดก่อนเลือก" : null,
        selectedKey: chosen?.selectionKey ?? "",
        candidates,
      };
    });

    if (!isMaintenanceRow && columns.some((column) => column.col_type === "sku_picker") && !resolvedProducts.length) {
      issues.push("ไม่พบสินค้าในรายการผลิต");
    }

    columns.filter((column) => column.is_required).forEach((column) => {
      if (rowData[column.key] === null || rowData[column.key] === "") {
        issues.push(`${column.label}: จำเป็นต้องมีข้อมูล`);
      }
    });

    return {
      id: `vision-${index + 1}`,
      sectionDefId: sourceRow.sectionId,
      dayKey: sourceRow.workDate,
      rowData,
      sourceRowLabel: sourceRow.sourceRowLabel,
      products: resolvedProducts,
      issues: [...new Set(issues)],
      warnings,
    };
  });
}
