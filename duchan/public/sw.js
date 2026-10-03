/* Service worker של דוכן — התראות פוש לחמ"ל בלבד.
 *
 * בכוונה בלי fetch handler ובלי מטמון: הוא לא נוגע בשום בקשה של האתר,
 * כך שאין סיכון שילדה תראה גרסה ישנה של הדוכן בגללו. כל מה שהוא עושה:
 * מציג התראה כשמגיע פוש, ופותח את החמ"ל כשלוחצים עליה. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { title: "דוכן", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "דוכן", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      dir: "rtl",
      lang: "he",
      data: { url: d.url || "/admin" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/admin", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
