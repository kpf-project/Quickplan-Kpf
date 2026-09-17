self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      title: "Quickplan PWA",
      body: event.data ? event.data.text() : "มีการแจ้งเตือนใหม่",
    };
  }

  const title = payload.title || "Quickplan PWA";
  const options = {
    body: payload.body || "มีการแจ้งเตือนใหม่",
    icon: payload.icon || "/icons/icon.svg",
    badge: payload.badge || "/icons/icon.svg",
    tag: payload.tag || "quickplan-production-planning",
    renotify: payload.renotify !== false,
    data: {
      url: payload.url || payload.data?.url || "/production-line/planning/schedule",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/production-line/planning/schedule";

  event.waitUntil((async () => {
    const url = new URL(targetUrl, self.location.origin).href;
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      if ("focus" in client && client.url === url) {
        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
    return undefined;
  })());
});
