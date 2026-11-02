// Nhận tín hiệu thời gian thực từ server (SSE). Nếu mất kết nối, các trang vẫn tự làm mới theo chu kỳ dự phòng.
(function () {
  const subs = new Set(); let es = null, t = null, up = false;
  function fire() { clearTimeout(t); t = setTimeout(() => { if (document.hidden) return; subs.forEach((f) => { try { f(); } catch (e) {} }); }, 200); }
  let badge = null;
  function showBadge(v) {
    if (!badge) {
      badge = document.createElement('div'); badge.setAttribute('aria-live', 'polite');
      badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;font:600 12px system-ui,sans-serif;padding:5px 10px;border-radius:99px;background:rgba(18,6,6,.85);color:#e6cf94;border:1px solid rgba(201,162,75,.4);pointer-events:none;transition:opacity .3s';
      document.body.appendChild(badge);
    }
    badge.innerHTML = v ? '<span style="color:#4ade80">●</span> Cập nhật trực tiếp' : '<span style="color:#9ca3af">●</span> Đang kết nối lại…';
  }
  function setUp(v) {
    showBadge(v); up = v; document.documentElement.classList.toggle('live-on', v); subs.forEach((f) => f.status && f.status(v)); }
  function open() {
    if (es || !window.EventSource) return;
    es = new EventSource('/api/stream');
    es.addEventListener('hello', () => setUp(true));
    es.addEventListener('changed', fire);
    es.onerror = () => setUp(false);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && up) fire(); });
  window.GSLive = {
    on(fn) { subs.add(fn); open(); return () => subs.delete(fn); },
    get connected() { return up; },
  };
})();
