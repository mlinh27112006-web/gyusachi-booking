// Màn hình "Bảo trì & đóng cửa": tạm ngưng/mở lại bàn và đặt lịch đóng cửa theo ngày hoặc khung giờ.
(function () {
  'use strict';
  const { esc } = Admin;
  const errText = (e) => (e && e.message) || 'Có lỗi xảy ra';
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  function ask(title, fieldsHtml, submitLabel, onSubmit) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form method="dialog" class="dlg" novalidate><h2>${esc(title)}</h2>${fieldsHtml}<p class="err" role="alert"></p>
        <div class="dlg-actions"><button type="button" class="btn" data-x>Đóng</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></div></form>`;
      document.body.appendChild(dlg);
      const form = dlg.querySelector('form'); const err = dlg.querySelector('.err'); let result = null;
      dlg.querySelector('[data-x]').addEventListener('click', () => dlg.close());
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); err.textContent = '';
        const btn = form.querySelector('[type=submit]'); btn.disabled = true;
        try { result = await onSubmit(form); dlg.close(); } catch (e) { err.textContent = errText(e); btn.disabled = false; }
      });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      dlg.showModal(); const f = form.querySelector('input'); if (f) f.focus();
    });
  }

  Admin.screens.maintenance = {
    title: 'Bảo trì & đóng cửa', permission: 'table.manage',
    render(root) {
      root.innerHTML = `
        <section class="panel"><div class="panel-head"><h2>Đóng cửa hoặc tạm ngừng nhận khách</h2></div>
          <p class="hint" style="margin:0 0 12px">Trong thời gian này, website, hotline và chatbot đều không nhận thêm đặt bàn. Lượt đã đặt trước không tự hủy: hệ thống báo số lượng để nhân viên liên hệ khách.</p>
          <form id="cf" novalidate>
            <div class="form-grid">
              <label>Từ ngày <input type="date" id="c-from" min="${today()}" value="${today()}"></label>
              <label>Đến ngày <input type="date" id="c-to" min="${today()}" value="${today()}"></label>
              <label class="wide"><span><input type="checkbox" id="c-all" checked> Đóng cả ngày</span></label>
              <label>Từ giờ <input type="time" id="c-tf" disabled></label>
              <label>Đến giờ <input type="time" id="c-tt" disabled></label>
              <label class="wide">Lý do <input id="c-reason" maxlength="200" placeholder="Ví dụ: nghỉ lễ, sửa chữa, kín tiệc"></label>
            </div>
            <p class="err" id="c-err" role="alert"></p>
            <button type="submit" class="btn primary" id="c-go">Thêm lịch đóng cửa</button>
          </form></section>
        <section class="panel"><div class="panel-head"><h2>Lịch đóng cửa sắp tới</h2></div><div class="table-wrap" id="c-list"><p class="muted">Đang tải…</p></div></section>
        <section class="panel"><div class="panel-head"><h2>Bàn</h2><button type="button" class="btn sm" id="t-reload">Tải lại</button></div>
          <p class="hint" style="margin:0 0 12px">Bàn bị tạm ngưng sẽ không hiện trên sơ đồ và không nhận đặt. Chỉ tạm ngưng được khi bàn không còn lượt đặt chưa xử lý.</p>
          <div class="table-wrap" id="t-list"><p class="muted">Đang tải…</p></div></section>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let closures = []; let tables = [];

      async function loadClosures() {
        try { const r = await Admin.api('GET', '/api/staff/closures'); if (dead) return; closures = r.closures; drawClosures(); }
        catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      function drawClosures() {
        $('#c-list').innerHTML = closures.length ? `<table class="tbl-list"><thead><tr><th>Ngày</th><th>Giờ</th><th>Lý do</th><th>Tạo bởi</th><th></th></tr></thead><tbody>${closures.map((c) => `
          <tr><td data-l="Ngày">${fmtDate(c.dateFrom)}${c.dateTo !== c.dateFrom ? ` đến ${fmtDate(c.dateTo)}` : ''}</td>
          <td data-l="Giờ">${c.timeFrom ? `${esc(c.timeFrom)} đến ${esc(c.timeTo)}` : 'Cả ngày'}</td>
          <td data-l="Lý do">${esc(c.reason)}</td><td data-l="Tạo bởi">${esc(c.createdBy || '')}</td>
          <td><div class="acts"><button type="button" class="btn sm danger-ghost" data-a="del" data-id="${c.id}">Xóa</button></div></td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">Chưa có lịch đóng cửa nào.</p>';
      }

      async function loadTables() {
        try { const r = await Admin.api('GET', '/api/staff/tables'); if (dead) return; tables = r.tables; drawTables(); }
        catch (e) { if (!dead) Admin.toast(errText(e)); }
      }
      function drawTables() {
        $('#t-list').innerHTML = `<table class="tbl-list"><thead><tr><th>Bàn</th><th>Tầng</th><th>Chỗ</th><th>Trạng thái</th><th>Lượt chưa xử lý</th><th></th></tr></thead><tbody>${tables.map((t) => `
          <tr class="${t.isActive ? '' : 'row-cancel'}"><td data-l="Bàn"><strong>${esc(t.code.toUpperCase())}</strong>${t.isVip ? '<small>Phòng VIP</small>' : ''}</td>
          <td data-l="Tầng">${t.floor}</td><td data-l="Chỗ">${t.capacity}</td>
          <td data-l="Trạng thái"><span class="badge ${t.isActive ? 'seated' : 'cancel'}">${t.isActive ? 'Đang dùng' : 'Tạm ngưng'}</span>${t.note ? `<small>${esc(t.note)}</small>` : ''}</td>
          <td data-l="Lượt chưa xử lý">${t.upcoming}</td>
          <td><div class="acts"><button type="button" class="btn sm ${t.isActive ? 'danger-ghost' : ''}" data-a="toggle" data-id="${t.id}">${t.isActive ? 'Tạm ngưng' : 'Mở lại'}</button></div></td></tr>`).join('')}</tbody></table>`;
      }

      $('#c-all').addEventListener('change', (e) => { $('#c-tf').disabled = e.target.checked; $('#c-tt').disabled = e.target.checked; });
      $('#c-from').addEventListener('change', (e) => { if ($('#c-to').value < e.target.value) $('#c-to').value = e.target.value; $('#c-to').min = e.target.value; });
      $('#cf').addEventListener('submit', async (ev) => {
        ev.preventDefault(); const err = $('#c-err'); err.textContent = '';
        const all = $('#c-all').checked;
        const body = { dateFrom: $('#c-from').value, dateTo: $('#c-to').value, reason: $('#c-reason').value };
        if (!all) { body.timeFrom = $('#c-tf').value; body.timeTo = $('#c-tt').value; }
        const go = $('#c-go'); go.disabled = true;
        try {
          const r = await Admin.api('POST', '/api/staff/closures', body);
          Admin.toast(r.conflicts ? `Đã thêm. Còn ${r.conflicts} lượt đặt trong thời gian này, hãy liên hệ khách để đổi hoặc hủy.` : 'Đã thêm lịch đóng cửa', !r.conflicts);
          $('#c-reason').value = ''; loadClosures();
        } catch (e) { err.textContent = errText(e); } finally { go.disabled = false; }
      });

      root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return;
        if (b.dataset.a === 'del') {
          const c = closures.find((x) => x.id === Number(b.dataset.id)); if (!c) return;
          if (!(await Admin.confirm('Xóa lịch đóng cửa?', `${fmtDate(c.dateFrom)}${c.timeFrom ? ` ${c.timeFrom}-${c.timeTo}` : ''}: ${c.reason}. Khách sẽ đặt bàn được lại trong thời gian này.`, 'Xóa', true))) return;
          try { await Admin.api('DELETE', `/api/staff/closures/${c.id}`); Admin.toast('Đã xóa lịch đóng cửa', true); } catch (e) { Admin.toast(errText(e)); }
          loadClosures(); return;
        }
        const t = tables.find((x) => x.id === Number(b.dataset.id)); if (!t) return;
        if (t.isActive) {
          const ok = await ask(`Tạm ngưng bàn ${t.code.toUpperCase()}`, '<label>Lý do (ví dụ: hỏng ghế, sửa bếp nướng)<input name="note" maxlength="200"></label>', 'Tạm ngưng',
            (f) => Admin.api('PATCH', `/api/staff/tables/${t.id}`, { isActive: false, note: f.note.value }));
          if (ok) { Admin.toast(`Đã tạm ngưng bàn ${t.code.toUpperCase()}`, true); loadTables(); }
        } else {
          try { await Admin.api('PATCH', `/api/staff/tables/${t.id}`, { isActive: true }); Admin.toast(`Đã mở lại bàn ${t.code.toUpperCase()}`, true); } catch (e) { Admin.toast(errText(e)); }
          loadTables();
        }
      });
      $('#t-reload').addEventListener('click', loadTables);
      loadClosures(); loadTables();
      return { destroy() { dead = true; } };
    },
  };
})();
