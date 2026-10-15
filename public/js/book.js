(function () {
  'use strict';
  const { t, errText } = window.I18N;
  const $ = (id) => document.getElementById(id);

  const state = {
    settings: null,
    date: null, party: 2, time: null,
    slots: [], tables: [], floor: 1,
    lock: null,            // { token, tableId, code, deadline (ms) }
    token: null,           // mã giữ bàn của trình duyệt này, dùng lại khi đổi bàn
    submitting: false,
    done: false,
  };
  let countdownTimer = null; let pollTimer = null; let slotsReq = 0; let mapReq = 0;

  // ---------- Gọi API ----------
  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw { code: 'NETWORK', message: t('networkError') }; }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* không có nội dung */ }
    if (!res.ok) throw { status: res.status, code: data && data.code, message: (data && data.error) || t('networkError') };
    return data;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 6000);
  }

  // ---------- Ngày giờ theo múi giờ Việt Nam ----------
  function vnToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
  function addDays(d, n) { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  // ---------- Bước 1: ngày, số khách, giờ ----------
  function renderDates() {
    const box = $('dates'); box.textContent = '';
    const today = vnToday();
    for (let i = 0; i <= state.settings.bookingWindowDays; i += 1) {
      const d = addDays(today, i);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(d === state.date));
      b.innerHTML = `${i === 0 ? t('today') : t('weekdays')[dow(d)]}<small>${dm(d)}</small>`;
      b.addEventListener('click', () => { if (d !== state.date) { state.date = d; state.time = null; releaseLock(); renderDates(); loadSlots(); clearMap(); } });
      box.appendChild(b);
    }
  }

  function renderParty() {
    $('party-out').textContent = `${state.party} ${t('guestsUnit')}`;
    $('party-minus').disabled = state.party <= 1;
    $('party-plus').disabled = false;
    const big = $('big-group');
    const max = state.settings.maxOnlinePartySize;
    big.hidden = state.party < max;
    big.textContent = t('bigGroup', { max, hotline: state.settings.hotline });
    $('party-plus').disabled = state.party >= max;
  }

  function changeParty(delta) {
    const max = state.settings.maxOnlinePartySize;
    const next = Math.min(max, Math.max(1, state.party + delta));
    if (next === state.party) return;
    state.party = next; releaseLock(); renderParty(); loadSlots();
  }

  async function loadSlots() {
    const my = ++slotsReq;
    const box = $('slots'); box.textContent = t('loading');
    try {
      const data = await api('GET', `/api/availability?date=${state.date}&party=${state.party}`);
      if (my !== slotsReq) return;
      state.slots = data.slots;
      // Giữ giờ đang chọn nếu vẫn còn bàn; không thì bỏ chọn.
      const cur = state.slots.find((s) => s.time === state.time);
      if (!cur || cur.available === 0) { state.time = null; clearMap(); }
      renderSlots();
      if (state.time) loadMap();
    } catch (e) { if (my === slotsReq) { box.textContent = ''; toast(errText(e)); } }
  }

  function renderSlots() {
    const box = $('slots'); box.textContent = '';
    if (state.slots.length === 0) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = t('noSlots'); box.appendChild(p); return; }
    const groups = [['lunch', state.slots.filter((s) => s.time < '15:00')], ['dinner', state.slots.filter((s) => s.time >= '15:00')]];
    for (const [key, list] of groups) {
      if (list.length === 0) continue;
      const g = document.createElement('div'); g.className = 'slot-group';
      const h = document.createElement('h3'); h.textContent = t(key); g.appendChild(h);
      const row = document.createElement('div'); row.className = 'slots';
      for (const s of list) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
        b.textContent = s.time; b.setAttribute('aria-pressed', String(s.time === state.time));
        if (s.available === 0) { b.disabled = true; b.title = t('soldOut'); b.setAttribute('aria-label', `${s.time}, ${t('soldOut')}`); }
        b.addEventListener('click', () => { if (s.time !== state.time) { state.time = s.time; releaseLock(); renderSlots(); loadMap(); } });
        row.appendChild(b);
      }
      g.appendChild(row); box.appendChild(g);
    }
  }

  // ---------- Bước 2: sơ đồ bàn ----------
  function clearMap() { state.tables = []; stopPoll(); renderMap(); }

  async function loadMap(silent) {
    if (!state.time) return;
    const my = ++mapReq;
    try {
      const q = new URLSearchParams({ date: state.date, time: state.time, party: String(state.party) });
      if (state.token) q.set('lockToken', state.token);
      const data = await api('GET', `/api/tables/map?${q}`);
      if (my !== mapReq || state.done) return;
      const firstLoad = state.tables.length === 0;
      state.tables = data.tables;
      // Lần đầu hiện sơ đồ: nếu tầng đang xem hết bàn mà tầng kia còn, chuyển sang tầng còn bàn.
      if (firstLoad) {
        const free = (f) => state.tables.filter((x) => x.floor === f && x.selectable).length;
        if (free(state.floor) === 0 && free(3 - state.floor) > 0) state.floor = 3 - state.floor;
      }
      // Bàn đang giữ mà không còn chọn được (bị dọn, đổi số khách): bỏ khóa trên giao diện.
      if (state.lock) { const mine = state.tables.find((x) => x.id === state.lock.tableId); if (!mine || !mine.selectable) dropLock(); }
      renderMap(); startPoll();
    } catch (e) { if (!silent && my === mapReq) toast(errText(e)); }
  }

  function startPoll() { stopPoll(); pollTimer = setInterval(() => { if (!document.hidden && !state.submitting) loadMap(true); }, 8000); }
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }

  function stateOf(tb) {
    if (state.lock && state.lock.tableId === tb.id) return 'mine';
    if (tb.selectable) return 'free';
    return tb.reason === 'taken' ? 'taken' : 'off';
  }
  const STATE_TEXT = { free: 'stFree', mine: 'stSelected', taken: 'stTaken' };

  function renderMap() {
    const plan = $('plan'); plan.textContent = '';
    renderFloorTabs();
    if (!state.time || state.tables.length === 0) {
      const d = document.createElement('div'); d.className = 'plan-empty'; d.textContent = t('pickTimeFirst'); plan.appendChild(d); return;
    }
    FloorPlan.render(plan, state.tables, state.floor, {
      cls: 'tbl', stateOf,
      label: (st, tb) => (st === 'off' ? t(tb.reason === 'too_small' ? 'stSmall' : 'stNotOffered') : t(STATE_TEXT[st])),
      disabled: (st) => st === 'taken' || st === 'off',
      onPick: (tb) => onTable(tb),
    });
  }

  function renderFloorTabs() {
    const box = $('floor-tabs'); box.textContent = '';
    for (const f of [1, 2]) {
      const free = state.tables.filter((x) => x.floor === f && x.selectable).length;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(f === state.floor));
      b.innerHTML = `${t('floor', { n: f })}${state.tables.length ? `<small>${t('floorFree', { n: free })}</small>` : ''}`;
      b.addEventListener('click', () => { state.floor = f; renderMap(); });
      box.appendChild(b);
    }
  }

  // ---------- Khóa mềm 5 phút ----------
  async function onTable(tb) {
    if (state.lock && state.lock.tableId === tb.id) { releaseLock(); renderMap(); return; }  // bấm lại để bỏ chọn
    try {
      const r = await api('POST', '/api/locks', { date: state.date, time: state.time, party: state.party, tableId: tb.id, lockToken: state.token || undefined });
      state.token = r.lockToken;
      state.lock = { token: r.lockToken, tableId: tb.id, code: tb.code.toUpperCase(), deadline: Date.now() + r.ttlSeconds * 1000 };
      showForm(true); renderMap(); startCountdown();
      if (window.matchMedia('(max-width: 900px)').matches) $('form-step').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('f-name').focus({ preventScroll: true });
    } catch (e) { toast(errText(e)); loadMap(true); }
  }

  function showForm(on) {
    $('form').hidden = !on; $('form-empty').hidden = on;
    $('form-step').dataset.state = on ? 'open' : 'locked';
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    const tick = () => {
      if (!state.lock) return;
      const left = Math.max(0, Math.round((state.lock.deadline - Date.now()) / 1000));
      $('hold-text').textContent = t('holding', { code: state.lock.code });
      $('hold-time').textContent = t('holdLeft', { time: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` });
      $('hold-bar').classList.toggle('low', left <= 60);
      $('hold-bar').classList.add('on');
      if (left === 0) { dropLock(); toast(t('holdOver')); loadMap(true); }
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }

  // Bỏ khóa trên giao diện (không gọi máy chủ): khóa đã hết hạn hoặc đã bị dọn.
  function dropLock() {
    state.lock = null; clearInterval(countdownTimer); $('hold-bar').classList.remove('on'); showForm(false); renderMap();
  }
  // Nhả khóa chủ động: gọi máy chủ để bàn trống ngay cho khách khác.
  function releaseLock() {
    const token = state.lock && state.token;
    if (state.lock) dropLock();
    if (token) { api('DELETE', `/api/locks/${token}`).catch(() => {}); state.token = null; }
  }

  // ---------- Bước 3: gửi form ----------
  function fieldError(id, msg) { $(id).textContent = msg || ''; }

  async function submit(ev) {
    ev.preventDefault();
    if (state.submitting || !state.lock) return;
    const name = $('f-name').value.trim(); const phone = $('f-phone').value.trim();
    fieldError('e-name', name ? '' : t('required', { field: t('fullName').toLowerCase() }));
    fieldError('e-phone', phone ? '' : t('required', { field: t('phone').toLowerCase() }));
    if (!name) return $('f-name').focus();
    if (!phone) return $('f-phone').focus();

    state.submitting = true; const btn = $('submit'); btn.disabled = true; btn.textContent = t('submitting');
    try {
      const r = await api('POST', '/api/reservations', {
        date: state.date, time: state.time, party: state.party, tableId: state.lock.tableId, lockToken: state.lock.token,
        name, phone, note: $('f-note').value.trim(),
      });
      state.done = true; state.token = null; state.lock = null;
      clearInterval(countdownTimer); stopPoll(); $('hold-bar').classList.remove('on');
      showDone(r, name, phone);
    } catch (e) {
      if (e.code === 'INVALID_PHONE') fieldError('e-phone', errText(e));
      else if (e.code === 'INVALID_NAME') fieldError('e-name', errText(e));
      else toast(errText(e));
      // Khóa hết hạn hoặc bàn không còn: về lại bước chọn bàn.
      if (['LOCK_EXPIRED', 'TABLE_UNAVAILABLE', 'TABLE_CONFLICT', 'TABLE_HELD'].includes(e.code)) { state.token = null; dropLock(); loadSlots(); }
    } finally {
      state.submitting = false; btn.disabled = false; btn.textContent = t('submit');
    }
  }

  function showDone(r, name, phone) {
    $('flow').hidden = true; $('done').hidden = false;
    $('done-code').textContent = r.bookingCode;
    const rows = [
      ['rName', r.customerName || name], ['rPhone', phone],
      ['rWhen', t('rWhenVal', { from: r.start.slice(11), to: r.end.slice(11), date: `${r.start.slice(8, 10)}/${r.start.slice(5, 7)}/${r.start.slice(0, 4)}` })],
      ['rTable', t('rTableVal', { code: r.tableCode.toUpperCase(), floor: r.floor })], ['rParty', `${r.partySize} ${t('guestsUnit')}`],
    ];
    const dl = $('recap'); dl.textContent = '';
    for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = t(k); const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
    window.scrollTo({ top: 0 });
    $('done-title').setAttribute('tabindex', '-1'); $('done-title').focus();
    state.lastDone = { r, name, phone };
  }

  // ---------- Khởi động ----------
  function rerenderAll() {
    I18N.apply(); $('foot-hotline').textContent = state.settings.hotline; $('foot-hotline').href = `tel:${state.settings.hotline}`;
    renderDates(); renderParty(); renderSlots(); renderMap();
    if (state.lock) startCountdown();
    if (state.lastDone && !$('done').hidden) showDone(state.lastDone.r, state.lastDone.name, state.lastDone.phone);
  }

  async function init() {
    I18N.apply();
    try { state.settings = await api('GET', '/api/settings'); } catch (e) { toast(errText(e)); return; }
    state.date = vnToday(); state.party = Math.min(2, state.settings.maxOnlinePartySize);
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => I18N.setLang(b.dataset.lang, rerenderAll)));
    $('party-minus').addEventListener('click', () => changeParty(-1));
    $('party-plus').addEventListener('click', () => changeParty(1));
    $('form').addEventListener('submit', submit);
    $('book-again').addEventListener('click', () => location.reload());
    rerenderAll(); loadSlots();
    // Rời trang khi đang giữ bàn: nhả ngay để khách khác đặt được.
    window.addEventListener('pagehide', () => {
      if (state.lock && !state.done) fetch(`/api/locks/${state.token}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    });
  }
  init();
})();
