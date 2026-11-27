// Mặt bằng nhà hàng 2 tầng, dùng chung cho trang khách và trang quản trị.
// Toạ độ tính theo ô 100 x 130 (x, y là góc trên trái; w, h là rộng, cao), được quy ra phần trăm khi vẽ.
(function () {
  'use strict';
  const W = 100; const H = 130;

  const COL_L = { x: 5, w: 34 };     // cột bàn bên trái
  const COL_R = { x: 61, w: 34 };    // cột bàn bên phải (tầng 2)
  const ROW = 14;                    // chiều cao một bàn thường
  const row = (i) => 28 + i * 17;    // hàng bàn thứ i ở tầng 2

  const PLAN = {
    1: {
      landmarks: [
        { kind: 'aisle', label: 'LỐI ĐI', x: 43, y: 6, w: 15, h: 112 },
        { kind: 'stairs', label: 'CẦU THANG', x: 64, y: 6, w: 32, h: 14 },
        { kind: 'cashier', label: 'QUẦY THU NGÂN', x: 64, y: 23, w: 32, h: 14 },
        { kind: 'kitchen', label: 'BẾP', x: 64, y: 61, w: 32, h: 57 },
        { kind: 'wc', label: 'NHÀ VỆ SINH', x: 3, y: 109, w: 38, h: 16 },
      ],
      tables: {
        a6: { x: COL_L.x, y: 6, w: COL_L.w, h: ROW }, a5: { x: COL_L.x, y: 23, w: COL_L.w, h: ROW },
        a4: { x: COL_L.x, y: 40, w: COL_L.w, h: ROW }, a3: { x: COL_L.x, y: 57, w: COL_L.w, h: ROW },
        a2: { x: COL_L.x, y: 74, w: COL_L.w, h: ROW }, a1: { x: COL_L.x, y: 91, w: COL_L.w, h: ROW },
        a7: { x: 66, y: 42, w: 28, h: ROW },
      },
    },
    2: {
      landmarks: [
        { kind: 'stairs', label: 'CẦU THANG', x: 70, y: row(2), w: 28, h: ROW },
        { kind: 'wc', label: 'NHÀ VỆ SINH', x: 3, y: 113, w: 38, h: 14 },
      ],
      tables: {
        vip1: { x: COL_L.x, y: 6, w: COL_L.w, h: 16 }, b5: { x: COL_L.x, y: row(0) + 1, w: COL_L.w, h: ROW },
        b4: { x: COL_L.x, y: row(1) + 1, w: COL_L.w, h: ROW }, b3: { x: COL_L.x, y: row(2) + 1, w: COL_L.w, h: ROW },
        b2: { x: COL_L.x, y: row(3) + 1, w: COL_L.w, h: ROW }, b1: { x: COL_L.x, y: row(4) + 1, w: COL_L.w, h: ROW },
        vip2: { x: COL_R.x, y: 6, w: COL_R.w, h: 16 }, b9: { x: COL_R.x, y: row(0) + 1, w: COL_R.w, h: ROW },
        b8: { x: COL_R.x, y: row(1) + 1, w: COL_R.w, h: ROW },
        b6: { x: COL_R.x, y: row(3) + 1, w: COL_R.w, h: ROW }, b7: { x: COL_R.x, y: row(4) + 1, w: COL_R.w, h: ROW },
      },
    },
  };

  // Biểu tượng vẽ bằng nét, màu theo chữ.
  const svg = (d) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    stairs: svg('<path d="M3 20h4v-4h4v-4h4V8h6"/><path d="M3 20h18"/>'),
    cashier: svg('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M7 9V5h10v4M8 13h2M12 13h2M16 13h.01M8 16.5h8"/>'),
    kitchen: svg('<path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.8-2.6 1.6-3.6C10.4 6.6 11.6 5.4 12 3z"/><path d="M5 20h14"/>'),
    wc: svg('<circle cx="7" cy="5" r="1.6"/><path d="M4.5 21v-6H3.4l1.2-5.4a1.6 1.6 0 0 1 1.6-1.2h1.6a1.6 1.6 0 0 1 1.6 1.2L10.6 15H9.5v6z"/><circle cx="17" cy="5" r="1.6"/><path d="M15 21v-5.5h-1.6l2-5.6a1 1 0 0 1 1.2-.6 1 1 0 0 1 1.2.6l2 5.6H18.2V21z"/>'),
    crown: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'),
  };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const box = (r) => `left:${(r.x / W) * 100}%;top:${(r.y / H) * 100}%;width:${(r.w / W) * 100}%;height:${(r.h / H) * 100}%`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Ghế: các viên nhỏ dọc hai cạnh dài của bàn.
  function seats(n) {
    const top = Math.ceil(n / 2); const bottom = Math.floor(n / 2);
    const line = (k, pos) => `<span class="fp-seats s-${pos}" aria-hidden="true">${'<i></i>'.repeat(k)}</span>`;
    return line(top, 'top') + (bottom ? line(bottom, 'bot') : '');
  }

  // Vẽ một tầng vào container.
  //   tables: danh sách bàn từ API; floor: 1 hoặc 2
  //   o.stateOf(tb) -> chuỗi class trạng thái (free, mine, taken, off, wait, seated, ... có thể kèm 'sel')
  //   o.label(stateFirstWord, tb) -> chữ mô tả cho tooltip
  //   o.onPick(tb, state) -> khi bấm vào bàn;  o.disabled(state) -> bàn không bấm được
  //   o.cls: tên class riêng của trang ('tbl' hoặc 'atbl') để mã cũ vẫn tìm được
  function render(container, tables, floor, o) {
    o = o || {};
    container.textContent = '';
    container.classList.add('fp');
    const layout = PLAN[floor] || { landmarks: [], tables: {} };
    for (const lm of layout.landmarks) {
      const d = el('div', `fp-l ${lm.kind}`, lm.kind === 'aisle' ? `<span>${lm.label}</span>` : `${ICONS[lm.kind] || ''}<span>${lm.label}</span>`);
      d.style.cssText = box(lm); d.setAttribute('role', 'img'); d.setAttribute('aria-label', lm.label);
      container.appendChild(d);
    }
    for (const tb of tables.filter((x) => x.floor === floor)) {
      const pos = layout.tables[tb.code] || { x: tb.mapX - 14, y: (tb.mapY / 100) * H - 6, w: 28, h: 12 };
      const st = o.stateOf ? o.stateOf(tb) : 'free';
      const first = st.split(' ')[0];
      const b = el('button', `fp-t ${o.cls || ''} ${st}${tb.isVip ? ' vip' : ''}`);
      b.type = 'button'; b.dataset.cap = String(tb.capacity); b.dataset.id = String(tb.id); b.dataset.code = tb.code;
      b.style.cssText = box(pos);
      const name = tb.code.toUpperCase();
      b.title = `${name}, ${tb.capacity}${o.label ? `: ${o.label(first, tb)}` : ''}`;
      b.setAttribute('aria-label', b.title);
      b.disabled = !!(o.disabled && o.disabled(first));
      b.innerHTML = `${seats(tb.capacity)}<span class="fp-grill" aria-hidden="true"></span><span class="fp-name">${tb.isVip ? `<em class="fp-crown">${ICONS.crown}</em>` : ''}${esc(name)}</span><span class="fp-cap">${esc(o.capText ? o.capText(tb) : `${tb.capacity}`)}</span>`;
      if (!b.disabled && o.onPick) b.addEventListener('click', () => o.onPick(tb, first));
      container.appendChild(b);
    }
  }

  window.FloorPlan = { render };
})();
