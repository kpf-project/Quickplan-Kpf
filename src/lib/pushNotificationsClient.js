"use client";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function getBrowserPushState() {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }

  const registration = await navigator.serviceWorker.getRegistration("/push/");
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  return {
    supported: true,
    standalone: isStandalonePwa(),
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    endpoint: subscription?.endpoint || null,
  };
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/push/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/push/" });
}

export async function subscribeToPlanningPush() {
  if (!isPushSupported()) {
    throw new Error("เบราว์เซอร์นี้ยังไม่รองรับ Web Push");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("ยังไม่ได้อนุญาตการแจ้งเตือน");
  }

  const keyResponse = await fetch("/api/notifications/push/public-key", { cache: "no-store" });
  const keyPayload = await keyResponse.json().catch(() => ({}));
  if (!keyResponse.ok || !keyPayload.publicKey) {
    throw new Error(keyPayload.error || "ยังไม่ได้ตั้งค่า VAPID public key");
  }

  const registration = await getServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey),
  });

  const response = await fetch("/api/notifications/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      eventTypes: ["planning.master_published", "planning.subplan_confirmed"],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "บันทึก subscription ไม่สำเร็จ");
  }

  return getBrowserPushState();
}

export async function unsubscribeFromPlanningPush() {
  if (!isPushSupported()) {
    return getBrowserPushState();
  }

  const registration = await navigator.serviceWorker.getRegistration("/push/");
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  const endpoint = subscription?.endpoint || null;
  if (subscription) {
    await subscription.unsubscribe();
  }

  await fetch("/api/notifications/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  return getBrowserPushState();
}
