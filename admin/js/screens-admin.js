// Màn hình "Báo cáo" và "Nhân viên".
(function () {
  'use strict';
  const { esc } = Admin;
  const R = Admin.res;
  const errText = (e) => (e && e.message) || 'Có lỗi xảy ra';
  const CH = { website: 'Website', hotline: 'Hotline', fanpage: 'Fanpage' };

  // ---------- Báo cáo ----------
  function bars(rows, valueKey, labelFn, valueFn, max) {
    const m = max || Math.max(1, ...rows.map((r) => r[valueKey]));
    return `<ul class="bars">${rows.map((r) => `<li><span class="bl">${esc(labelFn(r))}</span><span class="bt"><i style="width:${Math.round((r[valueKey] / m) * 100)}%${r[valueKey] > 0 ? ';min-width:3px' : ''}"></i></span><span class="bv">${esc(valueFn(r))}</span></li>`).join('')}</ul>`;
  }

  Admin.screens.reports = {
    title: 'Báo cáo', permission: 'report.view',
    render(root) {
      const st = { from: R.addDays(R.today(), -29), to: R.today() };
      root.innerHTML = `
        <div class="toolbar">
          <button type="button" class="btn sm" data-r="7">7 ngày</button><button type="button" class="btn sm" data-r="30">30 ngày</button><button type="button" class="btn sm" data-r="90">90 ngày</button>
          <label class="inl">Từ <input type="date" id="r-from" value="${st.from}"></label>
          <label class="inl">đến <input type="date" id="r-to" value="${st.to}"></label>
          <button type="button" class="btn sm primary" id="r-go">Xem báo cáo</button>
        </div>
        <p class="err" id="r-err" role="alert"></p>
        <div id="r-body"></div>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let reqId = 0;

      async function load() {
        const my = ++reqId; $('#r-err').textContent = '';
        try {
          const d = await Admin.api('GET', `/api/staff/reports?from=${st.from}&to=${st.to}`);
          if (my !== reqId || dead) return; draw(d);
        } catch (e) { if (!dead) { $('#r-err').textContent = errText(e); $('#r-body').textContent = ''; } }
      }

      function draw(d) {
        const s = d.summary;
        const tiles = [
          [s.total, 'Lượt đặt bàn'], [s.guestsExpected, 'Khách dự kiến'], [s.avgPartySize, 'Khách trung bình / lượt'],
          [`${s.cancelRate}%`, 'Tỷ lệ hủy'], [`${s.noShowRate}%`, 'Tỷ lệ không đến'], [`${s.occupancyRate}%`, 'Mức lấp đầy bàn'],
        ];
        const hoursMax = Math.max(1, ...d.byHour.map((h) => h.reservations));
        $('#r-body').innerHTML = `
          <p class="sum">${R.fmtDate(d.from)} đến ${R.fmtDate(d.to)}. Chờ ${s.byStatus.confirmed}, đã về ${s.byStatus.completed}, không đến ${s.byStatus.no_show}, hủy ${s.byStatus.cancelled}.</p>
          <div class="stats">${tiles.map((t, i) => `<div class="stat${i === 4 && s.noShowRate >= 15 ? ' warn' : ''}"><strong>${esc(t[0])}</strong><span>${t[1]}</span></div>`).join('')}</div>
          <div class="grid2">
            <section class="panel"><div class="panel-head"><h2>Theo kênh</h2></div>${bars(d.byChannel, 'total', (r) => CH[r.channel], (r) => `${r.total} lượt (${r.share}%)`)}
              <p class="hint">Hủy và không đến theo kênh: ${d.byChannel.map((r) => `${CH[r.channel]} ${r.cancelled} hủy, ${r.noShow} không đến`).join('; ')}.</p></section>
            <section class="panel"><div class="panel-head"><h2>Giờ cao điểm</h2>${d.peakHour != null ? `<span class="muted">Đông nhất: ${String(d.peakHour).padStart(2, '0')}:00</span>` : ''}</div>
              ${d.byHour.length ? bars(d.byHour, 'reservations', (r) => r.label, (r) => `${r.reservations} lượt, ${r.guests} khách`, hoursMax) : '<p class="muted">Chưa có dữ liệu.</p>'}</section>
          </div>
          <section class="panel"><div class="panel-head"><h2>Theo ngày</h2></div>
            ${d.byDay.length ? `<div class="table-wrap"><table class="tbl-list simple"><thead><tr><th>Ngày</th><th>Lượt đặt</th><th>Giữ được</th><th>Khách</th><th>Hủy</th><th>Không đến</th></tr></thead><tbody>${d.byDay.map((r) => `<tr><td data-l="Ngày">${R.fmtDate(r.date)}</td><td data-l="Lượt đặt">${r.total}</td><td data-l="Giữ được">${r.kept}</td><td data-l="Khách">${r.guests}</td><td data-l="Hủy">${r.cancelled}</td><td data-l="Không đến">${r.noShow}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa có lượt đặt nào trong khoảng này.</p>'}</section>
          <div class="grid2">
            <section class="panel"><div class="panel-head"><h2>Mức dùng từng bàn</h2></div>${bars(d.byTable, 'usageRate', (r) => `${r.code.toUpperCase()} (${r.capacity} chỗ)`, (r) => `${r.reservations} lượt, ${r.usageRate}%`, Math.max(1, ...d.byTable.map((r) => r.usageRate)))}</section>
            <section class="panel"><div class="panel-head"><h2>Khách hay không đến</h2></div>
              ${d.topNoShowCustomers.length ? `<ul class="plain">${d.topNoShowCustomers.map((c) => `<li><strong>${esc(c.name)}</strong> ${esc(c.phone)} <span class="ns">${c.noShowCount} lần</span></li>`).join('')}</ul>` : '<p class="muted">Chưa có khách nào không đến.</p>'}</section>
          </div>`;
      }

      root.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
        st.to = R.today(); st.from = R.addDays(st.to, -(Number(b.dataset.r) - 1)); $('#r-from').value = st.from; $('#r-to').value = st.to; load();
      }));
      $('#r-go').addEventListener('click', () => { st.from = $('#r-from').value; st.to = $('#r-to').value; if (!st.from || !st.to) { $('#r-err').textContent = 'Vui lòng chọn đủ ngày bắt đầu và kết thúc.'; return; } load(); });
      load();
      return { destroy() { dead = true; } };
    },
  };

  // ---------- Nhân viên ----------
  // Hộp thoại biểu mẫu dựng bằng JS: trả về Promise<object|null>.
  function formDialog(title, fieldsHtml, submitLabel, onSubmit) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form method="dialog" class="dlg" novalidate><h2>${esc(title)}</h2>${fieldsHtml}<p class="err" role="alert"></p>
        <div class="dlg-actions"><button type="button" class="btn" data-x>Đóng</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></div></form>`;
      document.body.appendChild(dlg);
      const form = dlg.querySelector('form'); const err = dlg.querySelector('.err');
      let result = null;
      dlg.querySelector('[data-x]').addEventListener('click', () => dlg.close());
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); err.textContent = '';
        const btn = form.querySelector('[type=submit]'); btn.disabled = true;
        try { result = await onSubmit(form); dlg.close(); } catch (e) { err.textContent = errText(e); btn.disabled = false; }
      });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      dlg.showModal(); const f = form.querySelector('input,select'); if (f) f.focus();
    });
  }

  Admin.screens.staff = {
    title: 'Nhân viên', permission: 'staff.view',
    render(root) {
      const canEdit = Admin.can('staff.create');
      root.innerHTML = `
        <div class="toolbar"><strong>Tài khoản nhân viên</strong><span class="spacer"></span>${canEdit ? '<button type="button" class="btn primary sm" id="s-add">Thêm nhân viên</button>' : ''}</div>
        <div class="table-wrap" id="s-list"></div>`;
      const $ = (s) => root.querySelector(s);
      let dead = false; let members = []; let roles = [];

      async function load() {
        try {
          const [m, r] = await Promise.all([Admin.api('GET', '/api/staff/members'), Admin.api('GET', '/api/staff/roles')]);
          if (dead) return; members = m.members; roles = r.roles; draw();
        } catch (e) { if (!dead) Admin.toast(errText(e)); }
      }

      const roleOptions = (sel) => roles.map((r) => `<option value="${r.code}"${r.code === sel ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
      // Có sửa được tài khoản này không: không phải owner, không phải chính mình, admin chỉ owner sửa.
      const editable = (m) => canEdit && m.role !== 'owner' && m.id !== Admin.user.id && (m.role !== 'admin' || Admin.user.role === 'owner');

      function draw() {
        $('#s-list').innerHTML = `<table class="tbl-list"><thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Trạng thái</th><th>Tạo lúc</th><th>Thao tác</th></tr></thead><tbody>${members.map((m) => `
          <tr class="${m.isActive ? '' : 'row-cancel'}"><td data-l="Họ tên"><strong>${esc(m.fullName)}</strong>${m.id === Admin.user.id ? '<small>Tài khoản của bạn</small>' : ''}</td>
          <td data-l="Đăng nhập">${esc(m.username)}</td><td data-l="Vai trò">${esc(m.roleName)}</td>
          <td data-l="Trạng thái"><span class="badge ${m.isActive ? 'seated' : 'cancel'}">${m.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
          <td data-l="Tạo lúc">${esc(m.createdAt)}${m.createdBy ? `<small>bởi ${esc(m.createdBy)}</small>` : ''}</td>
          <td><div class="acts">${editable(m) ? `<button type="button" class="btn sm" data-a="edit" data-id="${m.id}">Sửa</button><button type="button" class="btn sm" data-a="pw" data-id="${m.id}">Đặt lại mật khẩu</button><button type="button" class="btn sm ${m.isActive ? 'danger-ghost' : ''}" data-a="lock" data-id="${m.id}">${m.isActive ? 'Khóa' : 'Mở khóa'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`;
      }

      const pwField = '<label>Mật khẩu (8 đến 72 ký tự, gồm chữ và số)<input name="password" type="password" autocomplete="new-password" maxlength="72"></label>';

      async function add() {
        const ok = await formDialog('Thêm nhân viên', `
          <label>Họ tên<input name="fullName" maxlength="100"></label>
          <label>Tên đăng nhập (chữ thường, số, dấu . _ -)<input name="username" maxlength="30" autocomplete="off"></label>
          <label>Vai trò<select name="role">${roleOptions('hotline_staff')}</select></label>${pwField}`, 'Tạo tài khoản',
        (f) => Admin.api('POST', '/api/staff/members', { fullName: f.fullName.value, username: f.username.value.trim().toLowerCase(), role: f.role.value, password: f.password.value }));
        if (ok) { Admin.toast('Đã tạo tài khoản', true); load(); }
      }

      async function edit(m) {
        const ok = await formDialog(`Sửa ${m.username}`, `<label>Họ tên<input name="fullName" maxlength="100" value="${esc(m.fullName)}"></label>
          <label>Vai trò<select name="role">${roleOptions(m.role)}</select></label>`, 'Lưu',
        (f) => Admin.api('PATCH', `/api/staff/members/${m.id}`, { fullName: f.fullName.value, role: f.role.value }));
        if (ok) { Admin.toast('Đã lưu thay đổi', true); load(); }
      }

      async function resetPw(m) {
        const ok = await formDialog(`Đặt lại mật khẩu cho ${m.username}`, `<label>Mật khẩu mới (8 đến 72 ký tự, gồm chữ và số)<input name="p" type="password" autocomplete="new-password" maxlength="72"></label>`, 'Đặt lại',
          (f) => Admin.api('POST', `/api/staff/members/${m.id}/reset-password`, { newPassword: f.p.value }));
        if (ok) Admin.toast(`Đã đặt lại mật khẩu cho ${m.username}`, true);
      }

      async function lock(m) {
        const to = !m.isActive;
        if (!to && !(await Admin.confirm(`Khóa tài khoản ${m.username}?`, `${m.fullName} sẽ không đăng nhập được nữa và bị đăng xuất ngay. Bạn có thể mở khóa lại sau.`, 'Khóa tài khoản', true))) return;
        try { await Admin.api('PATCH', `/api/staff/members/${m.id}`, { isActive: to }); Admin.toast(to ? 'Đã mở khóa' : 'Đã khóa tài khoản', true); } catch (e) { Admin.toast(errText(e)); }
        load();
      }

      root.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-a]'); if (!b) return;
        const m = members.find((x) => x.id === Number(b.dataset.id)); if (!m) return;
        ({ edit, pw: resetPw, lock })[b.dataset.a](m);
      });
      if (canEdit) $('#s-add').addEventListener('click', add);
      load();
      return { destroy() { dead = true; } };
    },
  };
})();
