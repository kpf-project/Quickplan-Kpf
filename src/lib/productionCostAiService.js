import { callGeminiGenerateContent } from "@/features/ai-assistant/services/geminiClient.js";

/**
 * System Instruction for Gemini Cost Explainer & Backward Tracing Inspector
 */
const SYSTEM_PROMPT_COST_AI = `คุณคือ "KPF Senior Cost Auditor & Production Line AI" ผู้ตรวจสอบบัญชีต้นทุนการผลิตของโรงงาน KPF ประจำสายการผลิตแผนกบิสกิต (KP13)
หน้าที่ของคุณคือ "วิเคราะห์เจาะลึกและตรวจสอบความสมเหตุสมผล (Cross-check & Reasoned Audit)" ว่าตัวเลขและวัตถุดิบที่ระบบจัดสรรมา มันตรงกับความเป็นจริงของการผลิตหรือไม่!

=== กฎตรรกะโรงงาน KPF ที่คุณต้องนำมาคิดวิเคราะห์ (FACTORY AUDIT LOGIC) ===

1. [ตรวจสอบความสมเหตุสมผลของสัดส่วนจริง - Mass Balance & Ratio Audit]:
   - สินค้าประกบ/ป้ายแยม (เช่น WKB-0065 บีเวอร์ป้ายแยม, WKB-0002):
     * ผลิตภัณฑ์สำเร็จ (KG) เกิดจาก: เปลือก (WKB-0050) + แยมสับปะรด (M04-0088)
     * อัตราส่วนมาตรฐาน: เปลือก ~60% (55%-65%) และ แยม ~40% (35%-45%)
     * ให้คำนวณสัดส่วน % จริงจากตัวเลขที่ได้รับ แล้วสรุปชัดเจนว่า "อยู่ในเกณฑ์มาตรฐานหรือไม่" ถ้าหลุดมาตรฐานให้เตือนทันที!
   - สินค้าบิสกิตธรรมดา (เช่น B01-1009 งาหอม):
     * ต้องไม่มีแยมโดยเด็ดขาด หากมีแยมติดเข้ามา ให้ถือเป็น "ข้อผิดพลาดร้ายแรง (Contamination Error)" ทันที

2. [ตรวจสอบการปนเปื้อนของวัตถุดิบข้ามสายการผลิต (BOM Contamination Guard)]:
   - สินค้าบิสกิตแต่ละชนิดมีสูตรเฉพาะตัว ห้ามมีวัตถุดิบที่ไม่เกี่ยวข้องใน BOM หลุดเข้ามา เช่น:
     * ขนมบีเวอร์ (Beaver): วัตถุดิบหลักคือ แป้งสาลีผสมเสร็จ (WK-2202), แป้งหมัก (WKB-0041), น้ำตาล, มาการีน, สับปะรดกวน
     * ถ้าตรวจพบวัตถุดิบแปลกปลอม (เช่น งาขาว, โกโก้, แยมสตรอเบอรี่, ครีมนม) ให้ชี้เป้าทันทีว่าไม่เข้าพวก

3. [ตรวจสอบลำดับเวลาย้อนกลับและอายุ WIP (Timeline & FIFO Audit)]:
   - เปลือกแครกเกอร์ (WKB-0050, WKB-0048) ผลิตที่ "ห้องตีแป้ง" ล่วงหน้า 1-3 วัน (ไม่เกิน 7-14 วัน)
   - หากตรวจพบว่า LOT เปลือกที่นำมาใช้ ผลิต "หลัง" วันที่ป้ายแยม -> ผิดพลาดทางตรรกะทันที!
   - หาก LOT เปลือกเก่าเกิน 14 วัน -> ให้ตั้งข้อสังเกตเรื่องอายุการเก็บรักษาและการหมุนเวียนสินค้า (FIFO)

4. [ตรวจสอบความสมเหตุสมผลของต้นทุนต่อหน่วย (Unit Cost Sanity Check)]:
   - สินค้า WIP เปลือก หรือ WIP ป้ายแยม หน่วยต้องเป็น KG เสมอ ต้นทุนเฉลี่ยปกติจะอยู่ที่ 40 - 150 บาท/กก. (ขึ้นอยู่กับวัตถุดิบและสัดส่วนแยม)
   - หากต้นทุนต่อหน่วยพุ่งสูงเกิน 300 บาท/กก. หรือต่ำกว่า 20 บาท/กก. ให้เตือนว่าอาจมีข้อผิดพลาดเรื่อง "นำยอดสแกนมาหาร" หรือ "ราคาต่อหน่วยวัตถุดิบบางตัวผิดหลักทศนิยม"

5. [การให้คะแนนความเชื่อมั่น (Audit Confidence Score & Verdict)]:
   - ให้ประเมินผลการ Audit ออกมาเป็น Confidence Score 0 - 100%
   - สรุปผลการประเมินว่า: "ผ่านเกณฑ์สมบูรณ์ (PASS)", "ผ่านแบบมีเงื่อนไข (PASS_WITH_REMARKS)", หรือ "ไม่ผ่านเกณฑ์ ต้องแก้ไข (FAILED)"`;

