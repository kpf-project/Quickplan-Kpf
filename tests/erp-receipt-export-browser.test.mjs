import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer";
import { createErpDrawerFixture } from "./helpers/erp-drawer-fixture.mjs";

test("ERP overlay preserves report geometry, traps focus, validates, retries same request and downloads history", { timeout: 120000 }, async () => {
  const fixture = await createErpDrawerFixture();
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewport({ width: 1920, height: 1024 });
    await page.goto(fixture.url);
    // Reproduce the report-center shell's higher-specificity rounded button rule.
    await page.addStyleTag({ content: '#app button:not(.categoryButton):not(.reportItem):not(.shortcut){border-radius:6px}' });
    const button = async label => {
      const result = await page.evaluateHandle(text => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text && node.getClientRects().length), label);
      assert.ok(result.asElement(), `missing ${label}`);
      await result.asElement().click();
    };
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(node => node.textContent.trim() === "Export ERP" && !node.disabled));
    for (const width of [1920, 1440, 1280, 390]) {
      await page.setViewport({ width, height: 1024 });
      const toolbar = await page.evaluate(() => {
        const tabs = document.querySelector('nav[aria-label="รูปแบบรายงาน"]');
        const bar = tabs.parentElement;
        const filters = document.querySelector('[aria-label="ตัวกรองรายงาน"]') || bar.previousElementSibling;
        const active = tabs.querySelector('[aria-pressed="true"]');
        const preview = bar.querySelector('[aria-label="เครื่องมือดูตัวอย่างรายงาน"]');
        return { labels: [...tabs.querySelectorAll("button")].map(node => node.textContent),
          active: active.textContent, background: getComputedStyle(active).backgroundColor,
          underline: getComputedStyle(active, "::after").height,
          underlineRadius: getComputedStyle(active, "::after").borderRadius,
          compactHeight: bar.getBoundingClientRect().height,
          belowFilters: bar.getBoundingClientRect().top >= filters.getBoundingClientRect().bottom - 1,
          fits: bar.scrollWidth <= bar.clientWidth, hasPreview: Boolean(preview),
          toolsAligned: Math.abs(tabs.getBoundingClientRect().top - preview.getBoundingClientRect().top) < 10 };
      });
      assert.deepEqual(toolbar.labels, ["สรุป", "ละเอียด"]);
      assert.equal(toolbar.active, "สรุป");
      assert.equal(toolbar.background, "rgba(0, 0, 0, 0)");
      assert.equal(toolbar.underline, "3px");
      assert.equal(toolbar.underlineRadius, "0px", "underline stays straight under the report-center rounded button style");
      assert.ok(toolbar.belowFilters && toolbar.fits && toolbar.hasPreview, `toolbar layout at ${width}px`);
      if (width >= 1280) {
        assert.ok(toolbar.toolsAligned, `tabs and controls share one row at ${width}px`);
        assert.ok(toolbar.compactHeight <= 54, `compact toolbar at ${width}px`);
      }
    }
    await page.setViewport({ width: 1920, height: 1024 });
    assert.equal(await page.$$eval("[class*='ReceiptErpExportmodulecss_actions'] button", nodes => nodes.length), 1);
    await mkdir(path.join(fixture.directory, "evidence"), { recursive: true });
    await page.screenshot({ path: path.join(fixture.directory, "evidence", "toolbar-export-only.png"), clip: { x: 444, y: 0, width: 1476, height: 420 } });
    const reportBox = () => page.$eval("[data-report-document]", node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const before = await reportBox();
    fixture.state.previewDelayMs = 400;
    await button("Export ERP");
    await button("ประวัติส่งออก");
    assert.equal(await page.$eval("dialog nav button:last-child", node => node.getAttribute("aria-pressed")), "true");
    await button("ตรวจสอบ");
    await page.waitForSelector("dialog[open] [data-erp-validation]");
    const previewCount = fixture.state.previewFilters.length;
    for (let i = 0; i < 3; i++) { await button("ประวัติส่งออก"); await button("ตรวจสอบ"); }
    assert.equal(fixture.state.previewFilters.length, previewCount, "tab switching uses the loaded preview");
    assert.deepEqual(await reportBox(), before);
    assert.equal(await page.$eval("dialog", node => node.parentElement === document.body), true);
    const visual = await page.$eval("dialog", node => {
      const status = node.querySelector("[data-erp-validation]");
      const icon = status?.querySelector("circle");
      return { background: status && getComputedStyle(status).backgroundColor, iconFill: icon && getComputedStyle(icon).fill,
        recentRows: node.querySelectorAll("[data-erp-recent] tbody tr").length,
        recentText: node.querySelector("[data-erp-recent]")?.textContent };
    });
    assert.equal(visual.background, "rgb(255, 255, 255)");
    assert.equal(visual.iconFill, "rgb(6, 145, 31)");
    assert.equal(visual.recentRows, 1);
    assert.ok(!visual.recentText.includes("apexchelon"), "recent history stays compact; full audit details live in history tab");
    await mkdir(path.join(fixture.directory, "evidence"), { recursive: true });
    await page.screenshot({ path: path.join(fixture.directory, "evidence", "drawer-1920.png") });
    await page.setViewport({ width: 1717, height: 916 });
    await page.screenshot({ path: path.join(fixture.directory, "evidence", "drawer-1717.png") });
    await page.setViewport({ width: 1920, height: 1024 });
    for (let i = 0; i < 22; i++) await page.keyboard.press("Tab");
    assert.equal(await page.$eval("dialog", node => node.contains(document.activeElement)), true);
    await button("แก้เลข");
    await page.focus("#erp-number"); await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await page.keyboard.type("9");
    assert.equal(await page.$eval("dialog button[class*='confirm']", node => node.disabled), true);
    await page.type("dialog textarea", "ทดสอบต่อเลขเอกสาร");
    assert.equal(await page.$eval("dialog button[class*='confirm']", node => node.disabled), false);
    fixture.state.failExportOnce = true;
    await button("ยืนยัน Export ERP");
    await page.waitForSelector("dialog [role='alert']");
    await button("ยืนยัน Export ERP");
    await page.waitForFunction(() => document.querySelector("dialog")?.textContent.includes("ส่งออกเรียบร้อย"));
    assert.equal(fixture.state.exportAttempts.length, 2);
    assert.equal(fixture.state.exportAttempts[0].requestId, fixture.state.exportAttempts[1].requestId);
    assert.equal(fixture.state.exportAttempts[0].documentNumbers["2026-10-14"], "IMM6910/0009");
    const historyLayout = await page.$eval("dialog table", table => ({
      headers: [...table.querySelectorAll("th")].map(cell => cell.textContent),
      singleLine: [...table.querySelectorAll("th,td")].every(cell => getComputedStyle(cell).whiteSpace === "nowrap" && getComputedStyle(cell).textOverflow !== "ellipsis"),
      iconOnly: table.querySelector("button[aria-label^='ดาวน์โหลดไฟล์เดิม']")?.textContent === "",
      scrollable: getComputedStyle(table.parentElement).overflowX === "auto",
    }));
    assert.deepEqual(historyLayout.headers, ["เลขที่เอกสาร", "วันที่ส่งออก", "ผู้ส่งออก", "สถานะ", "ดาวน์โหลด"]);
    assert.equal(historyLayout.singleLine, true);
    assert.equal(historyLayout.iconOnly, true);
    assert.equal(historyLayout.scrollable, true);
    for (const width of [1920, 1440, 1280]) {
      await page.setViewport({ width, height: 1024 });
      assert.equal(await page.$eval("dialog table", table => table.parentElement.scrollWidth <= table.parentElement.clientWidth + 1), true, `history fits without horizontal scrolling at ${width}px`);
    }
    await page.setViewport({ width: 1920, height: 1024 });
    await page.screenshot({ path: path.join(fixture.directory, "evidence", "history-columns.png") });
    await page.click("dialog button[aria-label^='ดาวน์โหลดไฟล์เดิม']");
    await page.waitForFunction(() => !document.querySelector("dialog")?.querySelector("button[aria-label='ปิดหน้าต่าง ERP']")?.disabled);
    assert.deepEqual(fixture.state.downloads, ["saved-batch"]);
    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog", { hidden: true });
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Export ERP");
    fixture.state.duplicateCount = 2;
    await button("Export ERP");
    await page.waitForFunction(() => document.querySelector("dialog")?.textContent.includes("ใบชั่ง 2 ใบในชุดนี้เคยส่งออก ERP แล้ว"));
    assert.equal(await page.$eval("dialog button[class*='confirm']", node => node.disabled), true);
    await page.mouse.click(500, 500);
    await page.waitForSelector("dialog", { hidden: true });
    for (const width of [1440, 1280, 390]) {
      await page.setViewport({ width, height: 1024 });
      await button("Export ERP");
      await page.waitForSelector("dialog[open] [data-erp-validation]");
      const panel = await page.$eval("dialog section", node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; });
      assert.ok(panel.left >= 0 && panel.right <= width + 1 && panel.width <= width);
      await page.screenshot({ path: path.join(fixture.directory, "evidence", `drawer-${width}.png`) });
      await page.keyboard.press("Escape");
      await page.waitForSelector("dialog", { hidden: true });
    }
    fixture.state.previewError = true;
    await button("Export ERP");
    await page.waitForSelector("dialog [role='alert']");
    const failedCount = fixture.state.previewFilters.length;
    await button("ประวัติส่งออก");
    await button("ตรวจสอบ");
    assert.equal(fixture.state.previewFilters.length, failedCount, "failed previews do not retry when switching tabs");
    fixture.state.previewError = false;
    await button("ตรวจสอบข้อมูลอีกครั้ง");
    await page.waitForSelector("dialog[open] [data-erp-validation]");
    assert.equal(fixture.state.previewFilters.length, failedCount + 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await fixture.close(); }
});
