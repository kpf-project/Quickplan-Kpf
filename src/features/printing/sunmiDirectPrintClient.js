const SUNMI_SDK_URL = "https://h5.sunmi.com/printer-sdk/dist/bundle.umd.js";
const ANDROID_UA_PATTERN = /android/i;
const SUNMI_UA_PATTERN = /sunmi/i;
const DEFAULT_WRAPPER_LOGO_SCALE = 0.52;

function getRuntimeDeviceInfo() {
  if (typeof window === "undefined") {
    return {
      isAndroid: false,
      isSunmiDevice: false,
      userAgent: "",
    };
  }

  const userAgent = window.navigator?.userAgent || "";
  return {
    isAndroid: ANDROID_UA_PATTERN.test(userAgent),
    isSunmiDevice: SUNMI_UA_PATTERN.test(userAgent),
    userAgent,
  };
}

function resolveAndroidPrintBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  const bridgeCandidates = [
    { name: "AndroidPrinter", target: window.AndroidPrinter },
    { name: "SunmiPrinter", target: window.SunmiPrinter },
    { name: "Android", target: window.Android },
  ];
  const methodCandidates = [
    "printReceipt",
    "printDailyWorkSlip",
    "printSlip",
    "print",
  ];

  for (const candidate of bridgeCandidates) {
    if (!candidate?.target) continue;

    for (const methodName of methodCandidates) {
      const method = candidate.target?.[methodName];
      if (typeof method !== "function") continue;

      return {
        name: `${candidate.name}.${methodName}`,
        invoke(payloadJson) {
          return method.call(candidate.target, payloadJson);
        },
      };
    }
  }

  return null;
}

function isBridgePrintFailure(result) {
  if (result === false || result === 0 || result === "0") {
    return true;
  }
  if (typeof result !== "string") {
    return false;
  }

  const normalized = result.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "ok" || normalized === "success" || normalized === "true" || normalized === "1") {
    return false;
  }
  return (
    normalized === "false"
    || normalized.includes("error")
    || normalized.includes("fail")
  );
}

function textOrDash(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function buildDailyWorkBridgePayloadJson(slip) {
  const logoScale = Number.isFinite(Number(slip?.logoScale))
    ? Math.max(0.2, Math.min(1.5, Number(slip.logoScale)))
    : DEFAULT_WRAPPER_LOGO_SCALE;
  return JSON.stringify({
    type: "daily_work_slip",
    version: 1,
    source: "production-line-web",
    data: {
      docNo: slip.docNo,
      machineCode: slip.machineCode,
      workTypeName: slip.workTypeName,
      employeeCode: slip.employeeCode,
      employeeName: slip.employeeName,
      amountText: slip.amountText,
      valueLabel: slip.valueLabel,
      unitLabel: slip.unitLabel,
      timeText: slip.timeText,
      dateText: slip.dateText,
      sizeValue: slip.sizeValue,
      fillingValue: slip.fillingValue,
      operatorUsername: slip.operatorUsername,
      logoScale,
    },
  });
}

function buildPieceRateBridgePayloadJson(slip) {
  const logoScale = Number.isFinite(Number(slip?.logoScale))
    ? Math.max(0.2, Math.min(1.5, Number(slip.logoScale)))
    : DEFAULT_WRAPPER_LOGO_SCALE;
  return JSON.stringify({
    type: "piece_rate_slip",
    version: 1,
    source: "production-line-web",
    data: {
      docNo: slip.docNo,
      machineCode: slip.machineCode,
      productCode: slip.productCode,
      productName: slip.productName,
      brandName: slip.brandName,
      employeeCode: slip.employeeCode,
      employeeName: slip.employeeName,
      departmentName: slip.departmentName,
      branchName: slip.branchName,
      amountText: slip.amountText,
      valueLabel: slip.valueLabel,
      unitLabel: slip.unitLabel,
      timeText: slip.timeText,
      dateText: slip.dateText,
      operatorUsername: slip.operatorUsername,
      logoScale,
    },
  });
}

function resolveAndroidBarcodeBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  const bridgeCandidates = [
    { name: "AndroidPrinter", target: window.AndroidPrinter },
    { name: "SunmiPrinter", target: window.SunmiPrinter },
    { name: "Android", target: window.Android },
  ];
  const methodCandidates = [
    "printBarcodeLabel",
    "printBarcode",
  ];

  for (const candidate of bridgeCandidates) {
    if (!candidate?.target) continue;
    for (const methodName of methodCandidates) {
      const method = candidate.target?.[methodName];
      if (typeof method !== "function") continue;
      return {
        name: `${candidate.name}.${methodName}`,
        invoke(payloadJson) {
          return method.call(candidate.target, payloadJson);
        },
      };
    }
  }

  return null;
}

