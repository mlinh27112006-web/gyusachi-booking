// Trang chủ: banner tự chuyển và sơ đồ vị trí có thể kéo, phóng to.
(function () {
  // ---- Banner ----
  const slides = [...document.querySelectorAll('#slides .slide')], dots = [...document.querySelectorAll('#dots i')];
  let cur = 0;
  function show(n) { cur = (n + slides.length) % slides.length; slides.forEach((e, i) => e.classList.toggle('on', i === cur)); dots.forEach((e, i) => e.classList.toggle('on', i === cur)); }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => show(cur + 1), 5000);

})();

(function () {
  const box = document.getElementById('cnt'); if (!box) return;
  fetch('/api/stats/month').then((r) => r.json()).then((d) => {
    if (!d || !(d.count >= 0)) return;
    const el = document.getElementById('cnt-n'); box.hidden = false;
    const end = d.count, t0 = performance.now();
    (function tick(t) { const k = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); })(t0);
  }).catch(() => {});
})();
