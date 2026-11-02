// Màn hình "Danh sách chờ": khách muốn khung giờ đã hết bàn. Có bàn trống thì bot nhắn Messenger (fanpage) hoặc nhân viên gọi.
(function () {
  'use strict';
  const { esc } = Admin;
  const errText = (e) => (e && e.message) || 'Có lỗi xảy ra';
  const CHANNEL = { website: 'Website', hotline: 'Hotline', fanpage: 'Fanpage' };
  const STATUS = {
    waiting: { t: 'Đang chờ', c: 'wait' },
    notified: { t: 'Có bàn trống', c: 'hot' },
    booked: { t: 'Đã đặt bàn', c: 'seated' },
    expired: { t: 'Hết hạn', c: 'cancel' },
    cancelled: { t: 'Đã hủy', c: 'cancel' },
  };
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const phoneFmt = (p) => String(p).replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

  Admin.screens.waitlist = {
    title: 'Danh sách chờ', permission: 'reservation.view',
    render(root) {
      const st = { list: [] };
      const canWrite = Admin.can('reservation.create');
      const needChannel = !['hotline_staff', 'fanpage_staff'].includes(Admin.user.role);
      root.innerHTML = `
        ${canWrite ? `<section class="panel"><div class="panel-head"><h2>Ghi tên chờ hộ khách</h2></div>
          <form id="f" novalidate>
            <div class="form-grid">
              <label>Ngày <input type="date" id="f-date" min="${today()}" max="${addDays(today(), 7)}" value="${today()}"></label>
              <label>Giờ muốn đến <select id="f-time"></select></label>
              <label>Số khách <input type="number" id="f-party" min="1" max="20" value="2" inputmode="numeric"></label>
              ${needChannel ? '<label>Kênh <select id="f-ch"><option value="hotline">Hotline</option><option value="fanpage">Fanpage</option></select></label>' : ''}
              <label>Họ tên <input id="f-name" maxlength="100" autocomplete="off"></label>
              <label>Số điện thoại <input id="f-phone" inputmode="tel" maxlength="16" autocomplete="off"></label>
              <label class="wide">Ghi chú <input id="f-note" maxlength="300"></label>
            </div>
            <p class="err" id="f-err" role="alert"></p>
            <button type="submit" class="btn primary" id="f-go">Ghi vào danh sách chờ</button>
          </form></section>` : ''}
        <section class="panel"><div class="panel-head"><h2>Khách đang chờ</h2><button type="button" class="btn sm" id="reload">Tải lại</button></div>
          <p class="hint" style="margin:0 0 12px">Hệ thống tự kiểm tra bàn trống sau mỗi thay đổi đặt bàn. Khách ghi chờ qua chatbot fanpage sẽ được bot nhắn Messenger và có ${10} phút để trả lời "ok". Khách web/hotline: nhân viên gọi rồi bấm "Đã gọi" hoặc "Tạo đặt bàn".</p>
          <div class="table-wrap" id="list"><p class="muted">Đang tải…</p></div></section>`;
      const $ = (s) => root.querySelector(s);
      let dead = false;

      async function loadSlots() {
        if (!canWrite) return;
        try {
          const slots = (await Admin.api('GET', `/api/staff/slots?date=${$('#f-date').value}`)).slots;
          const sel = $('#f-time'); const keep = sel.value; sel.textContent = '';
          for (const s of slots) { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); }
          if (slots.includes(keep)) sel.value = keep;
          if (!slots.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Hết giờ nhận khách'; sel.appendChild(o); }
        } catch (e) { Admin.toast(errText(e)); }
      }

      function draw() {
        const box = $('#list');
        if (!st.list.length) { box.innerHTML = '<p class="muted">Chưa có khách nào trong danh sách chờ.</p>'; return; }
        box.innerHTML = `<table class="tbl-list"><thead><tr><th>Giờ muốn đến</th><th>Khách</th><th>Số khách</th><th>Kênh</th><th>Trạng thái</th><th></th></tr></thead><tbody>${st.list.map((r) => {
          const s = STATUS[r.status]; const open = r.status === 'waiting' || r.status === 'notified';
          return `<tr${r.status === 'notified' ? ' style="background:#fff8e6"' : ''}>
            <td data-l="Giờ muốn đến"><b>${esc(r.time)}</b> <small>${esc(fmt(r.date))}</small></td>
            <td data-l="Khách">${esc(r.name)}<br><small>${esc(phoneFmt(r.phone))}</small>${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td>
            <td data-l="Số khách">${r.party}</td>
            <td data-l="Kênh">${esc(CHANNEL[r.channel] || r.channel)}</td>
            <td data-l="Trạng thái"><span class="badge ${s.c}">${s.t}</span>${r.result ? `<small>${esc(r.result)}</small>` : ''}${r.bookingCode ? `<small>${esc(r.bookingCode)}</small>` : ''}</td>
            <td><div class="acts">${open && canWrite ? `<button type="button" class="btn sm primary" data-a="book" data-id="${r.id}">Tạo đặt bàn</button>` : ''}${open && Admin.can('reservation.update_status') ? `<button type="button" class="btn sm" data-a="contacted" data-id="${r.id}">Đã gọi</button><button type="button" class="btn sm danger-ghost" data-a="cancel" data-id="${r.id}">Hủy</button>` : ''}</div></td></tr>`;
        }).join('')}</tbody></table>`;
      }

      async function load() {
        try { const r = await Admin.api('GET', '/api/staff/waitlist'); if (dead) return; st.list = r.entries; draw(); }
        catch (e) { if (!dead) Admin.toast(errText(e)); }
      }

      root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return;
        const r = st.list.find((x) => x.id === Number(b.dataset.id)); if (!r) return;
        if (b.dataset.a === 'book') { Admin.prefill = { date: r.date, time: r.time, party: Math.min(r.party, 20), name: r.name, phone: r.phone }; Admin.go('create'); return; }
        if (b.dataset.a === 'cancel' && !(await Admin.confirm('Bỏ khách khỏi danh sách chờ?', `${r.name} (${phoneFmt(r.phone)}) sẽ không được báo khi có bàn.`, 'Bỏ khỏi danh sách', true))) return;
        b.disabled = true;
        try { await Admin.api('POST', `/api/staff/waitlist/${r.id}/${b.dataset.a}`); Admin.toast(b.dataset.a === 'cancel' ? 'Đã bỏ khỏi danh sách chờ' : 'Đã ghi nhận đã gọi khách', true); }
        catch (e) { Admin.toast(errText(e)); }
        load();
      });
      $('#reload').addEventListener('click', load);

      if (canWrite) {
        $('#f-date').addEventListener('change', loadSlots);
        $('#f').addEventListener('submit', async (ev) => {
          ev.preventDefault(); const err = $('#f-err'); err.textContent = '';
          const body = { date: $('#f-date').value, time: $('#f-time').value, party: Number($('#f-party').value), name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), note: $('#f-note').value.trim() };
          if (needChannel) body.channel = $('#f-ch').value;
          if (!body.time) { err.textContent = 'Vui lòng chọn giờ'; return; }
          const go = $('#f-go'); go.disabled = true;
          try {
            const r = await Admin.api('POST', '/api/staff/waitlist', body);
            Admin.toast(r.existed ? 'Khách này đã có trong danh sách chờ giờ đó' : 'Đã ghi vào danh sách chờ', !r.existed);
            if (!r.existed) { $('#f-name').value = ''; $('#f-phone').value = ''; $('#f-note').value = ''; }
            load();
          } catch (e) { err.textContent = errText(e); }
          finally { go.disabled = false; }
        });
        loadSlots();
      }

      load();
      const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
      const off = window.GSLive ? GSLive.on(load) : () => {};
      return { destroy() { dead = true; off(); clearInterval(timer); } };
    },
  };
})();