function buildBarcodeBridgePayloadJson(payload) {
  return JSON.stringify({
    type: "qty_barcode_label",
    version: 1,
    source: "production-line-web",
    data: {
      barcodeType: payload.barcodeType || "CODE128",
      paperWidthMm: payload.paperWidthMm || 58,
      barcodeValue: payload.barcodeValue,
      displayQty: payload.displayQty,
      label: payload.label,
      humanText: payload.humanText,
      copies: payload.copies || 1,
    },
  });
}

async function tryPrintQtyBarcodeWithAndroidBridge(payload) {
  const bridge = resolveAndroidBarcodeBridge();
  if (!payload?.barcodeValue) {
    return { ok: false, reason: "invalid-payload", bridgeName: null };
  }
  if (!bridge) {
    return { ok: false, reason: "bridge-not-found", bridgeName: null };
  }

  try {
    const payloadJson = buildBarcodeBridgePayloadJson(payload);
    const result = bridge.invoke(payloadJson);
    const settled = result && typeof result.then === "function"
      ? await result
      : result;
    if (isBridgePrintFailure(settled)) {
      return { ok: false, reason: "bridge-failed", bridgeName: bridge.name };
    }
    return { ok: true, channel: "android-bridge", bridgeName: bridge.name };
  } catch (error) {
    console.warn(`Android barcode bridge print failed (${bridge.name})`, error);
    return { ok: false, reason: "bridge-failed", bridgeName: bridge.name };
  }
}

async function tryPrintWithAndroidBridgePayload(payloadJson) {
  const bridge = resolveAndroidPrintBridge();
  if (!payloadJson) {
    return { ok: false, reason: "invalid-slip", bridgeName: null };
  }
  if (!bridge) {
    return { ok: false, reason: "bridge-not-found", bridgeName: null };
  }

  try {
    const result = bridge.invoke(payloadJson);
    const settled = result && typeof result.then === "function"
      ? await result
      : result;
    if (isBridgePrintFailure(settled)) {
      return { ok: false, reason: "bridge-failed", bridgeName: bridge.name };
    }
    return { ok: true, channel: "android-bridge", bridgeName: bridge.name };
  } catch (error) {
    console.warn(`Android bridge print failed (${bridge.name}), fallback to next strategy`, error);
    return { ok: false, reason: "bridge-failed", bridgeName: bridge.name };
  }
}

