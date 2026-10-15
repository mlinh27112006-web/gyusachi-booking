// Khung chat đặt bàn trên website: nói chuyện với bot bằng câu tự nhiên.
(function () {
  const KEY = 'gyu_chat_sid';
  let sid = null;
  try { sid = sessionStorage.getItem(KEY); } catch { /* không dùng được bộ nhớ trình duyệt */ }
  if (!sid) { sid = 'w' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); try { sessionStorage.setItem(KEY, sid); } catch { /* bỏ qua */ } }

  const root = document.createElement('div');
  root.id = 'gchat';
  root.innerHTML = `
    <button type="button" class="gc-fab" aria-label="Đặt bàn nhanh bằng chat" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
      <span>Đặt bàn nhanh</span>
    </button>
    <section class="gc-panel" hidden aria-label="Trợ lý đặt bàn">
      <header><div class="gc-av">牛幸</div><div><b>Trợ lý Gyu Sachi</b><small>Đặt bàn bằng một câu chat</small></div><button type="button" class="gc-x" aria-label="Đóng">×</button></header>
      <div class="gc-log" role="log" aria-live="polite"></div>
      <div class="gc-chips"></div>
      <form class="gc-form"><input type="text" maxlength="300" placeholder="Ví dụ: đặt bàn 4 người 7h tối mai" aria-label="Tin nhắn" autocomplete="off"><button type="submit" aria-label="Gửi">➤</button></form>
    </section>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const log = $('.gc-log'), input = $('.gc-form input'), panel = $('.gc-panel'), fab = $('.gc-fab');

  function add(text, who) {
    const d = document.createElement('div'); d.className = 'gc-m ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  async function send(text) {
    text = String(text || '').trim(); if (!text) return;
    add(text, 'me'); input.value = '';
    const wait = add('…', 'bot typing');
    try {
      const r = await fetch('/api/bot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, text }) });
      const j = await r.json();
      wait.className = 'gc-m bot'; wait.textContent = r.ok ? j.reply : (j.error || 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.');
    } catch {
      wait.className = 'gc-m bot'; wait.textContent = 'Chưa kết nối được máy chủ. Anh/chị vui lòng gọi hotline 0934 971 972 ạ.';
    }
    log.scrollTop = log.scrollHeight;
  }
  const chips = ['Đặt bàn 4 người 7h tối mai', 'Giờ mở cửa', 'Có ưu đãi gì không?'];
  chips.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.addEventListener('click', () => { $('.gc-chips').hidden = true; send(c); }); $('.gc-chips').appendChild(b); });
  function toggle(open) {
    panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); root.classList.toggle('open', open);
    if (open) { if (!log.children.length) add('Dạ Gyu Sachi xin chào anh/chị! Em có thể giữ bàn giúp anh/chị ngay trong khung chat này. Anh/chị nhắn số người, ngày và giờ muốn đến nhé ạ.', 'bot'); input.focus(); }
  }
  fab.addEventListener('click', () => toggle(panel.hidden));
  $('.gc-x').addEventListener('click', () => toggle(false));
  $('.gc-form').addEventListener('submit', (e) => { e.preventDefault(); $('.gc-chips').hidden = true; send(input.value); });
})();