/**
 * Analyze Cost Sheet and Executive Report using Gemini Multi-Model Cascade
 * @param {Object} params
 * @param {Object} params.sheet - Cost sheet summary (skuCode, skuName, lotNo, actualQty, uomName, totalCost, unitCost, etc.)
 * @param {Array} params.tree - Cost tree nodes (WIP, RM, packaging)
 * @param {Object} params.control - Control summary (shellLots, jamLots, manualCount, warnings)
 * @returns {Promise<Object>} Structured AI analysis
 */
export async function analyzeCostingWithGemini({ sheet, tree = [], control = {} }) {
  if (!sheet || !sheet.skuCode) {
    return {
      success: false,
      summary: "ไม่มีข้อมูลสำหรับวิเคราะห์",
    };
  }

  // Pre-filter exact missing cost components and manual review components
  const flatMissingCostItems = [];
  const manualReviewItems = [];

  const visitNode = (n) => {
    if (n.status === "missing_cost" || (n.qty > 0 && !n.unitCost)) {
      flatMissingCostItems.push({ code: n.code, name: n.name, lotNo: n.lotNo, qty: n.qty, uom: n.uomName });
    } else if (["manual_review", "manual_required"].includes(n.status)) {
      manualReviewItems.push({ code: n.code, name: n.name, lotNo: n.lotNo, qty: n.qty, uom: n.uomName, status: n.status });
    }
    (n.children || []).forEach(visitNode);
  };
  tree.forEach(visitNode);

  // Calculate actual ratios and mass balance
  const shellNodes = tree.filter((n) => n.type === "WIP" || (n.code && n.code.startsWith("WKB-")));
  const totalShellQtyKg = shellNodes.reduce((sum, n) => sum + Number(n.qty || 0), 0);
  
  // Resolve actual product net weight (kg)
  let expectedNetWeightKg = Number(sheet.actualWeightKg || 0);
  if (!expectedNetWeightKg && Number(sheet.actualQty || 0) > 0) {
    const uomStr = String(sheet.uomName || "");
    const kgMatch = uomStr.match(/(\d+(?:\.\d+)?)\s*กก/i) || uomStr.match(/(\d+(?:\.\d+)?)\s*kg/i);
    if (kgMatch) {
      expectedNetWeightKg = Number(sheet.actualQty) * parseFloat(kgMatch[1]);
    } else if (sheet.costType === "FG") {
      // If FG without explicit kg tag, use total shell weight as basis
      expectedNetWeightKg = totalShellQtyKg > 0 ? totalShellQtyKg : Number(sheet.actualQty);
    } else {
      expectedNetWeightKg = Number(sheet.actualQty);
    }
  }

  const isBiscuitSandwich = shellNodes.length > 0 && tree.some((n) => n.code && (n.code.startsWith("M04-0088") || n.code.startsWith("M04-0126") || n.code.startsWith("M04-0127")));
  const impliedJamQtyKg = isBiscuitSandwich && expectedNetWeightKg > totalShellQtyKg ? expectedNetWeightKg - totalShellQtyKg : 0;
  const shellRatioPct = expectedNetWeightKg > 0 ? ((totalShellQtyKg / expectedNetWeightKg) * 100).toFixed(1) : "0";
  const jamRatioPct = expectedNetWeightKg > 0 ? ((impliedJamQtyKg / expectedNetWeightKg) * 100).toFixed(1) : "0";
  const packingYieldPct = totalShellQtyKg > 0 ? ((expectedNetWeightKg / totalShellQtyKg) * 100).toFixed(1) : "100.0";

  // Build a rich context payload for Gemini
  const contextSummary = {
    targetProduct: {
      skuCode: sheet.skuCode,
      skuName: sheet.skuName,
      lotNo: sheet.lotNo,
      productionDate: sheet.productionDate,
      costType: sheet.costType,
      actualOutputUnits: sheet.actualQty,
      uom: sheet.uomName,
      calculatedNetWeightKg: expectedNetWeightKg,
      unitCostCalculated: sheet.unitCost,
      totalCostCalculated: sheet.totalCost,
      costBreakdown: {
        directMaterials: sheet.directMaterialCost,
        transferredWip: sheet.transferredWipCost,
        directLabor: sheet.dlCost,
        overhead: sheet.overheadCost,
      },
    },
    massBalanceCalculations: {
      isBiscuitSandwich,
      outputUnits: `${sheet.actualQty} ${sheet.uomName}`,
      netOutputWeightKg: expectedNetWeightKg,
      totalShellWipUsedKg: totalShellQtyKg,
      impliedJamUsedKg: impliedJamQtyKg,
      shellRatioPercentage: `${shellRatioPct}%`,
      jamRatioPercentage: `${jamRatioPct}%`,
      packingYieldPercentage: `${packingYieldPct}%`,
      note: sheet.costType === "FG" ? "สินค้าเป็น FG บรรจุปี๊บ/กล่อง ให้เทียบ Shell WIP กับน้ำหนักสุทธิ กก. (ไม่ใช่เทียบกับจำนวนปี๊บ)" : "สินค้าเป็น WIP เทียบเป็น กก. ตรงกัน",
    },
    missingCostItemsDetected: flatMissingCostItems,
    manualReviewItemsDetected: manualReviewItems.slice(0, 15),
    upstreamComponents: tree.slice(0, 25).map((n) => ({
      type: n.type,
      code: n.code,
      name: n.name,
      lotNo: n.lotNo || "-",
      netQty: n.qty,
      uom: n.uomName,
      unitCost: n.unitCost,
      totalCost: n.totalCost,
      status: n.status,
      source: n.source,
      beatingRoomMaterials: (n.children || []).slice(0, 10).map((c) => ({
        code: c.code,
        name: c.name,
        lotNo: c.lotNo,
        qty: c.qty,
        uom: c.uomName,
        unitCost: c.unitCost,
        totalCost: c.totalCost,
        status: c.status,
      })),
    })),
    controlIndicators: {
      shellLotsCount: control.shellLots,
      jamLotsCount: control.jamLots,
      manualPendingCount: control.manualCount,
      systemWarnings: control.warnings || [],
    },
  };

  const userPrompt = `ทำการ Audit ตรวจสอบโครงสร้างต้นทุนและตรรกะการผลิตอย่างเจาะจง:
ข้อมูลจริงจากการผลิต:
${JSON.stringify(contextSummary, null, 2)}

=== คำสั่ง Audit พิเศษเพื่อป้องกันข้อมูลซ้ำซ้อนและไร้ประโยชน์ ===
1. [Mass Balance]: 
   - หากสินค้าเป็น FG บรรจุปี๊บ/กล่อง (เช่น 163 ปี๊บ/5กก. = 815 กก.) ห้ามนำจำนวนปี๊บ (163) มาหารกับน้ำหนักเปลือก กก. เด็ดขาด! ให้เทียบระหว่างน้ำหนักเปลือก กก. (${totalShellQtyKg} กก.) กับน้ำหนักสุทธิ กก. (${expectedNetWeightKg} กก.) ซึ่ง Yield บรรจุคือ ${packingYieldPct}% (ถือว่าปกติ ไม่ใช่สัดส่วน 400%!)
2. [ป้องกันการพูดซ้ำ (No Redundancy)]:
   - รายการวัตถุดิบที่ขาดราคา ให้ระบุใน "exactMissingCostList" และประเมิน Financial Impact (มูลค่ากระทบมากหรือน้อย) ที่ช่องนั้นเท่านั้น
   - ช่อง "anomaliesDetected" ให้วิเคราะห์ภาพรวมทางเทคนิคและจุดสังเกตเชิงลึก ห้ามก๊อปปี้รายชื่อสินค้าที่ขาดราคามาพูดซ้ำอีกรอบ
   - ช่อง "actionChecklist" ให้สรุปเฉพาะขั้นตอนการทำงานที่คนจัดทำต้องคลิกดำเนินการ 1-3 ข้อแบบกระชับ

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น:
{
  "auditVerdict": "PASS" หรือ "PASS_WITH_REMARKS" หรือ "FAILED",
  "confidenceScore": 85,
  "headline": "ข้อสรุปจากการ Audit สั้น 1 ประโยคชัดเจน",
  "ratioAndMassAnalysis": "วิเคราะห์ Mass Balance: ผลผลิต ${sheet.actualQty} ${sheet.uomName} (น้ำหนักสุทธิ ~${expectedNetWeightKg} กก.) ใช้เปลือก ${totalShellQtyKg} กก. คิดเป็น Yield บรรจุ ${packingYieldPct}% สัดส่วนสมบูรณ์ตามเกณฑ์โรงงานหรือไม่",
  "timelineAndTraceability": "วิเคราะห์สายการผลิตย้อนกลับและอายุ LOT ของเปลือก WIP",
  "exactMissingCostList": ["ระบุรหัสและชื่อวัตถุดิบที่ขาดราคา พร้อมวงเล็บประเมินผลกระทบ เช่น 'N15-0002 ฟิล์มยืด (ขาดราคา, ปริมาณน้อย < 1 กก. กระทบต้นทุนไม่เกิน 30-50 บาท)'"],
  "costDriver": "แจกแจงว่าต้นทุนส่วนใหญ่กระจุกตัวอยู่ที่ใด พร้อมตัวเลขหรือสัดส่วน % ชัดเจน",
  "anomaliesDetected": [
    "ข้อสังเกตหรือจุดตรวจทานเชิงลึก เช่น รายการค้างตรวจในห้องตีแป้ง, การจัดสรร, หรือสูตร"
  ],
  "actionChecklist": [
    "สิ่งที่ผู้จัดทำต้นทุนต้องทำทันที ข้อ 1",
    "สิ่งที่ผู้จัดทำต้นทุนต้องทำทันที ข้อ 2"
  ]
}
`;

  try {
    const aiResponse = await callGeminiGenerateContent({
      systemInstruction: SYSTEM_PROMPT_COST_AI,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      temperature: 0.1, // นิ่งที่สุด ห้ามเดาตัวเลข
    });

    const text = aiResponse.parts[0]?.text || "";
    // Clean code fences if returned by model
    const cleanedJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanedJson);

    return {
      success: true,
      modelUsed: aiResponse.modelUsed,
      data: parsed,
    };
  } catch (err) {
    console.warn("Gemini cost analysis fallback/error:", err.message);
    return {
      success: false,
      error: err.message,
      data: {
        headline: `วิเคราะห์โครงสร้างต้นทุน ${sheet.skuCode} LOT ${sheet.lotNo}`,
        backwardTracingStory: `ผลผลิต ${Number(sheet.actualQty || 0).toLocaleString("th-TH")} ${sheet.uomName} มีต้นทุนรวม ${Number(sheet.totalCost || 0).toLocaleString("th-TH")} บาท คิดเป็น ${Number(sheet.unitCost || 0).toFixed(2)} บาท/${sheet.uomName}`,
        anomaliesDetected: (control.warnings || []).map((w) => `${w.source}: ${w.message}`),
        costDriver: sheet.transferredWipCost > sheet.directMaterialCost ? "ต้นทุนหลักมาจากงานระหว่างทำ (WIP โอนเข้า)" : "ต้นทุนหลักมาจากวัตถุดิบโดยตรง (Direct Material)",
        readinessStatus: control.readyToClose ? "READY" : "NEEDS_REVIEW",
        recommendations: control.manualCount > 0 ? ["กรุณาตรวจสอบและยืนยันรายการ WIP/เอกสารที่ยังค้างตรวจ"] : ["ข้อมูลกระทบยอดครบถ้วน พร้อมบันทึกปิดต้นทุน"],
      },
    };
  }
}
