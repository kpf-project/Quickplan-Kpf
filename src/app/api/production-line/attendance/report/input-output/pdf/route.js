import puppeteer from "puppeteer";
import { ApiError, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_PERMISSION_KEYS = [
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
];
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_CSS_BYTES = 1024 * 1024;
const MAX_BODY_CLASS_LENGTH = 4096;

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getInternalAppOrigin() {
  const appUrl = process.env.KPF_INTERNAL_APP_URL
    || `http://127.0.0.1:${process.env.PORT || "3000"}`;
  const parsed = new URL(appUrl);

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ApiError(500, "KPF_INTERNAL_APP_URL must be an HTTP(S) application origin");
  }

  return parsed.origin;
}

function validateStylesheetPath(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "รายการไฟล์ CSS ไม่ถูกต้อง");
  }

  const parsed = new URL(value, "http://pdf.invalid");
  if (
    parsed.origin !== "http://pdf.invalid"
    || !parsed.pathname.startsWith("/_next/static/")
    || parsed.hash
  ) {
    throw new ApiError(400, "อนุญาตเฉพาะไฟล์ CSS ภายในแอป");
  }

  return `${parsed.pathname}${parsed.search}`;
}

function escapeAttribute(value) {
  return String(value).replace(/[&"<>]/g, (character) => ({
    "&": "&amp;",
    "\"": "&quot;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]);
}

function buildPrintDocument({ html, bodyClass, stylesheetPaths, inlineCss }, origin) {
  const stylesheetLinks = stylesheetPaths
    .map((path) => `<link rel="stylesheet" href="${origin}${escapeAttribute(path)}">`)
    .join("");
  const safeInlineCss = inlineCss.replace(/<\/style/gi, "<\\/style");
  const safeBodyClass = escapeAttribute(bodyClass);
  const contentSecurityPolicy = [
    "default-src 'none'",
    `style-src 'unsafe-inline' ${origin}/_next/static/`,
    `font-src data: ${origin}/_next/static/`,
    `img-src data: ${origin}/brand/`,
    "object-src 'none'",
    "frame-src 'none'",
    `base-uri ${origin}/`,
  ].join("; ");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(contentSecurityPolicy)}"><base href="${origin}/">${stylesheetLinks}<style>${safeInlineCss}</style></head><body class="${safeBodyClass}">${html}</body></html>`;
}

async function readPdfRequest(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new ApiError(413, "ข้อมูลรายงานมีขนาดใหญ่เกินไป");
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
    throw new ApiError(413, "ข้อมูลรายงานมีขนาดใหญ่เกินไป");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "ข้อมูลสำหรับสร้าง PDF ไม่ถูกต้อง");
  }

  const html = typeof payload?.html === "string" ? payload.html : "";
  const bodyClass = typeof payload?.bodyClass === "string" ? payload.bodyClass : null;
  const inlineCss = typeof payload?.inlineCss === "string" ? payload.inlineCss : "";
  if (!html.trim()) {
    throw new ApiError(400, "ไม่พบเนื้อหารายงานสำหรับสร้าง PDF");
  }
  if (bodyClass === null || bodyClass.length > MAX_BODY_CLASS_LENGTH) {
    throw new ApiError(400, "ข้อมูลรูปแบบหน้ารายงานไม่ถูกต้อง");
  }
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new ApiError(413, "เนื้อหารายงานมีขนาดใหญ่เกินไป กรุณาลดช่วงวันที่");
  }
  if (Buffer.byteLength(inlineCss, "utf8") > MAX_CSS_BYTES) {
    throw new ApiError(413, "รูปแบบรายงานมีขนาดใหญ่เกินไป");
  }

  const rawStylesheets = Array.isArray(payload?.stylesheetPaths)
    ? payload.stylesheetPaths
    : [];
  const uniqueStylesheets = Array.from(new Set(rawStylesheets.map(validateStylesheetPath)));
  if (uniqueStylesheets.length > 50) {
    throw new ApiError(400, "มีไฟล์ CSS มากเกินไป");
  }

  return {
    dateFrom: payload?.dateFrom,
    dateTo: payload?.dateTo,
    html,
    bodyClass,
    inlineCss,
    stylesheetPaths: uniqueStylesheets,
  };
}

export async function POST(request) {
  let browser;

  try {
    await requirePermissionKeys(request, REPORT_PERMISSION_KEYS);
    const payload = await readPdfRequest(request);
    const { dateFrom, dateTo } = payload;
    if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) {
      throw new ApiError(400, "กรุณาระบุช่วงวันที่ที่ถูกต้อง");
    }

    const internalOrigin = getInternalAppOrigin();
    const documentHtml = buildPrintDocument(payload, internalOrigin);
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (browserRequest) => {
      let requestedUrl;
      try {
        requestedUrl = new URL(browserRequest.url());
      } catch {
        return browserRequest.abort();
      }

      const allowedResource = requestedUrl.origin === internalOrigin
        && ["GET", "HEAD"].includes(browserRequest.method().toUpperCase())
        && (
          requestedUrl.pathname.startsWith("/_next/static/")
          || requestedUrl.pathname === "/brand/LOGO-KPF1.png"
        );
      return allowedResource
        ? browserRequest.continue()
        : browserRequest.abort();
    });
    await page.emulateMediaType("print");
    await page.setContent(documentHtml, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.bringToFront();
    await page.evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Timed out while waiting for PDF fonts")),
            20_000
          );
        }),
      ]);
    });

    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
      waitForFonts: true,
      tagged: true,
      timeout: 45_000,
    });
    const filename = `input-output-${dateFrom}-${dateTo}.pdf`;

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    if (browser) await browser.close();
  }
}
