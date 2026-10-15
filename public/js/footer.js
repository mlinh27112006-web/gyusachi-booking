// Chân trang đầy đủ + nút gọi nổi + hiệu ứng hiện dần. Dùng chung cho các trang khách.
(function () {
  const T = {
    vi: { tag: 'Thịt nướng Nhật Bản. Mỗi bàn là một mặt bếp nhỏ dành cho người bạn thương.', ex: 'Khám phá', about: 'Về chúng tôi', menu: 'Thực đơn', book: 'Đặt bàn', lookup: 'Tra cứu đặt bàn', jobs: 'Tuyển dụng',
      ct: 'Liên hệ', hrs: 'Giờ mở cửa', wk: 'Thứ 2 – Thứ 6', we: 'Thứ 7 – Chủ nhật', call: 'Gọi', map: 'Xem bản đồ', rights: 'Bảo lưu mọi quyền.' },
    en: { tag: 'Japanese yakiniku. Every table is a small grill for the people you love.', ex: 'Explore', about: 'About us', menu: 'Menu', book: 'Book a table', lookup: 'Find booking', jobs: 'Careers',
      ct: 'Contact', hrs: 'Opening hours', wk: 'Mon – Fri', we: 'Sat – Sun', call: 'Call', map: 'View map', rights: 'All rights reserved.' }
  };
  const MAP = 'https://www.google.com/maps/search/?api=1&query=44+Tr%E1%BA%A7n+V%C4%83n+Tr%E1%BB%A9+%C4%90%C3%A0+N%E1%BA%B5ng';
  function render() {
    const t = T[(window.I18N && I18N.lang) === 'en' ? 'en' : 'vi'];
    let f = document.querySelector('footer.foot');
    if (!f) { f = document.createElement('footer'); document.body.appendChild(f); }
    f.className = 'foot site-foot';
    f.innerHTML = `
      <div class="sf-grid">
        <div class="sf-brand"><div class="sf-logo"><img src="/img/logo.png" alt="" width="46" height="40"><span>GYU SACHI</span></div><p>${t.tag}</p></div>
        <div><h4>${t.ex}</h4><a href="/about.html">${t.about}</a><a href="/menu.html">${t.menu}</a><a href="/book.html">${t.book}</a><a href="/lookup.html">${t.lookup}</a><a href="/recruitment.html">${t.jobs}</a></div>
        <div><h4>${t.ct}</h4><p>44 Trần Văn Trứ, Đà Nẵng</p><a href="tel:0934971972">0934 971 972</a><a href="${MAP}" target="_blank" rel="noopener">${t.map} →</a></div>
        <div><h4>${t.hrs}</h4><p>${t.wk}<br>10:30 – 14:00 · 16:30 – 22:00</p><p>${t.we}<br>10:30 – 22:00</p></div>
      </div>
      <div class="sf-bot">© ${new Date().getFullYear()} Gyu Sachi Yakiniku · ${t.rights}</div>`;
    let c = document.getElementById('callfab');
    if (!c) { c = document.createElement('a'); c.id = 'callfab'; c.href = 'tel:0934971972'; document.body.appendChild(c); }
    c.setAttribute('aria-label', t.call + ' 0934 971 972'); c.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg>';
  }
  render();
  if (!document.getElementById('gchat')) { const s = document.createElement('script'); s.src = '/js/chatbot.js'; document.body.appendChild(s); }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setTimeout(render, 80)));
  const top = document.querySelector('header.top');
  const onScroll = () => top && top.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ('IntersectionObserver' in window) {
    const els = document.querySelectorAll('.block-in, .pb-card, .perks > div, .job, .feat, .step, .cards > *');
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e) => { e.classList.add('rv'); io.observe(e); });
  }
})();
