// Khung trang quản trị: đăng nhập, gọi API có token, menu theo quyền, chuyển màn hình bằng #/ten-man-hinh.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'gyu_admin_token';

  const Admin = {
    user: null,
    screens: {},          // đăng ký bởi các file screens-*.js: { id: { title, permission, render(root, ctx) } }
    current: null,        // màn hình đang mở, có thể có hàm destroy()
    $,
  };

  // ---------- Tiện ích ----------
  Admin.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Admin.can = (perm) => !!(Admin.user && Admin.user.permissions.includes(perm));

  let toastTimer = null;
  Admin.toast = (msg, ok) => {
    const el = $('toast'); el.textContent = msg; el.classList.toggle('ok', !!ok); el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 5000);
  };

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* bỏ qua */ } }

  // Gọi API kèm token. 401 (hết phiên, tài khoản bị khóa) thì quay về màn hình đăng nhập.
  Admin.api = async (method, url, body, opts) => {
    const headers = {}; const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw { code: 'NETWORK', message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.' }; }
    if (res.status === 204) return null;
    let raw = ''; let data = null; try { raw = await res.text(); data = JSON.parse(raw); } catch (e) { /* không phải JSON */ }
    if (!res.ok) {
      // Ưu tiên câu lỗi tiếng Việt từ server; nếu server cũ trả dạng khác thì hiện mã lỗi để dễ tìm nguyên nhân.
      const msg = (data && (data.error || data.message)) || `Máy chủ trả về lỗi ${res.status}${raw ? ': ' + raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : ''}. Hãy kiểm tra cửa sổ terminal đang chạy server.`;
      const err = { status: res.status, code: data && data.code, message: msg };
      if (res.status === 401 && !(opts && opts.noLogout)) { Admin.logout(err.message); }
      throw err;
    }
    return data;
  };

  // Hộp xác nhận dùng chung: trả về Promise<boolean>.
  Admin.confirm = (title, text, yesLabel, danger) => new Promise((resolve) => {
    const dlg = $('dlg-confirm');
    $('dc-title').textContent = title; $('dc-text').textContent = text;
    const yes = $('dc-yes'); yes.textContent = yesLabel || 'Đồng ý'; yes.classList.toggle('danger', !!danger);
    const done = () => { dlg.removeEventListener('close', done); resolve(dlg.returnValue === 'yes'); };
    dlg.addEventListener('close', done); dlg.returnValue = 'no'; dlg.showModal(); $('dc-no').focus();
  });

  // ---------- Đăng nhập, đăng xuất ----------
  function showLogin(msg) {
    $('app-view').hidden = true; $('login-view').hidden = false;
    $('lg-err').textContent = msg || ''; $('lg-pass').value = ''; ($('lg-user').value ? $('lg-pass') : $('lg-user')).focus();
  }

  Admin.logout = (msg) => {
    setToken(null); Admin.user = null; destroyCurrent(); showLogin(msg);
  };

  async function login(ev) {
    ev.preventDefault();
    const username = $('lg-user').value.trim(); const password = $('lg-pass').value;
    if (!username || !password) { $('lg-err').textContent = 'Vui lòng nhập tên đăng nhập và mật khẩu'; return; }
    const btn = $('lg-btn'); btn.disabled = true; btn.textContent = 'Đang đăng nhập';
    try {
      const r = await Admin.api('POST', '/api/auth/login', { username, password }, { noLogout: true });
      setToken(r.token); Admin.user = r.user; $('lg-err').textContent = ''; enterApp();
    } catch (e) { $('lg-err').textContent = e.message; $('lg-pass').value = ''; $('lg-pass').focus(); }
    finally { btn.disabled = false; btn.textContent = 'Đăng nhập'; }
  }

  // ---------- Menu và chuyển màn hình ----------
  const ORDER = ['overview', 'reservations', 'create', 'tables', 'facebook', 'reports', 'staff', 'audit'];

  function visibleScreens() { return ORDER.filter((id) => Admin.screens[id] && Admin.can(Admin.screens[id].permission)); }

  function renderMenu() {
    const nav = $('menu'); nav.textContent = '';
    for (const id of visibleScreens()) {
      const a = document.createElement('a'); a.href = `#/${id}`; a.textContent = Admin.screens[id].title; a.dataset.id = id;
      nav.appendChild(a);
    }
  }

  function destroyCurrent() {
    if (Admin.current && Admin.current.destroy) { try { Admin.current.destroy(); } catch (e) { /* bỏ qua */ } }
    Admin.current = null;
  }

  // Chuyển màn hình; force=true vẽ lại ngay cả khi đang ở đúng màn hình đó.
  Admin.go = (id, force) => { if (location.hash === `#/${id}`) { if (force) route(); } else location.hash = `#/${id}`; };

  function route() {
    if (!Admin.user) return;
    const allowed = visibleScreens();
    let id = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
    if (!allowed.includes(id)) { id = allowed[0]; if (location.hash !== `#/${id}`) { location.replace(`#/${id}`); return; } }
    destroyCurrent();
    const s = Admin.screens[id];
    document.querySelectorAll('#menu a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.id === id)));
    $('screen-title').textContent = s.title; document.title = `${s.title} | Quản trị Gyu Sachi`;
    const root = $('screen'); root.textContent = '';
    Admin.current = s.render(root) || {};
    closeMenu();
  }

  function closeMenu() { $('side').classList.remove('open'); $('menu-toggle').setAttribute('aria-expanded', 'false'); }

  function enterApp() {
    $('login-view').hidden = true; $('app-view').hidden = false;
    $('u-name').textContent = Admin.user.fullName; $('u-role').textContent = Admin.user.roleName;
    renderMenu();
    if (!location.hash) location.replace('#/overview');
    route();
  }

  // ---------- Đổi mật khẩu ----------
  async function changePassword(ev) {
    ev.preventDefault();
    const oldPassword = $('pw-old').value; const newPassword = $('pw-new').value; const err = $('pw-err');
    if (!oldPassword || !newPassword) { err.textContent = 'Vui lòng nhập đủ hai mật khẩu'; return; }
    $('pw-ok').disabled = true;
    try {
      await Admin.api('POST', '/api/auth/change-password', { oldPassword, newPassword });
      $('dlg-pass').close(); Admin.toast('Đã đổi mật khẩu', true);
    } catch (e) { err.textContent = e.message; } finally { $('pw-ok').disabled = false; }
  }

  // ---------- Khởi động ----------
  Admin.start = async () => {
    $('login-form').addEventListener('submit', login);
    $('btn-logout').addEventListener('click', () => Admin.logout());
    $('btn-pass').addEventListener('click', () => { $('pw-old').value = ''; $('pw-new').value = ''; $('pw-err').textContent = ''; $('dlg-pass').showModal(); $('pw-old').focus(); });
    $('pass-form').addEventListener('submit', changePassword);
    $('pw-cancel').addEventListener('click', () => $('dlg-pass').close());
    $('menu-toggle').addEventListener('click', () => { const open = $('side').classList.toggle('open'); $('menu-toggle').setAttribute('aria-expanded', String(open)); });
    window.addEventListener('hashchange', route);
    // Cùng một tài khoản đăng xuất ở tab khác thì tab này cũng thoát.
    window.addEventListener('storage', (e) => { if (e.key === TOKEN_KEY && !e.newValue && Admin.user) Admin.logout(); });

    if (!getToken()) return showLogin();
    try { const r = await Admin.api('GET', '/api/auth/me', null, { noLogout: true }); Admin.user = r.user; enterApp(); }
    catch (e) { setToken(null); showLogin(e.status === 401 ? '' : e.message); }
  };

  window.Admin = Admin;
})();
