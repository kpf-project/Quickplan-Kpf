import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PHOTO_DIRECTORY = path.join("public", "EMP-Photo");
const EMPLOYEE_PAGE_SIZE = 200;
const UPSERT_BATCH_SIZE = 10;
const MAX_IMAGE_DATA_LENGTH = 750_000;
const SUPPORTED_IMAGE_PATTERN = /\.(jpe?g|png)$/i;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

export function extractPhotoCode(fileName) {
  const match = path.basename(String(fileName || "")).match(/^(?:KPF[\s-]*)?(\d+)/i);
  return match?.[1] || "";
}

export function normalizeComparableEmployeeCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^KPF[\s-]*/, "")
    .replace(/[\s.-]/g, "");
  return /^\d+$/.test(normalized) ? normalized : "";
}

function photoPreferenceScore(fileName) {
  const baseName = path.basename(fileName);
  let score = /^KPF[\s-]/i.test(baseName) ? 100 : 0;
  if (/\.png$/i.test(baseName)) score += 10;
  return score;
}

export function selectPreferredPhoto(fileNames) {
  return [...fileNames].sort((left, right) => {
    const scoreDifference = photoPreferenceScore(right) - photoPreferenceScore(left);
    if (scoreDifference) return scoreDifference;
    return left.localeCompare(right, "th");
  })[0] || "";
}

function getEmployeeCode(employee) {
  return String(employee?.PRS_NO ?? employee?.EMP_INTL ?? "").trim().toUpperCase();
}

export function buildPhotoAssignments(employees, photos) {
  const photoByComparableCode = new Map(
    photos.map((photo) => [normalizeComparableEmployeeCode(photo.code), photo])
  );
  const assignments = [];
  const seenEmployeeCodes = new Set();

  employees.forEach((employee) => {
    const employeeCode = getEmployeeCode(employee);
    const comparableCode = normalizeComparableEmployeeCode(employeeCode);
    const photo = photoByComparableCode.get(comparableCode);
    if (!employeeCode || !photo || seenEmployeeCodes.has(employeeCode)) return;
    seenEmployeeCodes.add(employeeCode);
    assignments.push({
      employeeCode,
      photoCode: photo.code,
      filePath: photo.filePath,
    });
  });

  return assignments;
}

function loadPhotoCatalog(rootDirectory) {
  const photoDirectory = path.resolve(rootDirectory, PHOTO_DIRECTORY);
  const fileNames = fs.readdirSync(photoDirectory).filter((fileName) => SUPPORTED_IMAGE_PATTERN.test(fileName));
  const filesByCode = new Map();

  fileNames.forEach((fileName) => {
    const code = extractPhotoCode(fileName);
    if (!code) return;
    const existing = filesByCode.get(code) || [];
    existing.push(fileName);
    filesByCode.set(code, existing);
  });

  const photos = Array.from(filesByCode, ([code, candidates]) => {
    const preferredFile = selectPreferredPhoto(candidates);
    return {
      code,
      filePath: path.join(photoDirectory, preferredFile),
      candidates,
    };
  });

  return { fileNames, photos };
}

async function fetchAllEmployees(gatewayUrl, apiKey) {
  const employees = [];
  let cursor = "";
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ pageSize: String(EMPLOYEE_PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${gatewayUrl}/api/employees?${params.toString()}`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load employees (${response.status})`);
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    employees.push(...rows);
    console.log(`Loaded employee page ${page}: ${employees.length} records`);
    const nextCursor = payload?.cursor?.next || "";
    if (!payload?.cursor?.hasMore || !nextCursor || rows.length === 0) break;
    if (nextCursor === cursor) throw new Error("Employee API returned a repeated cursor");
    cursor = nextCursor;
    page += 1;
  }

  return employees;
}

async function prepareImageData(filePath) {
  const buffer = await sharp(filePath)
    .rotate()
    .resize(360, 360, { fit: "cover", position: "centre" })
    .flatten({ background: "#eef2f7" })
    .webp({ quality: 78 })
    .toBuffer();
  const imageData = `data:image/webp;base64,${buffer.toString("base64")}`;
  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    throw new Error(`Compressed image exceeds limit: ${path.basename(filePath)}`);
  }
  return imageData;
}

async function applyAssignments(supabase, assignments) {
  const imageDataByPath = new Map();
  const updatedAt = new Date().toISOString();
  const rows = [];

  for (const assignment of assignments) {
    let imageData = imageDataByPath.get(assignment.filePath);
    if (!imageData) {
      imageData = await prepareImageData(assignment.filePath);
      imageDataByPath.set(assignment.filePath, imageData);
    }
    rows.push({
      employee_code: assignment.employeeCode,
      image_data: imageData,
      updated_by: null,
      updated_at: updatedAt,
    });
  }

  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from("employee_photos")
      .upsert(batch, { onConflict: "employee_code" });
    if (error) throw error;
    console.log(`Saved ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }

  return updatedAt;
}

async function verifyAssignments(supabase, assignments, updatedAt) {
  const expectedCodes = assignments.map((assignment) => assignment.employeeCode);
  const verifiedCodes = new Set();

  for (let index = 0; index < expectedCodes.length; index += 100) {
    const batch = expectedCodes.slice(index, index + 100);
    const { data, error } = await supabase
      .from("employee_photos")
      .select("employee_code")
      .in("employee_code", batch)
      .eq("updated_at", updatedAt);
    if (error) throw error;
    (data || []).forEach((row) => verifiedCodes.add(row.employee_code));
  }

  const missingCodes = expectedCodes.filter((code) => !verifiedCodes.has(code));
  if (missingCodes.length) {
    throw new Error(`Verification failed for ${missingCodes.length} employee photo(s)`);
  }
  return verifiedCodes.size;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const apply = process.argv.includes("--apply");
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl) throw new Error("Missing KPF_GATEWAY_URL in environment");

  const { fileNames, photos } = loadPhotoCatalog(process.cwd());
  const employees = await fetchAllEmployees(gatewayUrl, apiKey);
  const assignments = buildPhotoAssignments(employees, photos);
  const matchedPhotoCodes = new Set(assignments.map((assignment) => assignment.photoCode));
  const duplicatePhotos = photos.filter((photo) => photo.candidates.length > 1);
  const unmatchedPhotos = photos.filter((photo) => !matchedPhotoCodes.has(photo.code));

  console.log(`Photo files scanned: ${fileNames.length}`);
  console.log(`Unique photo codes: ${photos.length}`);
  console.log(`Duplicate photo codes resolved: ${duplicatePhotos.length}`);
  console.log(`Employee records scanned: ${employees.length}`);
  console.log(`Employee records matched: ${assignments.length}`);
  console.log(`Photo codes without employee match: ${unmatchedPhotos.length}`);

  duplicatePhotos.forEach((photo) => {
    console.log(`Duplicate ${photo.code}: selected ${path.basename(photo.filePath)}`);
  });
  unmatchedPhotos.forEach((photo) => {
    console.log(`Unmatched ${photo.code}: ${path.basename(photo.filePath)}`);
  });

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist employee photos.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const updatedAt = await applyAssignments(supabase, assignments);
  const verifiedCount = await verifyAssignments(supabase, assignments, updatedAt);
  console.log(`Verified ${verifiedCount}/${assignments.length} employee photos.`);
}

const isMainModule = path.basename(process.argv[1] || "") === "import-employee-photos.mjs";
if (isMainModule) {
  console.log("Preparing employee photo import...");
  try {
    await main();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}
