// Màn hình "Tạo đặt bàn hộ" và "Sơ đồ bàn".
(function () {
  'use strict';
  const { esc } = Admin;
  const R = Admin.res;
  const STEP_DAYS = 7;

  // Chọn trước từ màn "Sơ đồ bàn" sang màn "Tạo đặt bàn hộ".
  Admin.prefill = null;

  // ---------- Dùng chung ----------
  function dateNavHtml(date) {
    return `<div class="date-nav">
      <button type="button" class="btn sm" data-d="-1" aria-label="Ngày trước">&lsaquo;</button>
      <input type="date" id="d-input" aria-label="Ngày" value="${date}" min="${R.today()}" max="${R.addDays(R.today(), STEP_DAYS)}">
      <button type="button" class="btn sm" data-d="1" aria-label="Ngày sau">&rsaquo;</button>
      <button type="button" class="btn sm" data-d="0">Hôm nay</button></div>`;
  }

  function clampDate(d) {
    const lo = R.today(); const hi = R.addDays(lo, STEP_DAYS);
    return d < lo ? lo : d > hi ? hi : d;
  }

  async function loadSlots(date) {
    return (await Admin.api('GET', `/api/staff/slots?date=${date}`)).slots;
  }

  function fillTimes(select, slots, wanted) {
    select.textContent = '';
    if (slots.length === 0) {
      const o = document.createElement('option'); o.value = ''; o.textContent = 'Hết giờ nhận khách'; select.appendChild(o);
    }
    for (const s of slots) { const o = document.createElement('option'); o.value = s; o.textContent = s; select.appendChild(o); }
    select.value = slots.includes(wanted) ? wanted : (slots[0] || '');
  }

  // Vẽ sơ đồ một tầng. stateOf(tb) trả về: free | mine | wait | seated | hold | off.
  function drawPlan(box, tables, floor, stateOf, label, onPick) {
    FloorPlan.render(box, tables, floor, { cls: 'atbl', stateOf, label, onPick });
  }

  function floorTabs(box, tables, floor, countFn, onChange) {
    box.textContent = '';
    for (const f of [1, 2]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      b.setAttribute('aria-pressed', String(f === floor));
      b.textContent = `Tầng ${f}${countFn ? ` (${countFn(tables.filter((x) => x.floor === f))})` : ''}`;
      b.addEventListener('click', () => onChange(f));
      box.appendChild(b);
    }
  }

  function bindDateNav(root, get, set) {
    root.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.d); set(n === 0 ? R.today() : clampDate(R.addDays(get(), n)));
    }));
    root.querySelector('#d-input').addEventListener('change', (e) => { if (e.target.value) set(clampDate(e.target.value)); });
  }

  const errText = (e) => (e && e.message) || 'Có lỗi xảy ra';

  // ---------- Tạo đặt bàn hộ ----------
  Admin.screens.create = {
    title: 'Tạo đặt bàn hộ', permission: 'reservation.create',
    render(root) {
      const pre = Admin.prefill; Admin.prefill = null;
      const st = { date: (pre && pre.date) || R.today(), time: (pre && pre.time) || '', party: (pre && pre.party) || 2, tableId: (pre && pre.tableId) || null, floor: 1, tables: [], slots: [], busy: false };
      const needChannel = !['hotline_staff', 'fanpage_staff'].includes(Admin.user.role);
      root.innerHTML = `
        <div id="done" hidden></div>
        <form id="f" novalidate>
          <section class="panel"><div class="panel-head"><h2>1. Ngày, giờ và số khách</h2></div>
            <div class="form-row">${dateNavHtml(st.date)}
              <label>Giờ <select id="f-time"></select></label>
              <label>Số khách <input type="number" id="f-party" min="1" max="20" value="${st.party}" inputmode="numeric"></label>
              ${needChannel ? `<label>Kênh <select id="f-ch"><option value="hotline">Hotline</option><option value="fanpage">Fanpage</option></select></label>` : ''}
            </div>
            <p class="hint">Mỗi lượt giữ một bàn trong 120 phút nên số khách tối đa bằng bàn lớn nhất (8 chỗ).</p>
          </section>
          <section class="panel"><div class="panel-head"><h2>2. Chọn bàn</h2><span id="pick-sum" class="muted"></span></div>
            <div class="floor-tabs" id="tabs"></div>
            <div class="aplan" id="plan" role="group" aria-label="Sơ đồ bàn"></div>
            <ul class="legend"><li><i class="sw free"></i>Còn trống</li><li><i class="sw mine"></i>Bàn đang chọn</li><li><i class="sw taken"></i>Đã có khách đặt</li><li><i class="sw off"></i>Không đủ chỗ</li></ul>
          </section>
          <section class="panel"><div class="panel-head"><h2>3. Thông tin khách</h2></div>
            <div class="form-grid">
              <label>Họ tên <input id="f-name" maxlength="100" autocomplete="off"></label>
              <label>Số điện thoại <input id="f-phone" inputmode="tel" maxlength="16" autocomplete="off"></label>
              <label class="wide">Ghi chú <input id="f-note" maxlength="300" placeholder="Ví dụ: sinh nhật, cần ghế trẻ em"></label>
              <label class="wide" id="fb-wrap" hidden>Mã người nhắn Facebook (nếu có) <input id="f-fb" maxlength="80" autocomplete="off"></label>
            </div>
            <p class="err" id="f-err" role="alert"></p>
            <button type="submit" class="btn primary block" id="f-go">Tạo đặt bàn</button>
          </section>
        </form>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let reqId = 0; let poll = null;

      const channel = () => (needChannel ? $('#f-ch').value : (Admin.user.role === 'fanpage_staff' ? 'fanpage' : 'hotline'));
      const syncFb = () => { $('#fb-wrap').hidden = channel() !== 'fanpage'; };

      async function loadAll(keepTime) {
        const my = ++reqId;
        try {
          const slots = await loadSlots(st.date); if (my !== reqId || dead) return;
          st.slots = slots; fillTimes($('#f-time'), slots, keepTime ? st.time : st.time); st.time = $('#f-time').value;
        } catch (e) { Admin.toast(errText(e)); return; }
        await loadMap(my);
      }

      async function loadMap(my) {
        my = my || ++reqId;
        if (!st.time) { st.tables = []; draw(); return; }
        try {
          const q = new URLSearchParams({ date: st.date, time: st.time, party: String(st.party) });
          const r = await Admin.api('GET', `/api/staff/tables/map?${q}`); if (my !== reqId || dead) return;
          st.tables = r.tables;
          if (st.tableId && !st.tables.some((t) => t.id === st.tableId && t.selectable)) st.tableId = null;
        } catch (e) { if (my === reqId) { st.tables = []; Admin.toast(errText(e)); } }
        draw();
      }

      function draw() {
        const plan = $('#plan');
        const partyOk = Number.isInteger(st.party) && st.party >= 1 && st.party <= 20;
        if (!st.time || !partyOk || st.tables.length === 0) {
          plan.textContent = ''; const d = document.createElement('div'); d.className = 'aplan-empty';
          d.textContent = !st.time ? 'Chưa có giờ nhận khách trong ngày này.' : !partyOk ? 'Nhập số khách từ 1 đến 20.' : 'Đang tải sơ đồ...'; plan.appendChild(d);
          floorTabs($('#tabs'), [], st.floor, null, (f) => { st.floor = f; draw(); }); $('#pick-sum').textContent = ''; return;
        }
        floorTabs($('#tabs'), st.tables, st.floor, (list) => `${list.filter((x) => x.selectable).length} bàn trống`, (f) => { st.floor = f; draw(); });
        drawPlan(plan, st.tables, st.floor,
          (tb) => (st.tableId === tb.id ? 'mine' : tb.selectable ? 'free' : tb.reason === 'taken' ? 'taken' : 'off'),
          (s) => ({ free: 'còn trống', mine: 'đang chọn', taken: 'đã có khách đặt hoặc đang được giữ', off: 'không đủ chỗ cho số khách' }[s]),
          (tb, s) => { if (s === 'taken' || s === 'off') return; st.tableId = tb.id; draw(); });
        const t = st.tables.find((x) => x.id === st.tableId);
        $('#pick-sum').textContent = t ? `Đã chọn ${t.code.toUpperCase()} (${t.capacity} chỗ, tầng ${t.floor})` : 'Chưa chọn bàn';
      }

      bindDateNav(root, () => st.date, (d) => { st.date = d; $('#d-input').value = d; st.tableId = null; loadAll(true); });
      $('#f-time').addEventListener('change', (e) => { st.time = e.target.value; st.tableId = null; loadMap(); });
      let pt = null;
      $('#f-party').addEventListener('input', (e) => { st.party = Number(e.target.value); clearTimeout(pt); pt = setTimeout(() => { if (Number.isInteger(st.party) && st.party >= 1 && st.party <= 20) loadMap(); else draw(); }, 350); });
      if (needChannel) $('#f-ch').addEventListener('change', syncFb);
      if (pre && pre.fbSenderId) { if (needChannel) $('#f-ch').value = 'fanpage'; $('#f-fb').value = pre.fbSenderId; }
      syncFb();

      async function submit(ev) {
        ev.preventDefault(); if (st.busy) return;
        const err = $('#f-err'); err.textContent = '';
        if (!st.tableId) { err.textContent = 'Vui lòng chọn một bàn trên sơ đồ.'; return; }
        const body = { channel: channel(), date: st.date, time: st.time, party: st.party, tableId: st.tableId, name: $('#f-name').value, phone: $('#f-phone').value, note: $('#f-note').value.trim() || undefined };
        if (channel() === 'fanpage' && $('#f-fb').value.trim()) body.fbSenderId = $('#f-fb').value.trim();
        st.busy = true; $('#f-go').disabled = true;
        try {
          const r = await Admin.api('POST', '/api/staff/reservations', body);
          showDone(r, body);
        } catch (e) {
          err.textContent = errText(e); $('#f-err').scrollIntoView({ block: 'nearest' });
          if (e.status === 409) loadMap();
        } finally { st.busy = false; $('#f-go').disabled = false; }
      }
      $('#f').addEventListener('submit', submit);

      function showDone(r, body) {
        const t = st.tables.find((x) => x.id === st.tableId);
        const done = $('#done'); done.hidden = false; $('#f').hidden = true;
        done.innerHTML = `<section class="panel ok-panel"><h2>Đã tạo đặt bàn</h2>
          <p class="code" aria-label="Mã đặt bàn">${esc(r.bookingCode)}</p>
          <p><strong>${esc(body.name)}</strong> · ${esc(body.phone)}<br>${R.fmtDate(st.date)} lúc ${esc(st.time)} · ${st.party} khách · bàn ${t ? esc(t.code.toUpperCase()) : ''} (tầng ${t ? t.floor : ''})</p>
          <p class="hint">Đọc mã này cho khách để tra cứu hoặc hủy lượt đặt trên website.</p>
          <div class="acts"><button type="button" class="btn primary" id="again">Tạo lượt khác</button><a class="btn" href="#/reservations">Xem danh sách đặt bàn</a></div></section>`;
        Admin.toast(`Đã tạo ${r.bookingCode}`, true);
        done.querySelector('#again').addEventListener('click', () => { Admin.prefill = null; Admin.go('create', true); });
      }

      loadAll(true);
      poll = setInterval(() => { if (!document.hidden && !st.busy && !$('#f').hidden) loadMap(); }, 10000);
      return { destroy() { dead = true; clearInterval(poll); clearTimeout(pt); } };
    },
  };

  // ---------- Sơ đồ bàn ----------
  Admin.screens.tables = {
    title: 'Sơ đồ bàn', permission: 'table.view',
    render(root) {
      const st = { date: R.today(), time: '', floor: 1, tables: [], list: [], sel: null };
      root.innerHTML = `
        <div class="toolbar">${dateNavHtml(st.date)}
          <label class="inl">Giờ <select id="f-time"></select></label>
          <button type="button" class="btn sm" id="reload">Làm mới</button></div>
        <p class="sum" id="sum" aria-live="polite"></p>
        <div class="tables-layout">
          <section class="panel"><div class="floor-tabs" id="tabs"></div><div class="aplan" id="plan" role="group" aria-label="Sơ đồ bàn"></div>
            <ul class="legend"><li><i class="sw free"></i>Trống</li><li><i class="sw wait"></i>Đã đặt, chờ khách</li><li><i class="sw seated"></i>Đang dùng bàn</li><li><i class="sw taken"></i>Khách đang giữ bàn trên website</li></ul></section>
          <section class="panel side-detail" id="detail" aria-live="polite"><p class="muted">Bấm vào một bàn để xem chi tiết.</p></section>
        </div>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let reqId = 0; let timer = null;

      // Lượt đặt đang chiếm bàn tại giờ đang xem (kể cả đã dọn dở thì bàn vẫn bị giữ tới hết giờ dọn).
      function occupant(tb) {
        if (!st.time) return null;
        const at = R.toMs(`${st.date} ${st.time}`);
        return st.list.find((r) => r.tableCode === tb.code && (r.status === 'confirmed' || (r.status === 'completed' && r.releasedAt)) && R.toMs(r.start) <= at && at < R.toMs(r.end)) || null;
      }
      const stateOf = (tb) => {
        if (tb.selectable) return 'free';
        const o = occupant(tb);
        if (!o) return 'taken';
        return o.arrivedAt && o.status === 'confirmed' ? 'seated' : o.status === 'completed' ? 'taken' : 'wait';
      };

      async function load(full) {
        const my = ++reqId;
        try {
          if (full) { const slots = await loadSlots(st.date); if (my !== reqId || dead) return; fillTimes($('#f-time'), slots, st.time); st.time = $('#f-time').value; }
          if (!st.time) { st.tables = []; st.list = []; draw(); return; }
          const q = new URLSearchParams({ date: st.date, time: st.time, party: '1' });
          const [m, l] = await Promise.all([Admin.api('GET', `/api/staff/tables/map?${q}`), Admin.can('reservation.view') ? R.fetchList({ date: st.date }) : []]);
          if (my !== reqId || dead) return; st.tables = m.tables; st.list = l;
        } catch (e) { if (!dead) Admin.toast(errText(e)); return; }
        draw();
      }

      function draw() {
        const plan = $('#plan');
        if (!st.time || st.tables.length === 0) {
          plan.textContent = ''; const d = document.createElement('div'); d.className = 'aplan-empty'; d.textContent = 'Không có giờ nhận khách trong ngày này.'; plan.appendChild(d);
          floorTabs($('#tabs'), [], st.floor, null, (f) => { st.floor = f; draw(); }); $('#sum').textContent = ''; $('#detail').innerHTML = '<p class="muted">Bấm vào một bàn để xem chi tiết.</p>'; return;
        }
        const n = st.tables.length; const free = st.tables.filter((t) => t.selectable).length;
        $('#sum').textContent = `${R.fmtDate(st.date)} lúc ${st.time}: ${free}/${n} bàn còn trống.`;
        floorTabs($('#tabs'), st.tables, st.floor, (list) => `${list.filter((x) => x.selectable).length} trống`, (f) => { st.floor = f; draw(); });
        drawPlan(plan, st.tables, st.floor, (tb) => (st.sel === tb.id ? `${stateOf(tb)} sel` : stateOf(tb)),
          (s) => ({ free: 'trống', wait: 'đã đặt, chờ khách', seated: 'đang dùng bàn', taken: 'đang bị giữ' }[s.split(' ')[0]] || ''),
          (tb) => { st.sel = tb.id; draw(); });
        drawDetail();
      }

      function drawDetail() {
        const box = $('#detail'); const tb = st.tables.find((t) => t.id === st.sel);
        if (!tb) { box.innerHTML = '<p class="muted">Bấm vào một bàn để xem chi tiết.</p>'; return; }
        const head = `<h2>Bàn ${esc(tb.code.toUpperCase())}</h2><p class="muted">Tầng ${tb.floor} · ${tb.capacity} chỗ${tb.isVip ? ' · phòng VIP' : ''}</p>`;
        if (tb.selectable) {
          box.innerHTML = `${head}<p>Còn trống lúc ${esc(st.time)} (giữ 120 phút).</p>${Admin.can('reservation.create') ? '<button type="button" class="btn primary" id="book-here">Đặt bàn này</button>' : ''}`;
          const b = box.querySelector('#book-here');
          if (b) b.addEventListener('click', () => { Admin.prefill = { date: st.date, time: st.time, party: Math.min(tb.capacity, 20), tableId: tb.id }; Admin.go('create'); });
          return;
        }
        const o = occupant(tb);
        if (!o) { box.innerHTML = `${head}<p>Bàn đang được một khách giữ trên website (tối đa 5 phút khi đang điền thông tin).</p>`; return; }
        const s = R.statusOf(o);
        box.innerHTML = `${head}<div class="occ"><span class="badge ${s.c}">${s.t}</span>
          <p><strong>${esc(o.customerName)}</strong><br>${esc(o.customerPhone)}${o.noShowCount > 0 ? ` <span class="ns">không đến ${o.noShowCount} lần</span>` : ''}</p>
          <p>${esc(o.start.slice(11))} đến ${esc(o.end.slice(11))} · ${o.partySize} khách<br>Kênh: ${R.CHANNEL[o.channel]} · Mã ${esc(o.bookingCode)}</p>
          ${o.note ? `<p class="muted">Ghi chú: ${esc(o.note)}</p>` : ''}
          ${o.arrivedAt && o.status === 'confirmed' ? `<p class="muted">Khách đến lúc ${esc(o.arrivedAt.slice(11))}</p>` : ''}
          <div class="acts">${R.actionButtons(o)}</div></div>`;
      }

      R.bindActions($('#detail'), (id) => st.list.find((r) => r.id === id), () => load(false));
      bindDateNav(root, () => st.date, (d) => { st.date = d; st.sel = null; $('#d-input').value = d; load(true); });
      $('#f-time').addEventListener('change', (e) => { st.time = e.target.value; load(false); });
      $('#reload').addEventListener('click', () => load(true));
      load(true); timer = setInterval(() => { if (!document.hidden) load(false); }, 15000);
      return { destroy() { dead = true; clearInterval(timer); } };
    },
  };
})();
