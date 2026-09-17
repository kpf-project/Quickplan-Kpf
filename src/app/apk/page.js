import ApkDownloadPageClient from "@/app/apk/ApkDownloadPageClient";

const APK_RELEASE = {
  version: "1.0.4",
  fileName: "kpf-sunmi-wrapper-1.0.4.apk",
  releaseDate: "13 July 2026",
  packageName: "com.kpf.productionline.sunmiwrapper",
  minAndroid: "Android 7.0+",
};

const DEFAULT_BASE_URL = "https://production.kpfoods.co.th";

export const metadata = {
  title: "SUNMI V3 APK Download",
  description: "ดาวน์โหลดแอป SUNMI Wrapper สำหรับ Daily Work",
};

export default function ApkDownloadPage() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL;
  return <ApkDownloadPageClient release={APK_RELEASE} baseUrl={baseUrl} />;
}
