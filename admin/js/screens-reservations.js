// Màn hình "Tổng quan hôm nay" và "Danh sách đặt bàn".
(function () {
  'use strict';
  const { esc } = Admin;

  const CHANNEL = { website: 'Website', hotline: 'Hotline', fanpage: 'Fanpage' };
  const ACTIONS = [
    { key: 'arrive', path: 'arrive', label: 'Khách đã đến', cls: 'primary' },
    { key: 'release', path: 'release', label: 'Khách đã về', cls: 'primary' },
    { key: 'no_show', path: 'no-show', label: 'Không đến', cls: '' },
    { key: 'cancel', path: 'cancel', label: 'Hủy', cls: 'danger-ghost' },
  ];
  const CONFIRM = {
    release: (r) => ({ title: 'Khách đã về thật chưa?', text: `Bàn ${r.tableCode.toUpperCase()} (${r.customerName}) sẽ được dọn rồi mở lại cho khách khác. Chỉ bấm khi khách đã rời bàn.`, yes: 'Khách đã về' }),
    no_show: (r) => ({ title: 'Đánh dấu khách không đến?', text: `${r.customerName} (${r.customerPhone}) sẽ bị tính thêm một lần không đến, bàn ${r.tableCode.toUpperCase()} được trả lại.`, yes: 'Không đến', danger: true }),
    cancel: (r) => ({ title: 'Hủy lượt đặt này?', text: `Lượt ${r.bookingCode} của ${r.customerName} sẽ bị hủy, bàn ${r.tableCode.toUpperCase()} được trả lại.`, yes: 'Hủy lượt đặt', danger: true }),
  };

  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const toMs = (local) => Date.parse(`${local.replace(' ', 'T')}:00+07:00`);
  const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  function statusOf(r) {
    if (r.status === 'confirmed') return r.arrivedAt ? { t: 'Đang dùng bàn', c: 'seated' } : { t: 'Chờ khách', c: 'wait' };
    return { completed: { t: 'Đã về', c: 'done' }, no_show: { t: 'Không đến', c: 'noshow' }, cancelled: { t: 'Đã hủy', c: 'cancel' } }[r.status];
  }

  function lateText(r) {
    if (r.status !== 'confirmed' || r.arrivedAt) return '';
    const min = Math.floor((Date.now() - toMs(r.start)) / 60000);
    return min > 0 ? `Trễ ${min >= 60 ? `${Math.floor(min / 60)} giờ ${min % 60} phút` : `${min} phút`}` : '';
  }

  function actionButtons(r) {
    if (!Admin.can('reservation.update_status')) return '';
    return ACTIONS.filter((a) => r.actions[a.key]).map((a) => `<button type="button" class="btn sm ${a.cls}" data-act="${a.key}" data-path="${a.path}" data-id="${r.id}">${a.label}</button>`).join('');
  }

  // Gắn xử lý cho các nút thao tác trong một vùng. reload() được gọi sau khi đổi trạng thái thành công.
  function bindActions(root, byId, reload) {
    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-act]'); if (!btn || btn.disabled) return;
      const r = byId(Number(btn.dataset.id)); if (!r) return;
      const c = CONFIRM[btn.dataset.act];
      if (c) { const o = c(r); if (!(await Admin.confirm(o.title, o.text, o.yes, o.danger))) return; }
      root.querySelectorAll(`button[data-id="${r.id}"]`).forEach((b) => { b.disabled = true; });
      try {
        await Admin.api('POST', `/api/staff/reservations/${r.id}/${btn.dataset.path}`);
        Admin.toast(`${ACTIONS.find((a) => a.key === btn.dataset.act).label}: ${r.tableCode.toUpperCase()} (${r.customerName})`, true);
      } catch (e) { Admin.toast(e.message); }
      reload();
    });
  }

  async function fetchList(params) {
    const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    return (await Admin.api('GET', `/api/staff/reservations?${q}`)).reservations;
  }

  function counts(list) {
    const c = { total: list.length, wait: 0, seated: 0, done: 0, noshow: 0, cancel: 0, guests: 0 };
    for (const r of list) { c[statusOf(r).c] += 1; if (r.status === 'confirmed' || r.status === 'completed') c.guests += r.partySize; }
    return c;
  }

  Admin.res = { statusOf, actionButtons, bindActions, fetchList, today, addDays, fmtDate, toMs, CHANNEL };

  // ---------------- Tổng quan hôm nay ----------------
  Admin.screens.overview = {
    title: 'Tổng quan hôm nay', permission: 'reservation.view',
    render(root) {
      root.innerHTML = `
        <div class="stats" id="ov-stats" aria-live="polite"></div>
        <div class="panel"><div class="panel-head"><h2>Đang chờ khách đến</h2><a href="#/reservations">Xem danh sách đầy đủ</a></div>
        <div id="ov-wait" class="table-wrap"></div></div>`;
      let list = []; let timer = null; let dead = false;
      const stat = (n, label, cls) => `<div class="stat ${cls || ''}"><strong>${n}</strong><span>${label}</span></div>`;
      async function load() {
        try { list = await fetchList({ date: today() }); } catch (e) { if (!dead) Admin.toast(e.message); return; }
        if (dead) return;
        const c = counts(list);
        const late = list.filter((r) => lateText(r)).length;
        root.querySelector('#ov-stats').innerHTML = stat(c.total, 'Lượt đặt hôm nay') + stat(c.wait, 'Chờ khách') + stat(c.seated, 'Đang dùng bàn')
          + stat(c.guests, 'Khách dự kiến') + stat(late, 'Trễ giờ chưa đến', late ? 'warn' : '');
        const wait = list.filter((r) => r.status === 'confirmed' && !r.arrivedAt).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 12);
        root.querySelector('#ov-wait').innerHTML = wait.length === 0 ? '<p class="empty">Không có lượt nào đang chờ.</p>' : `<table class="tbl-list"><thead><tr><th>Giờ</th><th>Bàn</th><th>Khách</th><th>Số khách</th><th></th><th>Thao tác</th></tr></thead><tbody>${wait.map((r) => `
          <tr><td data-l="Giờ">${esc(r.start.slice(11))}</td><td data-l="Bàn"><strong>${esc(r.tableCode.toUpperCase())}</strong> <small>tầng ${r.floor}</small></td>
          <td data-l="Khách">${esc(r.customerName)}<small>${esc(r.customerPhone)}</small></td><td data-l="Số khách">${r.partySize}</td>
          <td data-l=""><span class="late">${esc(lateText(r))}</span></td><td><div class="acts">${actionButtons(r)}</div></td></tr>`).join('')}</tbody></table>`;
      }
      bindActions(root, (id) => list.find((r) => r.id === id), load);
      load(); timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
      return { destroy() { dead = true; clearInterval(timer); } };
    },
  };

  // ---------------- Danh sách đặt bàn ----------------
  Admin.screens.reservations = {
    title: 'Danh sách đặt bàn', permission: 'reservation.view',
    render(root) {
      const st = { date: today(), status: '', channel: '', q: '' };
      root.innerHTML = `
        <div class="toolbar">
          <div class="date-nav">
            <button type="button" class="btn sm" id="d-prev" aria-label="Ngày trước">&lsaquo;</button>
            <input type="date" id="d-input" aria-label="Ngày" value="${st.date}">
            <button type="button" class="btn sm" id="d-next" aria-label="Ngày sau">&rsaquo;</button>
            <button type="button" class="btn sm" id="d-today">Hôm nay</button>
          </div>
          <select id="f-status" aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="confirmed">Đã xác nhận (chờ và đang dùng bàn)</option><option value="completed">Đã về</option><option value="no_show">Không đến</option><option value="cancelled">Đã hủy</option></select>
          <select id="f-channel" aria-label="Kênh"><option value="">Mọi kênh</option><option value="website">Website</option><option value="hotline">Hotline</option><option value="fanpage">Fanpage</option></select>
          <input type="search" id="f-q" placeholder="Tìm tên, số điện thoại, mã" aria-label="Tìm kiếm" maxlength="50">
          <button type="button" class="btn sm" id="f-reload">Làm mới</button>
        </div>
        <p class="sum" id="sum" aria-live="polite"></p>
        <div class="table-wrap" id="list"></div>`;
      const $ = (s) => root.querySelector(s);
      let list = []; let timer = null; let dead = false; let reqId = 0;

      async function load() {
        const my = ++reqId;
        try { const r = await fetchList(st); if (my !== reqId || dead) return; list = r; } catch (e) { if (!dead) Admin.toast(e.message); return; }
        draw();
      }

      function draw() {
        const c = counts(list);
        $('#sum').textContent = list.length === 0 ? '' : `${fmtDate(st.date)}: ${c.total} lượt, ${c.guests} khách. Chờ ${c.wait}, đang dùng bàn ${c.seated}, đã về ${c.done}, không đến ${c.noshow}, hủy ${c.cancel}.`;
        if (list.length === 0) { $('#list').innerHTML = `<p class="empty">Không có lượt đặt nào ${st.status || st.channel || st.q ? 'khớp bộ lọc' : `ngày ${fmtDate(st.date)}`}.</p>`; return; }
        $('#list').innerHTML = `<table class="tbl-list"><thead><tr><th>Giờ</th><th>Bàn</th><th>Khách</th><th>Số khách</th><th>Kênh</th><th>Trạng thái</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>${list.map((r) => {
          const s = statusOf(r); const late = lateText(r);
          return `<tr class="row-${s.c}">
            <td data-l="Giờ"><strong>${esc(r.start.slice(11))}</strong><small>đến ${esc(r.end.slice(11))}</small></td>
            <td data-l="Bàn"><strong>${esc(r.tableCode.toUpperCase())}</strong><small>tầng ${r.floor}</small></td>
            <td data-l="Khách">${esc(r.customerName)}<small>${esc(r.customerPhone)}${r.noShowCount > 0 ? ` <span class="ns" title="Số lần không đến">không đến ${r.noShowCount} lần</span>` : ''}</small><small>${esc(r.bookingCode)}</small></td>
            <td data-l="Số khách">${r.partySize}</td>
            <td data-l="Kênh">${CHANNEL[r.channel]}${r.createdBy ? `<small>${esc(r.createdBy)}</small>` : ''}</td>
            <td data-l="Trạng thái"><span class="badge ${s.c}">${s.t}</span>${late ? `<small class="late">${esc(late)}</small>` : ''}${r.arrivedAt && r.status === 'confirmed' ? `<small>đến lúc ${esc(r.arrivedAt.slice(11))}</small>` : ''}${r.releasedAt ? `<small>về lúc ${esc(r.releasedAt.slice(11))}</small>` : ''}</td>
            <td data-l="Ghi chú" class="note">${esc(r.note || '')}</td>
            <td><div class="acts">${actionButtons(r)}</div></td></tr>`;
        }).join('')}</tbody></table>`;
      }

      function setDate(d) { st.date = d; $('#d-input').value = d; load(); }
      $('#d-prev').addEventListener('click', () => setDate(addDays(st.date, -1)));
      $('#d-next').addEventListener('click', () => setDate(addDays(st.date, 1)));
      $('#d-today').addEventListener('click', () => setDate(today()));
      $('#d-input').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
      $('#f-status').addEventListener('change', (e) => { st.status = e.target.value; load(); });
      $('#f-channel').addEventListener('change', (e) => { st.channel = e.target.value; load(); });
      let qt = null; $('#f-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 300); });
      $('#f-reload').addEventListener('click', load);
      bindActions($('#list'), (id) => list.find((r) => r.id === id), load);
      load(); timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
      return { destroy() { dead = true; clearInterval(timer); clearTimeout(qt); } };
    },
  };
})();
