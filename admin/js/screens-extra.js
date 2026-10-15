// Màn hình "Tin nhắn Facebook" và "Nhật ký".
(function () {
  'use strict';
  const { esc } = Admin;
  const errText = (e) => (e && e.message) || 'Có lỗi xảy ra';

  // ---------- Tin nhắn Facebook ----------
  Admin.screens.facebook = {
    title: 'Tin nhắn Facebook', permission: 'facebook.handle',
    render(root) {
      const st = { convs: [], sel: null, msgs: [], rules: [], tab: 'chat' };
      root.innerHTML = `
        <div class="toolbar">
          <button type="button" class="chip" data-tab="chat" aria-pressed="true">Hội thoại</button>
          <button type="button" class="chip" data-tab="rules" aria-pressed="false">Kịch bản trả lời tự động</button>
          <span class="spacer"></span>
        </div>
        <p class="fb-status" id="fb-status" role="status"></p>
        <div id="tab-chat" class="fb-layout">
          <section class="panel fb-list"><div class="panel-head"><h2>Cuộc trò chuyện</h2><button type="button" class="btn sm" id="fb-demo">Thử tin nhắn mô phỏng</button></div><ul class="conv" id="conv"></ul></section>
          <section class="panel fb-chat" id="chat"><p class="muted">Chọn một cuộc trò chuyện.</p></section>
        </div>
        <div id="tab-rules" hidden><section class="panel"><div class="panel-head"><h2>Kịch bản trả lời tự động</h2><button type="button" class="btn sm primary" id="rule-add">Thêm kịch bản</button></div>
          <p class="hint" style="margin:0 0 12px">Khách nhắn có chứa từ khóa (không phân biệt hoa thường và dấu, đúng nguyên từ) thì nhận câu trả lời tương ứng. Số thứ tự nhỏ được ưu tiên. Không khớp thì trả lời mặc định kèm hotline.</p>
          <div class="table-wrap" id="rules"></div></section></div>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let timer = null;

      Admin.api('GET', '/api/staff/facebook/status').then((r) => {
        if (dead) return; const el = $('#fb-status');
        el.className = `fb-status ${r.connected ? 'on' : 'off'}`;
        el.textContent = r.connected ? 'Đã nối Facebook: tin trả lời cho khách thật được gửi lên fanpage (chỉ trong 24 giờ kể từ tin cuối của khách).' : 'Chưa nối Facebook (thiếu FB_PAGE_ACCESS_TOKEN trong .env): tin trả lời cho khách thật chỉ được lưu lại, chưa gửi đi. Tin mô phỏng vẫn dùng bình thường.';
      }).catch(() => {});

      const deliveryText = (m) => {
        if (m.direction !== 'out' || m.isDemo) return '';
        if (m.delivered === 'sent') return ' · đã gửi Facebook';
        if (m.delivered === 'failed') return ` · gửi lỗi: ${m.deliveryError || 'không rõ'}`;
        return ' · chưa gửi (chưa nối Facebook)';
      };

      const label = (c) => (c.senderName || c.senderId.replace(/^demo:/, '')) + (c.isDemo ? ' (mô phỏng)' : '');

      async function loadConvs() {
        try { const r = await Admin.api('GET', '/api/staff/facebook/conversations'); if (dead) return; st.convs = r.conversations; drawConvs(); } catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      function drawConvs() {
        const ul = $('#conv'); ul.textContent = '';
        if (!st.convs.length) { ul.innerHTML = '<li class="muted">Chưa có tin nhắn nào.</li>'; return; }
        for (const c of st.convs) {
          const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
          b.className = `conv-item${st.sel === c.senderId ? ' on' : ''}`;
          b.innerHTML = `<strong>${esc(label(c))}</strong><span class="muted">${esc(c.lastAt)} · ${c.messages} tin${c.reservations ? ` · ${c.reservations} lượt đặt` : ''}</span><span class="last">${c.lastDirection === 'out' ? 'Nhà hàng: ' : ''}${esc((c.lastText || '').slice(0, 80))}</span>`;
          b.addEventListener('click', () => { st.sel = c.senderId; drawConvs(); loadMsgs(); });
          li.appendChild(b); ul.appendChild(li);
        }
      }
      async function loadMsgs() {
        if (!st.sel) return;
        try { const r = await Admin.api('GET', `/api/staff/facebook/messages?senderId=${encodeURIComponent(st.sel)}`); if (dead) return; st.msgs = r.messages; drawChat(); } catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      function drawChat() {
        const c = st.convs.find((x) => x.senderId === st.sel);
        const box = $('#chat'); const keepScroll = box.querySelector('.msgs'); const atEnd = !keepScroll || keepScroll.scrollTop + keepScroll.clientHeight >= keepScroll.scrollHeight - 30;
        const draft = box.querySelector('#rp-text') ? box.querySelector('#rp-text').value : '';
        box.innerHTML = `<div class="panel-head"><h2>${esc(c ? label(c) : st.sel)}</h2>
          ${Admin.can('reservation.create') ? '<a class="btn sm" href="#/create" id="fb-book">Đặt bàn cho khách này</a>' : ''}</div>
          <div class="msgs" aria-live="polite">${st.msgs.map((m) => `<div class="msg ${m.direction}"><div class="bub">${esc(m.text)}</div><span class="muted">${esc(m.at)}${m.direction === 'out' ? (m.auto ? ' · tự động' : ' · nhân viên') : ''}${esc(deliveryText(m))}${m.bookingCode ? ` · ${esc(m.bookingCode)}` : ''}</span></div>`).join('') || '<p class="muted">Chưa có tin nhắn.</p>'}</div>
          <form id="rp" class="reply"><textarea id="rp-text" rows="2" maxlength="1000" placeholder="Nhập câu trả lời..." aria-label="Nội dung trả lời"></textarea><button class="btn primary" type="submit">Gửi</button></form>`;
        const t = box.querySelector('#rp-text'); t.value = draft;
        const ms = box.querySelector('.msgs'); if (atEnd) ms.scrollTop = ms.scrollHeight;
        const book = box.querySelector('#fb-book');
        if (book) book.addEventListener('click', () => { Admin.prefill = { fbSenderId: st.sel }; });
        box.querySelector('#rp').addEventListener('submit', async (ev) => {
          ev.preventDefault(); const text = t.value.trim(); if (!text) return;
          const btn = ev.target.querySelector('button'); btn.disabled = true;
          try { await Admin.api('POST', '/api/staff/facebook/reply', { senderId: st.sel, text }); t.value = ''; await loadMsgs(); loadConvs(); } catch (e) { Admin.toast(errText(e)); }
          btn.disabled = false;
        });
      }

      function dialog(title, body, submit, onSubmit) {
        return new Promise((resolve) => {
          const d = document.createElement('dialog');
          d.innerHTML = `<form method="dialog" class="dlg" novalidate><h2>${esc(title)}</h2>${body}<p class="err" role="alert"></p><div class="dlg-actions"><button type="button" class="btn" data-x>Đóng</button><button class="btn primary" type="submit">${esc(submit)}</button></div></form>`;
          document.body.appendChild(d); let res = null; const f = d.querySelector('form'); const err = d.querySelector('.err');
          d.querySelector('[data-x]').addEventListener('click', () => d.close());
          f.addEventListener('submit', async (ev) => { ev.preventDefault(); err.textContent = ''; const b = f.querySelector('[type=submit]'); b.disabled = true; try { res = await onSubmit(f); d.close(); } catch (e) { err.textContent = errText(e); b.disabled = false; } });
          d.addEventListener('close', () => { d.remove(); resolve(res); }); d.showModal(); f.querySelector('input,textarea').focus();
        });
      }

      $('#fb-demo').addEventListener('click', async () => {
        const r = await dialog('Thử tin nhắn mô phỏng', `<label>Tên khách (không bắt buộc)<input name="n" maxlength="60"></label><label>Mã người gửi (chữ, số, _ . -)<input name="s" maxlength="64" value="khach1"></label><label>Nội dung khách nhắn<textarea name="t" rows="3" maxlength="1000"></textarea></label>`, 'Gửi thử',
          (f) => Admin.api('POST', '/api/staff/facebook/demo', { senderName: f.n.value.trim() || undefined, senderId: f.s.value.trim(), text: f.t.value }));
        if (r) { st.sel = r.senderId; Admin.toast('Hệ thống đã tự trả lời', true); await loadConvs(); loadMsgs(); }
      });

      // --- kịch bản ---
      async function loadRules() {
        try { const r = await Admin.api('GET', '/api/staff/facebook/auto-replies'); if (dead) return; st.rules = r.rules; drawRules(); } catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      function drawRules() {
        $('#rules').innerHTML = `<table class="tbl-list"><thead><tr><th>Thứ tự</th><th>Từ khóa</th><th>Câu trả lời</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${st.rules.map((r) => `
          <tr class="${r.isActive ? '' : 'row-cancel'}"><td data-l="Thứ tự">${r.sortOrder}</td><td data-l="Từ khóa"><strong>${esc(r.keyword)}</strong></td><td data-l="Trả lời">${esc(r.replyText)}</td>
          <td data-l="Trạng thái"><span class="badge ${r.isActive ? 'seated' : 'cancel'}">${r.isActive ? 'Đang bật' : 'Đã tắt'}</span></td>
          <td><div class="acts"><button type="button" class="btn sm" data-a="edit" data-id="${r.id}">Sửa</button><button type="button" class="btn sm" data-a="toggle" data-id="${r.id}">${r.isActive ? 'Tắt' : 'Bật'}</button><button type="button" class="btn sm danger-ghost" data-a="del" data-id="${r.id}">Xóa</button></div></td></tr>`).join('')}</tbody></table>`;
      }
      const ruleForm = (r) => `<label>Từ khóa<input name="k" maxlength="60" value="${esc(r ? r.keyword : '')}"></label><label>Câu trả lời<textarea name="t" rows="4" maxlength="1000">${esc(r ? r.replyText : '')}</textarea></label><label>Thứ tự ưu tiên (số nhỏ chạy trước)<input name="o" type="number" min="0" max="9999" value="${r ? r.sortOrder : 10}"></label>`;
      $('#rule-add').addEventListener('click', async () => {
        const ok = await dialog('Thêm kịch bản', ruleForm(null), 'Thêm', (f) => Admin.api('POST', '/api/staff/facebook/auto-replies', { keyword: f.k.value, replyText: f.t.value, sortOrder: Number(f.o.value) }));
        if (ok) { Admin.toast('Đã thêm kịch bản', true); loadRules(); }
      });
      $('#rules').addEventListener('click', async (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return; const r = st.rules.find((x) => x.id === Number(b.dataset.id)); if (!r) return;
        if (b.dataset.a === 'edit') {
          const ok = await dialog('Sửa kịch bản', ruleForm(r), 'Lưu', (f) => Admin.api('PATCH', `/api/staff/facebook/auto-replies/${r.id}`, { keyword: f.k.value, replyText: f.t.value, sortOrder: Number(f.o.value) }));
          if (ok) { Admin.toast('Đã lưu', true); loadRules(); }
        } else if (b.dataset.a === 'toggle') {
          try { await Admin.api('PATCH', `/api/staff/facebook/auto-replies/${r.id}`, { isActive: !r.isActive }); } catch (e) { Admin.toast(errText(e)); } loadRules();
        } else if (await Admin.confirm('Xóa kịch bản này?', `Từ khóa "${r.keyword}" sẽ không còn tự động trả lời.`, 'Xóa', true)) {
          try { await Admin.api('DELETE', `/api/staff/facebook/auto-replies/${r.id}`); Admin.toast('Đã xóa', true); } catch (e) { Admin.toast(errText(e)); } loadRules();
        }
      });

      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
        st.tab = b.dataset.tab; root.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('#tab-chat').hidden = st.tab !== 'chat'; $('#tab-rules').hidden = st.tab !== 'rules'; if (st.tab === 'rules') loadRules();
      }));
      loadConvs(); timer = setInterval(() => { if (!document.hidden && st.tab === 'chat') { loadConvs(); if (st.sel && !$('#rp-text').value) loadMsgs(); } }, 10000);
      return { destroy() { dead = true; clearInterval(timer); } };
    },
  };

  // ---------- Nhật ký ----------
  const ACTION_TEXT = {
    'reservation.create': 'Tạo đặt bàn', 'reservation.arrive': 'Khách đã đến', 'reservation.release': 'Khách đã về', 'reservation.no_show': 'Khách không đến',
    'reservation.cancel': 'Hủy đặt bàn', 'reservation.status': 'Đổi trạng thái', 'staff.create': 'Tạo nhân viên', 'staff.update': 'Sửa nhân viên',
    'staff.reset_password': 'Đặt lại mật khẩu', 'staff.change_password': 'Đổi mật khẩu', 'facebook.reply': 'Trả lời Facebook',
    'facebook.rule_create': 'Thêm kịch bản', 'facebook.rule_update': 'Sửa kịch bản', 'facebook.rule_delete': 'Xóa kịch bản',
  };
  const GROUPS = [['', 'Mọi thao tác'], ['reservation', 'Đặt bàn'], ['staff', 'Nhân viên'], ['facebook', 'Facebook']];
  const PAGE = 50;

  function detailText(d) {
    if (!d || typeof d !== 'object') return '';
    return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  }

  Admin.screens.audit = {
    title: 'Nhật ký', permission: 'audit.view',
    render(root) {
      const st = { from: '', to: '', action: '', staffId: '', q: '', offset: 0 };
      root.innerHTML = `
        <div class="toolbar">
          <label class="inl">Từ <input type="date" id="a-from"></label><label class="inl">đến <input type="date" id="a-to"></label>
          <select id="a-action" aria-label="Loại thao tác">${GROUPS.map((g) => `<option value="${g[0]}">${g[1]}</option>`).join('')}</select>
          <select id="a-staff" aria-label="Nhân viên"><option value="">Mọi nhân viên</option></select>
          <input type="search" id="a-q" placeholder="Mã hoặc số hiệu đối tượng" aria-label="Tìm kiếm" maxlength="40">
          <button type="button" class="btn sm primary" id="a-go">Lọc</button><button type="button" class="btn sm" id="a-clear">Bỏ lọc</button>
        </div>
        <p class="sum" id="a-sum" aria-live="polite"></p>
        <div class="table-wrap" id="a-list"></div>
        <div class="pager"><button type="button" class="btn sm" id="a-prev">Trang trước</button><button type="button" class="btn sm" id="a-next">Trang sau</button></div>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let reqId = 0;

      Admin.api('GET', '/api/staff/members').then((r) => { if (dead) return; for (const m of r.members) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.fullName} (${m.username})`; $('#a-staff').appendChild(o); } }).catch(() => {});

      async function load() {
        const my = ++reqId; const q = new URLSearchParams({ limit: String(PAGE), offset: String(st.offset) });
        for (const k of ['from', 'to', 'action', 'staffId', 'q']) if (st[k]) q.set(k, st[k]);
        try {
          const r = await Admin.api('GET', `/api/staff/audit-logs?${q}`); if (my !== reqId || dead) return;
          const from = r.total === 0 ? 0 : st.offset + 1; const to = Math.min(st.offset + PAGE, r.total);
          $('#a-sum').textContent = `${r.total} dòng${r.total ? `, đang xem ${from} đến ${to}` : ''}. Nhật ký chỉ ghi thêm, không sửa hoặc xóa được.`;
          $('#a-prev').disabled = st.offset === 0; $('#a-next').disabled = st.offset + PAGE >= r.total;
          $('#a-list').innerHTML = r.items.length ? `<table class="tbl-list"><thead><tr><th>Lúc</th><th>Nhân viên</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>${r.items.map((i) => `
            <tr><td data-l="Lúc">${esc(i.at)}</td><td data-l="Nhân viên">${esc(i.actor || '')}</td><td data-l="Thao tác"><strong>${esc(ACTION_TEXT[i.action] || i.action)}</strong><small>${esc(i.action)}</small></td>
            <td data-l="Đối tượng">${esc(i.entityType || '')} ${esc(i.entityId || '')}</td><td data-l="Chi tiết" class="note">${esc(detailText(i.detail))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Không có dòng nhật ký nào khớp bộ lọc.</p>';
        } catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      const apply = () => { st.from = $('#a-from').value; st.to = $('#a-to').value; st.action = $('#a-action').value; st.staffId = $('#a-staff').value; st.q = $('#a-q').value.trim(); st.offset = 0; load(); };
      $('#a-go').addEventListener('click', apply);
      $('#a-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
      $('#a-clear').addEventListener('click', () => { ['#a-from', '#a-to', '#a-q'].forEach((s) => { $(s).value = ''; }); $('#a-action').value = ''; $('#a-staff').value = ''; apply(); });
      $('#a-prev').addEventListener('click', () => { st.offset = Math.max(0, st.offset - PAGE); load(); });
      $('#a-next').addEventListener('click', () => { st.offset += PAGE; load(); });
      load();
      return { destroy() { dead = true; } };
    },
  };
})();
