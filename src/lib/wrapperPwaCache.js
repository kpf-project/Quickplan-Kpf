export const SUNMI_WRAPPER_USER_AGENT_TOKEN = "KPF-SUNMI-WRAPPER";

const PWA_RUNTIME_CACHE_NAMES = new Set([
  "start-url",
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-image-assets",
  "next-image",
  "static-audio-assets",
  "static-video-assets",
  "static-js-assets",
  "static-style-assets",
  "next-data",
  "static-data-assets",
  "apis",
  "others",
  "cross-origin",
]);

export function isSunmiWrapperUserAgent(userAgent) {
  return String(userAgent || "")
    .toUpperCase()
    .includes(SUNMI_WRAPPER_USER_AGENT_TOKEN);
}

export function shouldRegisterPwaServiceWorker(userAgent) {
  return !isSunmiWrapperUserAgent(userAgent);
}

export function isPwaRuntimeCacheName(cacheName) {
  const normalized = String(cacheName || "").trim();
  return normalized.startsWith("workbox-") || PWA_RUNTIME_CACHE_NAMES.has(normalized);
}

export async function cleanupWrapperPwaCaches(globalObject = globalThis) {
  const navigatorRef = globalObject.navigator;
  const serviceWorker = navigatorRef?.serviceWorker;
  const cacheStorage = globalObject.caches;

  const unregisterPromise = serviceWorker?.getRegistrations
    ? serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
    : Promise.resolve([]);

  const cacheDeletePromise = cacheStorage?.keys
    ? cacheStorage.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(isPwaRuntimeCacheName)
            .map((cacheName) => cacheStorage.delete(cacheName)),
        ),
      )
    : Promise.resolve([]);

  await Promise.all([unregisterPromise, cacheDeletePromise]);
}
