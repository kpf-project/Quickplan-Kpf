import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadTemplate } from "@/lib/scheduleConfig";
import { loadScheduleSkuCatalog } from "@/lib/scheduleSkuCatalog";
import { loadScheduleImportScopes } from "@/lib/scheduleImportScope";
import { confirmedImportAliases } from "@/lib/scheduleImportAliasConfirmation";
import { importPreviewSection } from "@/lib/scheduleImportReview";
import {
  buildVisionExtractionSchema,
  buildVisionPrompt,
  resolveVisionRows,
  buildSectionProductOptions,
} from "@/lib/scheduleVisionImport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ponytail: inline Gemini requests cap total payload at 20 MB; use Files API if larger plans become common.
const MAX_FILE_BYTES = 14 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function normalizeDate(value) {
  const normalized = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function extractOutputText(response) {
  return (response?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part?.text)
    .filter(Boolean)
    .join("");
}

async function loadShiftsBySection(db, sectionIds) {
  const map = new Map(sectionIds.map((id) => [id, []]));
  if (!sectionIds.length) return map;
  const { data, error } = await db
    .from("production_section_shifts")
    .select(`
      section_def_id,shift_id,start_time,end_time,is_active,
      production_shifts!inner(id,code,name,start_time,end_time,is_active)
    `)
    .in("section_def_id", sectionIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  (data ?? []).forEach((row) => {
    const master = row.production_shifts ?? {};
    const item = {
      id: row.shift_id || master.id,
      code: String(master.code || "").trim().toUpperCase(),
      name: String(master.name || master.code || "กะ").trim(),
      startTime: String(row.start_time || master.start_time || "").slice(0, 5),
      endTime: String(row.end_time || master.end_time || "").slice(0, 5),
    };
    map.get(row.section_def_id)?.push(item);
  });
  return map;
}

async function loadAliases(db, deptId, sectionIds) {
  const { data, error } = await db
    .from("production_schedule_import_aliases")
    .select("section_def_id,product_column_key,source_signature,sku_code,formula_code")
    .eq("dept_id", deptId)
    .in("section_def_id", sectionIds);
  if (error && ["42P01", "PGRST205"].includes(String(error.code || ""))) return [];
  if (error) throw error;
  return confirmedImportAliases(db, deptId, data ?? []);
}

function resolveVisionApiKeys() {
  const keys = [];
  const rawSources = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY];
  for (const src of rawSources) {
    if (src) {
      const parts = src.split(",").map((k) => k.trim()).filter(Boolean);
      for (const p of parts) {
        if (!keys.includes(p)) {
          keys.push(p);
        }
      }
    }
  }
  return keys;
}

async function callVision({ file, template, dateFrom, dateTo, shiftsBySection, catalog, scopesBySection }) {
  const apiKeys = resolveVisionApiKeys();
  if (!apiKeys.length) {
    const error = new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ (กรุณาระบุใน .env.local)");
    error.status = 503;
    throw error;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const primaryModel = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";
  const candidateModels = [
    primaryModel,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastError = null;

  for (const apiKey of apiKeys) {
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { inlineData: { mimeType: file.type, data: bytes.toString("base64") } },
                { text: buildVisionPrompt({ template, dateFrom, dateTo, shiftsBySection, catalog, scopesBySection }) },
              ],
            }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 12000,
              responseMimeType: "application/json",
              responseJsonSchema: buildVisionExtractionSchema(template),
            },
          }),
          signal: AbortSignal.timeout(120000),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const rawMessage = payload?.error?.message || "Gemini อ่านเอกสารไม่สำเร็จ";
          let errorMsg = rawMessage;
          if (response.status === 401 || /invalid authentication credentials/i.test(rawMessage)) {
            errorMsg = "คีย์ Gemini API ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบ GEMINI_API_KEY ใน .env.local";
          }

          const isHighDemandOrOverloaded =
            response.status === 503 ||
            response.status === 429 ||
            /high demand|overloaded|resource exhausted|unavailable/i.test(rawMessage);

          if (isHighDemandOrOverloaded && i < candidateModels.length - 1) {
            console.warn(`[Vision Import] Model ${model} is experiencing high demand (${rawMessage}). Auto falling back to ${candidateModels[i + 1]}...`);
            lastError = new Error(errorMsg);
            await new Promise((resolve) => setTimeout(resolve, 600));
            continue;
          }

          if (response.status === 429) {
            lastError = new Error(errorMsg);
            break;
          }

          const error = new Error(errorMsg);
          error.status = response.status;
          throw error;
        }

        const outputText = extractOutputText(payload);
        if (!outputText) throw new Error("Gemini ไม่คืนข้อมูลตาราง");
        return JSON.parse(outputText);
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastError = err;
        if (err.status === 401) {
          break;
        }
        if (i < candidateModels.length - 1) {
          console.warn(`[Vision Import] Model ${model} failed (${err.message}). Auto falling back to ${candidateModels[i + 1]}...`);
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }
      }
    }
  }

  throw lastError || new Error("Gemini อ่านเอกสารไม่สำเร็จ");
}

export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const form = await request.formData();
    const file = form.get("file");
    const deptId = String(form.get("deptId") || "").trim();
    const templateId = String(form.get("templateId") || "").trim();
    const dateFrom = normalizeDate(form.get("dateFrom"));
    const dateTo = normalizeDate(form.get("dateTo"));

    if (!(file instanceof File) || !deptId || !templateId || !dateFrom || !dateTo) {
      return NextResponse.json({ error: "file, deptId, templateId, dateFrom และ dateTo จำเป็นต้องมี" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 14 MB" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "รองรับเฉพาะ PDF, PNG, JPEG, WEBP และ GIF" }, { status: 400 });
    }

    const template = await loadTemplate(templateId);
    if (!template || String(template.dept_id || "") !== deptId) {
      return NextResponse.json({ error: "เทมเพลตไม่ตรงกับแผนกที่กำลังเปิด" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const sectionIds = (template.sections ?? []).map((section) => section.id);
    const [catalog, aliases, shiftsBySection, scopesBySection] = await Promise.all([
      loadScheduleSkuCatalog(db, undefined, deptId),
      loadAliases(db, deptId, sectionIds),
      loadShiftsBySection(db, sectionIds),
      loadScheduleImportScopes(db, sectionIds),
    ]);
    const extraction = await callVision({ file, template, dateFrom, dateTo, shiftsBySection, catalog, scopesBySection });
    const rows = resolveVisionRows({
      extraction,
      template,
      catalog,
      aliases,
      shiftsBySection,
      dateFrom,
      dateTo,
      scopesBySection,
    });

    return NextResponse.json({
      ok: true,
      data: {
        documentTitle: extraction.documentTitle,
        detectedDepartment: extraction.detectedDepartment,
        rows,
        sections: (template.sections ?? []).map(sec => importPreviewSection(sec,
          buildSectionProductOptions(sec, catalog, scopesBySection.get(sec.id)), shiftsBySection.get(sec.id) ?? [])),
      },
    });
  } catch (error) {
    if (error?.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return jsonError(error);
  }
}