async function ensureSunmiSdkLoaded() {
  if (typeof window === "undefined") return null;
  if (window.SUNMI) return window.SUNMI;

  if (!window.__sunmiSdkLoadingPromise) {
    window.__sunmiSdkLoadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-sunmi-sdk='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.SUNMI || null), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = SUNMI_SDK_URL;
      script.async = true;
      script.dataset.sunmiSdk = "true";
      script.onload = () => resolve(window.SUNMI || null);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  try {
    return await window.__sunmiSdkLoadingPromise;
  } catch {
    return null;
  }
}

async function tryPrintWithSunmiSdk(slip) {
  const SUNMI = await ensureSunmiSdkLoaded();
  if (!slip) {
    return { ok: false, reason: "invalid-slip" };
  }
  if (!SUNMI) {
    return { ok: false, reason: "sdk-not-available" };
  }

  try {
    const sdk = new SUNMI();
    if (typeof sdk.launchPrinterService === "function") {
      await sdk.launchPrinterService();
    }
    if (typeof sdk.init === "function") {
      sdk.init();
    }

    const lineApi = sdk?.printer?.lineApi;
    if (!lineApi || typeof lineApi.printText !== "function") {
      return { ok: false, reason: "sdk-not-available" };
    }

    const BaseStyle = sdk?.class?.BaseStyle;
    const TextStyle = sdk?.class?.TextStyle;
    const Align = sdk?.ENUM?.Align;

    const baseStyle = BaseStyle?.getStyle ? BaseStyle.getStyle() : {};
    const textStyle = TextStyle?.getStyle ? TextStyle.getStyle() : {};
    const centerTextStyle = Align ? { ...textStyle, align: Align.CENTER } : textStyle;

    if (typeof lineApi.initLine === "function") {
      await lineApi.initLine(baseStyle);
    }

    await lineApi.printText("ใบบันทึกงาน", centerTextStyle);
    await lineApi.printText(`เวลา: ${slip.timeText}`, centerTextStyle);
    await lineApi.printText(`วันที่: ${slip.dateText}`, centerTextStyle);
    await lineApi.printText(`เลขเอกสาร: ${textOrDash(slip.docNo)}`, centerTextStyle);
    await lineApi.printText(`เครื่อง: ${textOrDash(slip.machineCode)}`, centerTextStyle);
    await lineApi.printText("--------------------------------", textStyle);
    await lineApi.printText(`ประเภทงาน : ${textOrDash(slip.workTypeName)}`, textStyle);
    await lineApi.printText(`รหัส-ชื่อ : ${textOrDash(slip.employeeCode)} - ${textOrDash(slip.employeeName)}`, textStyle);
    await lineApi.printText(`Size : ${textOrDash(slip.sizeValue)}`, textStyle);
    await lineApi.printText(`เนื้อขนม : ${textOrDash(slip.fillingValue)}`, textStyle);
    await lineApi.printText(`ผู้บันทึก : ${textOrDash(slip.operatorUsername)}`, textStyle);
    await lineApi.printText("--------------------------------", textStyle);
    await lineApi.printText(`${textOrDash(slip.valueLabel)} : ${textOrDash(slip.amountText)} ${textOrDash(slip.unitLabel)}`, textStyle);
    await lineApi.printText("--------------------------------", textStyle);

    if (typeof lineApi.autoOut === "function") {
      await lineApi.autoOut();
    }

    return { ok: true, channel: "sunmi-js-sdk" };
  } catch (error) {
    console.warn("Sunmi direct print failed, fallback to browser print", error);
    return { ok: false, reason: "sdk-failed" };
  }
}

export async function printDailyWorkSlipDirect(slip) {
  const deviceInfo = getRuntimeDeviceInfo();
  if (!slip) {
    return { ok: false, channel: null, reason: "invalid-slip", details: deviceInfo };
  }

  const bridgeResult = await tryPrintWithAndroidBridgePayload(buildDailyWorkBridgePayloadJson(slip));
  if (bridgeResult.ok) {
    return {
      ok: true,
      channel: bridgeResult.channel,
      reason: null,
      details: {
        ...deviceInfo,
        bridgeName: bridgeResult.bridgeName || null,
      },
    };
  }

  const sdkResult = await tryPrintWithSunmiSdk(slip);
  if (sdkResult.ok) {
    return {
      ok: true,
      channel: sdkResult.channel,
      reason: null,
      details: {
        ...deviceInfo,
        bridgeName: bridgeResult.bridgeName || null,
      },
    };
  }

  const reasonTrail = [bridgeResult.reason, sdkResult.reason].filter(Boolean);
  const isNoDirectChannel = reasonTrail.every(
    (reason) => reason === "bridge-not-found" || reason === "sdk-not-available"
  );

  let reason = reasonTrail[0] || "direct-print-unavailable";
  if (deviceInfo.isSunmiDevice) {
    reason = isNoDirectChannel ? "sunmi-direct-unavailable" : "sunmi-direct-failed";
  }

  return {
    ok: false,
    channel: null,
    reason,
    details: {
      ...deviceInfo,
      bridgeName: bridgeResult.bridgeName || null,
      reasonTrail,
    },
  };
}

export async function printPieceRateSlipDirect(slip) {
  const deviceInfo = getRuntimeDeviceInfo();
  if (!slip) {
    return { ok: false, channel: null, reason: "invalid-slip", details: deviceInfo };
  }

  const bridgeResult = await tryPrintWithAndroidBridgePayload(buildPieceRateBridgePayloadJson(slip));
  if (bridgeResult.ok) {
    return {
      ok: true,
      channel: bridgeResult.channel,
      reason: null,
      details: {
        ...deviceInfo,
        bridgeName: bridgeResult.bridgeName || null,
      },
    };
  }

  return {
    ok: false,
    channel: null,
    reason: deviceInfo.isSunmiDevice
      ? (bridgeResult.reason === "bridge-not-found" ? "sunmi-direct-unavailable" : "sunmi-direct-failed")
      : (bridgeResult.reason || "direct-print-unavailable"),
    details: {
      ...deviceInfo,
      bridgeName: bridgeResult.bridgeName || null,
      reasonTrail: [bridgeResult.reason].filter(Boolean),
    },
  };
}

export async function printQtyBarcodeDirect(payload) {
  const deviceInfo = getRuntimeDeviceInfo();
  if (!payload?.barcodeValue) {
    return { ok: false, channel: null, reason: "invalid-payload", details: deviceInfo };
  }

  const bridgeResult = await tryPrintQtyBarcodeWithAndroidBridge(payload);
  if (bridgeResult.ok) {
    return {
      ok: true,
      channel: bridgeResult.channel,
      reason: null,
      details: {
        ...deviceInfo,
        bridgeName: bridgeResult.bridgeName || null,
      },
    };
  }

  return {
    ok: false,
    channel: null,
    reason: deviceInfo.isSunmiDevice ? "sunmi-direct-failed" : (bridgeResult.reason || "direct-print-unavailable"),
    details: {
      ...deviceInfo,
      bridgeName: bridgeResult.bridgeName || null,
      reasonTrail: [bridgeResult.reason].filter(Boolean),
    },
  };
}
