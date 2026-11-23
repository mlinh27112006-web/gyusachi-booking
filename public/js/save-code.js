// Trang đặt xong: thêm nút "Thêm vào lịch" (.ics), "Sao chép mã", và nhớ mã trên thiết bị để trang tra cứu tự điền.
// Chạy độc lập với book.js: chờ khối #done hiện ra rồi tra cứu lại lượt vừa đặt bằng đúng SĐT + mã khách vừa dùng.
(function () {
  'use strict';
  const done = document.getElementById('done'); if (!done) return;
  const T = {
    vi: { cal: 'Thêm vào lịch', copy: 'Sao chép mã', copied: 'Đã sao chép', hint: 'Hãy lưu mã đặt bàn: bạn cần mã và số điện thoại để tra cứu hoặc hủy lượt đặt.' },
    en: { cal: 'Add to calendar', copy: 'Copy code', copied: 'Copied', hint: 'Please save your booking code: you need it with your phone number to look up or cancel.' },
  };
  const lang = () => ((window.I18N && I18N.lang) || document.documentElement.lang) === 'en' ? 'en' : 'vi';
  let lastCode = null;

  async function setup() {
    const code = (document.getElementById('done-code').textContent || '').trim();
    const phone = ((document.getElementById('f-phone') || {}).value || '').trim();
    if (!code || code === lastCode) return; lastCode = code;
    const old = done.querySelector('.save-code'); if (old) old.remove();
    const tx = T[lang()];
    const box = document.createElement('div'); box.className = 'btn-row save-code';
    box.innerHTML = `<p class="empty" style="flex-basis:100%">${tx.hint}</p><button type="button" class="btn ghost" data-copy>${tx.copy}</button><button type="button" class="btn ghost" data-cal hidden>${tx.cal}</button>`;
    done.querySelector('.btn-row').before(box);
    box.querySelector('[data-copy]').addEventListener('click', async (ev) => {
      try { await navigator.clipboard.writeText(code); ev.target.textContent = tx.copied; setTimeout(() => { ev.target.textContent = tx.copy; }, 1500); } catch (e) { /* trình duyệt chặn: khách tự chép */ }
    });
    try { localStorage.setItem('gyu:last', JSON.stringify({ phone, code })); } catch (e) { /* bỏ qua */ }
    try {
      const r = await fetch('/api/reservations/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }) });
      if (!r.ok) return; const d = await r.json(); const data = d.reservation || d;
      if (!data.start || !data.end) return;
      const hotline = (document.getElementById('foot-hotline') || {}).textContent || '';
      const b = box.querySelector('[data-cal]'); b.hidden = false;
      b.addEventListener('click', () => window.GyuICS.download(data, hotline, lang()));
    } catch (e) { /* không có nút lịch thì thôi */ }
  }
  new MutationObserver(() => { if (!done.hidden) setup(); }).observe(done, { attributes: true, attributeFilter: ['hidden'] });
})();
