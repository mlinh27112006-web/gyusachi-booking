// Màn hình "Timeline": mỗi bàn một dòng, trục ngang là giờ trong ngày. Nhìn một lượt biết bàn nào kín, bàn nào trống khung nào.
(function () {
  'use strict';
  const { esc } = Admin;
  const R = Admin.res;
  const PX = 1.15;            // số px mỗi phút (cuộn ngang trên màn nhỏ)
  const OPEN = 10 * 60 + 30;  // 10:30
  const CLOSE = 22 * 60;      // 22:00

  const mins = (local) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const nowMin = () => { const p = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }); return Number(p.slice(0, 2)) * 60 + Number(p.slice(3, 5)); };

  Admin.screens.timeline = {
    title: 'Timeline bàn', permission: 'reservation.view',
    render(root) {
      const st = { date: R.today(), list: [], tables: [], floor: 0, sel: null };
      let dead = false; let timer = null; let seq = 0;
      root.innerHTML = `
        <div class="toolbar">
          <div class="date-nav">
            <button type="button" class="btn sm" data-d="-1" aria-label="Ngày trước">&lsaquo;</button>
            <input type="date" id="tl-date" aria-label="Ngày" value="${st.date}">
            <button type="button" class="btn sm" data-d="1" aria-label="Ngày sau">&rsaquo;</button>
            <button type="button" class="btn sm" data-d="0">Hôm nay</button>
          </div>
          <span id="tl-floors"></span><span class="spacer"></span>
          <span class="tl-legend"><i class="tl-wait"></i>Chờ khách <i class="tl-seated"></i>Đang dùng <i class="tl-done"></i>Đã về <i class="tl-noshow"></i>Không đến</span>
        </div>
        <div class="panel tl-panel"><div id="tl" class="tl-scroll" aria-live="polite"><p class="muted">Đang tải...</p></div></div>
        <div class="panel" id="tl-detail" hidden></div>`;
      const $ = (s) => root.querySelector(s);

      async function load() {
        const my = ++seq;
        try {
          const [list, slots] = await Promise.all([R.fetchList({ date: st.date }), Admin.api('GET', `/api/staff/slots?date=${st.date}`).catch(() => ({ slots: [] }))]);
          let tables = st.tables;
          if (slots.slots && slots.slots.length) {
            const q = new URLSearchParams({ date: st.date, time: slots.slots[0], party: '1' });
            tables = (await Admin.api('GET', `/api/staff/tables/map?${q}`)).tables;
          }
          if (my !== seq || dead) return;
          st.list = list; st.tables = tables;
        } catch (e) { if (!dead && my === seq) Admin.toast((e && e.message) || 'Không tải được timeline'); return; }
        draw();
      }

      function rowsFor() {
        // Bàn lấy từ sơ đồ; bàn có lượt đặt nhưng không còn trong sơ đồ (đã tắt) vẫn hiện để không sót khách.
        const map = new Map();
        for (const t of st.tables) map.set(t.code, { code: t.code, floor: t.floor, capacity: t.capacity });
        for (const r of st.list) if (!map.has(r.tableCode)) map.set(r.tableCode, { code: r.tableCode, floor: r.floor, capacity: null });
        return [...map.values()].filter((t) => !st.floor || t.floor === st.floor)
          .sort((a, b) => a.floor - b.floor || a.code.localeCompare(b.code, 'vi', { numeric: true }));
      }

      function draw() {
        const shown = st.list.filter((r) => r.status !== 'cancelled');
        let lo = OPEN; let hi = CLOSE + 45;
        for (const r of shown) { lo = Math.min(lo, mins(r.start)); hi = Math.max(hi, r.end.slice(0, 10) === r.start.slice(0, 10) ? mins(r.end) : 24 * 60); }
        lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
        const W = (hi - lo) * PX;
        const x = (m) => (m - lo) * PX;

        const fl = $('#tl-floors'); fl.textContent = '';
        for (const f of [0, 1, 2]) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(f === st.floor));
          b.textContent = f ? `Tầng ${f}` : 'Tất cả'; b.addEventListener('click', () => { st.floor = f; draw(); }); fl.appendChild(b);
        }

        const rows = rowsFor();
        if (rows.length === 0) { $('#tl').innerHTML = '<p class="empty">Chưa có dữ liệu bàn cho ngày này.</p>'; return; }
        let head = ''; for (let m = lo; m <= hi; m += 60) head += `<span style="left:${x(m)}px">${hhmm(m)}</span>`;
        const grid = []; for (let m = lo; m < hi; m += 60) grid.push(`<b style="left:${x(m)}px"></b>`);
        const isToday = st.date === R.today();
        const nowLine = isToday && nowMin() >= lo && nowMin() <= hi ? `<u class="tl-now" style="left:${x(nowMin())}px" title="Bây giờ ${hhmm(nowMin())}"></u>` : '';
        // Vùng ngoài giờ mở cửa/đóng cửa tô xám nhẹ.
        const off = `<s style="left:0;width:${Math.max(0, x(OPEN))}px"></s><s style="left:${x(CLOSE)}px;width:${Math.max(0, W - x(CLOSE))}px"></s>`;

        const lines = rows.map((t) => {
          const mine = shown.filter((r) => r.tableCode === t.code);
          const bars = mine.map((r) => {
            const a = mins(r.start); const e = r.end.slice(0, 10) === r.start.slice(0, 10) ? mins(r.end) : 24 * 60;
            const s = R.statusOf(r);
            return `<button type="button" class="tl-bar tl-${s.c}${st.sel === r.id ? ' on' : ''}" data-id="${r.id}" style="left:${x(a)}px;width:${Math.max(24, (e - a) * PX)}px" title="${esc(r.customerName)} · ${r.partySize} khách · ${esc(r.start.slice(11))}-${esc(r.end.slice(11))} · ${esc(s.t)}"><strong>${esc(r.start.slice(11))}</strong> ${esc(r.customerName)} · ${r.partySize}</button>`;
          }).join('');
          return `<div class="tl-row"><div class="tl-name"><strong>${esc(t.code.toUpperCase())}</strong><small>T${t.floor}${t.capacity ? ` · ${t.capacity} chỗ` : ''}</small></div><div class="tl-lane" style="width:${W}px">${off}${grid.join('')}${nowLine}${bars}</div></div>`;
        }).join('');
        $('#tl').innerHTML = `<div class="tl-inner" style="min-width:${W + 92}px"><div class="tl-row tl-headrow"><div class="tl-name"></div><div class="tl-lane tl-head" style="width:${W}px">${head}</div></div>${lines}</div>`;
        $('#tl').querySelectorAll('.tl-bar').forEach((b) => b.addEventListener('click', () => { st.sel = Number(b.dataset.id); draw(); }));
        detail();
        if (isToday && !st.scrolled) { const sc = $('#tl'); sc.scrollLeft = Math.max(0, x(nowMin()) - 160); st.scrolled = true; }
      }

      function detail() {
        const box = $('#tl-detail'); const r = st.list.find((x) => x.id === st.sel);
        if (!r) { box.hidden = true; return; }
        const s = R.statusOf(r);
        box.hidden = false;
        box.innerHTML = `<div class="panel-head"><h2>${esc(r.customerName)} <small>${esc(r.bookingCode)}</small></h2><span class="badge ${s.c}">${esc(s.t)}</span></div>
          <p>Bàn <strong>${esc(r.tableCode.toUpperCase())}</strong> (tầng ${r.floor}) · ${esc(r.start.slice(11))} đến ${esc(r.end.slice(11))} · ${r.partySize} khách · ${esc(r.customerPhone)} · ${esc((R.CHANNEL[r.channel]) || r.channel)}</p>
          ${r.note ? `<p class="hint">Ghi chú: ${esc(r.note)}</p>` : ''}
          <div class="acts">${R.actionButtons(r)}</div>`;
      }

      R.bindActions(root, (id) => st.list.find((r) => r.id === id), load);
      root.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
        const n = Number(b.dataset.d); st.date = n === 0 ? R.today() : R.addDays(st.date, n);
        $('#tl-date').value = st.date; st.sel = null; st.scrolled = false; load();
      }));
      $('#tl-date').addEventListener('change', (e) => { if (e.target.value) { st.date = e.target.value; st.sel = null; st.scrolled = false; load(); } });

      load(); timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
      const off = window.GSLive ? GSLive.on(() => load()) : () => {};
      return { destroy() { dead = true; off(); clearInterval(timer); } };
    },
  };
})();
