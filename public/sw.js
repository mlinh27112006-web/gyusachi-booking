// Service worker: tải nhanh hơn và có trang dự phòng khi mất mạng. KHÔNG lưu /api (dữ liệu đặt bàn luôn lấy mới).
const VER = 'gs-v2';
const SHELL = ['/offline.html', '/css/site.css', '/css/pages.css', '/img/logo.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return;
  if (r.mode === 'navigate') {
    // Trang HTML: ưu tiên mạng, mất mạng thì dùng bản đã lưu hoặc trang offline.
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(VER).then((c) => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then((m) => m || caches.match('/offline.html'))));
    return;
  }
  // Ảnh, CSS, JS: dùng bản đã lưu trước, đồng thời cập nhật ngầm.
  e.respondWith(caches.match(r).then((m) => {
    const net = fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VER).then((c) => c.put(r, cp)); } return res; }).catch(() => m);
    return m || net;
  }));
});
