(function () {
  'use strict';
  const { t, errText } = window.I18N;
  const $ = (id) => document.getElementById(id);
  const STATUS_KEY = { confirmed: 'stConfirmed', completed: 'stCompleted', no_show: 'stNoShow', cancelled: 'stCancelled' };
  let hotline = '';
  let current = null;       // { phone, code, data } lượt đang xem
  let lastMsg = null;       // 'cancelled' khi vừa hủy xong
  let busy = false;

  async function api(url, body) {
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw { code: 'NETWORK', message: t('networkError') }; }
    let data = null; try { data = await res.json(); } catch (e) { /* không có nội dung */ }
    if (!res.ok) throw { status: res.status, code: data && data.code, message: (data && data.error) || t('networkError') };
    return data;
  }

  let toastTimer = null;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 6000); }
  const fieldError = (id, msg) => { $(id).textContent = msg || ''; };

  // Mã đặt bàn: tự viết hoa, tự thêm dấu gạch ngang sau GYU.
  function formatCode(v) {
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}` : raw;
  }

  function render() {
    const has = !!current;
    $('find-card').hidden = has; $('result').hidden = !has;
    if (!has) return;
    const d = current.data;
    $('r-code').textContent = d.bookingCode;
    const st = $('r-status'); st.textContent = t(STATUS_KEY[d.status] || 'stConfirmed'); st.dataset.s = d.status;
    const rows = [
      ['rName', d.customerName], ['rWhen', t('rWhenVal', { from: d.start.slice(11), to: d.end.slice(11), date: `${d.start.slice(8, 10)}/${d.start.slice(5, 7)}/${d.start.slice(0, 4)}` })],
      ['rTable', t('rTableVal', { code: d.tableCode.toUpperCase(), floor: d.floor })], ['rParty', `${d.partySize} ${t('guestsUnit')}`],
    ];
    if (d.note) rows.push(['note', d.note]);
    const dl = $('recap'); dl.textContent = '';
    for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = t(k).replace(/ \(.*\)$/, ''); const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }

    const msg = $('r-msg');
    if (lastMsg === 'cancelled') { msg.hidden = false; msg.textContent = t('cancelledOk'); }
    else if (!d.canCancel && d.status === 'confirmed') { msg.hidden = false; msg.textContent = t('cannotCancel', { hotline }); }
    else msg.hidden = true;
    $('cancel-btn').hidden = !d.canCancel;
    $('cancel-ask').hidden = true; $('result-actions').hidden = false;
  }

  async function find(ev) {
    ev.preventDefault(); if (busy) return;
    const phone = $('l-phone').value.trim(); const code = $('l-code').value.trim();
    fieldError('e-phone', phone ? '' : t('required', { field: t('phone').toLowerCase() }));
    fieldError('e-code', code ? '' : t('required', { field: t('codeLabel').toLowerCase() }));
    if (!phone) return $('l-phone').focus();
    if (!code) return $('l-code').focus();
    busy = true; const b = $('find-btn'); b.disabled = true; b.textContent = t('finding');
    try {
      const data = await api('/api/reservations/lookup', { phone, code });
      current = { phone, code, data }; lastMsg = null; render();
      $('r-code').parentElement.scrollIntoView({ block: 'center' });
    } catch (e) {
      if (e.code === 'INVALID_PHONE') fieldError('e-phone', errText(e));
      else if (e.code === 'INVALID_CODE') fieldError('e-code', errText(e));
      else toast(errText(e));
    } finally { busy = false; b.disabled = false; b.textContent = t('findBtn'); }
  }

  async function doCancel() {
    if (busy || !current) return; busy = true;
    const y = $('cancel-yes'); y.disabled = true; y.textContent = t('cancelling');
    try {
      const data = await api('/api/reservations/cancel', { phone: current.phone, code: current.code });
      current.data = data; lastMsg = 'cancelled'; render();
    } catch (e) {
      toast(errText(e));
      // Trạng thái đã đổi (nhân viên vừa xử lý): tải lại để hiện đúng.
      try { current.data = await api('/api/reservations/lookup', { phone: current.phone, code: current.code }); lastMsg = null; render(); } catch (e2) { /* giữ nguyên */ }
    } finally { busy = false; y.disabled = false; y.textContent = t('cancelYes'); }
  }

  async function init() {
    I18N.apply();
    try { const s = await (await fetch('/api/settings')).json(); hotline = s.hotline; $('foot-hotline').textContent = hotline; $('foot-hotline').href = `tel:${hotline}`; } catch (e) { /* hotline chỉ là phụ */ }
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => I18N.setLang(b.dataset.lang, () => { render(); })));
    $('find-form').addEventListener('submit', find);
    $('l-code').addEventListener('input', (e) => { const v = formatCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
    $('cancel-btn').addEventListener('click', () => { $('cancel-q').textContent = t('cancelAsk'); $('cancel-ask').hidden = false; $('result-actions').hidden = true; $('cancel-keep').focus(); });
    $('cancel-keep').addEventListener('click', () => { $('cancel-ask').hidden = true; $('result-actions').hidden = false; $('cancel-btn').focus(); });
    $('cancel-yes').addEventListener('click', doCancel);
    $('again').addEventListener('click', () => { current = null; $('l-code').value = ''; render(); $('l-phone').focus(); });
    render();
  }
  init();
})();
