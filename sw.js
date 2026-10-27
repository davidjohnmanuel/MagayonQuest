// Magayon Quest service worker: offline app shell + push notifications.
const CACHE = "fde-quest-v1";
const SHELL = ["/", "/index.html", "/config.js", "/supabase.js", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first for the app itself (so updates land right away), cache as the offline fallback.
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match("/index.html")))
  );
});

// Push: show the notification unless the app is already open on screen.
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err){ data = { title: "Magayon Quest", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Magayon Quest";
  const opts = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "fde",
    renotify: true,
    data: { url: data.url || "/" }
  };
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const visible = list.some(c => c.visibilityState === "visible" && c.focused);
      if (visible && !data.always) return;
      return self.registration.showNotification(title, opts);
    })
  );
});

// Tap a notification: focus the open app on the right screen, or open it.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list){
        if (new URL(c.url).origin === self.location.origin){ c.navigate(target).catch(() => {}); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
