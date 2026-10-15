const bcrypt = require('bcryptjs');
const db = require('../db');
const { AppError } = require('../errors');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const BCRYPT_ROUNDS = 10;

// ---- Kiểm tra dữ liệu nhập ----
function validateUsername(raw) {
  const u = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw new AppError(400, 'Tên đăng nhập gồm 3-30 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang', 'INVALID_USERNAME');
  }
  return u;
}

function validatePassword(raw) {
  const p = String(raw || '');
  if (p.length < 8 || p.length > 72 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) {
    throw new AppError(400, 'Mật khẩu cần từ 8 đến 72 ký tự, gồm cả chữ và số', 'WEAK_PASSWORD');
  }
  return p;
}

function validateFullName(raw) {
  const n = String(raw || '').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 100) throw new AppError(400, 'Họ tên từ 2 đến 100 ký tự', 'INVALID_NAME');
  return n;
}

// ---- Quy tắc phân quyền theo vai trò đích ----
// owner: không ai sửa được qua API. admin: chỉ người có quyền staff.create_admin (owner).
function assertCanManageRole(actor, roleCode) {
  if (roleCode === 'owner') throw new AppError(403, 'Không thể thay đổi tài khoản chủ nhà hàng (owner)', 'FORBIDDEN');
  if (roleCode === 'admin' && !actor.permissions.includes('staff.create_admin')) {
    throw new AppError(403, 'Chỉ chủ nhà hàng mới được quản lý tài khoản quản trị viên', 'FORBIDDEN');
  }
}

const SELECT_MEMBER = `
  SELECT s.id, s.username, s.full_name, s.is_active, r.code AS role_code, r.name AS role_name,
         to_char(s.created_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS created_local,
         c.full_name AS created_by_name
    FROM staff s
    JOIN roles r ON r.id = s.role_id
    LEFT JOIN staff c ON c.id = s.created_by`;

const toMember = (r) => ({
  id: r.id, username: r.username, fullName: r.full_name, role: r.role_code, roleName: r.role_name,
  isActive: r.is_active, createdAt: r.created_local, createdBy: r.created_by_name,
});

async function roleByCode(client, code) {
  const { rows } = await client.query('SELECT id, code, name FROM roles WHERE code = $1', [String(code || '')]);
  if (rows.length === 0) throw new AppError(400, 'Vai trò không hợp lệ', 'INVALID_ROLE');
  return rows[0];
}

async function audit(client, actor, action, targetId, detail) {
  await client.query(
    `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
     VALUES ($1, 'staff', $2, 'staff', $3, $4::jsonb)`,
    [actor.id, action, String(targetId), JSON.stringify(detail)]
  );
}

// ---- Danh sách ----
async function listMembers() {
  const { rows } = await db.query(`${SELECT_MEMBER} ORDER BY r.id, s.username`);
  return rows.map(toMember);
}

// Chỉ trả vai trò mà người thao tác được phép gán.
async function listRoles(actor) {
  const { rows } = await db.query('SELECT code, name FROM roles ORDER BY id');
  return rows.filter((r) => r.code !== 'owner' && (r.code !== 'admin' || actor.permissions.includes('staff.create_admin')));
}

// ---- Tạo tài khoản ----
async function createMember(actor, input) {
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);
  const fullName = validateFullName(input.fullName);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  return db.withTransaction(async (client) => {
    const role = await roleByCode(client, input.role);
    assertCanManageRole(actor, role.code);
    let id;
    try {
      const ins = await client.query(
        `INSERT INTO staff (username, password_hash, full_name, role_id, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [username, hash, fullName, role.id, actor.id]
      );
      id = ins.rows[0].id;
    } catch (err) {
      if (err.code === '23505') throw new AppError(409, 'Tên đăng nhập này đã được dùng', 'USERNAME_TAKEN');
      throw err;
    }
    await audit(client, actor, 'staff.create', id, { username, role: role.code });
    return toMember((await client.query(`${SELECT_MEMBER} WHERE s.id = $1`, [id])).rows[0]);
  });
}

// ---- Sửa họ tên, vai trò, khóa/mở khóa ----
async function updateMember(actor, id, input) {
  return db.withTransaction(async (client) => {
    const cur = (await client.query(`${SELECT_MEMBER} WHERE s.id = $1 FOR UPDATE OF s`, [id])).rows[0];
    if (!cur) throw new AppError(404, 'Không tìm thấy nhân viên', 'NOT_FOUND');
    const self = cur.id === actor.id;

    const changes = {};
    if (input.fullName !== undefined) changes.full_name = validateFullName(input.fullName);
    if (input.role !== undefined && input.role !== cur.role_code) changes.role = input.role;
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') throw new AppError(400, 'isActive phải là true hoặc false', 'INVALID_FIELD');
      if (input.isActive !== cur.is_active) changes.is_active = input.isActive;
    }
    if (Object.keys(changes).length === 0) return toMember(cur);

    if (self && ('role' in changes || 'is_active' in changes)) {
      throw new AppError(400, 'Bạn không thể tự đổi vai trò hoặc tự khóa tài khoản của mình', 'SELF_CHANGE');
    }
    if (!self) assertCanManageRole(actor, cur.role_code);

    const sets = []; const params = []; const detail = {};
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if ('full_name' in changes) { add('full_name', changes.full_name); detail.fullName = changes.full_name; }
    if ('role' in changes) {
      const role = await roleByCode(client, changes.role);
      assertCanManageRole(actor, role.code);
      add('role_id', role.id); detail.role = { from: cur.role_code, to: role.code };
    }
    if ('is_active' in changes) { add('is_active', changes.is_active); detail.isActive = changes.is_active; }

    params.push(id);
    await client.query(`UPDATE staff SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await audit(client, actor, 'staff.update', id, { username: cur.username, ...detail });
    return toMember((await client.query(`${SELECT_MEMBER} WHERE s.id = $1`, [id])).rows[0]);
  });
}

// ---- Đặt lại mật khẩu cho người khác ----
async function resetPassword(actor, id, newPassword) {
  const password = validatePassword(newPassword);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return db.withTransaction(async (client) => {
    const cur = (await client.query(`${SELECT_MEMBER} WHERE s.id = $1 FOR UPDATE OF s`, [id])).rows[0];
    if (!cur) throw new AppError(404, 'Không tìm thấy nhân viên', 'NOT_FOUND');
    if (cur.id === actor.id) throw new AppError(400, 'Hãy dùng chức năng đổi mật khẩu của chính bạn', 'SELF_CHANGE');
    assertCanManageRole(actor, cur.role_code);
    await client.query('UPDATE staff SET password_hash = $1 WHERE id = $2', [hash, id]);
    await audit(client, actor, 'staff.reset_password', id, { username: cur.username });
  });
}

// ---- Tự đổi mật khẩu ----
async function changeOwnPassword(actor, oldPassword, newPassword) {
  const password = validatePassword(newPassword);
  const { rows } = await db.query('SELECT password_hash FROM staff WHERE id = $1', [actor.id]);
  const ok = rows.length > 0 && await bcrypt.compare(String(oldPassword || ''), rows[0].password_hash);
  if (!ok) throw new AppError(400, 'Mật khẩu hiện tại không đúng', 'BAD_OLD_PASSWORD');
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.withTransaction(async (client) => {
    await client.query('UPDATE staff SET password_hash = $1 WHERE id = $2', [hash, actor.id]);
    await audit(client, actor, 'staff.change_password', actor.id, { username: actor.username });
  });
}

// ---- Nhật ký thao tác ----
// Lọc: from/to (ngày YYYY-MM-DD, giờ Việt Nam), action (khớp đầu chuỗi, ví dụ "reservation"), staffId, q (mã hoặc id đối tượng).
async function listAudit({ from, to, action, staffId, q, limit, offset }) {
  const params = []; const conds = [];
  const add = (sql, val) => { params.push(val); conds.push(sql.replace('?', `$${params.length}`)); };
  if (from) add(`a.created_at >= (?::date::timestamp AT TIME ZONE ${LOCAL})`, from);
  if (to) add(`a.created_at < ((?::date + 1)::timestamp AT TIME ZONE ${LOCAL})`, to);
  if (action) add('a.action LIKE ?', `${action.replace(/[%_\\]/g, '\\$&')}%`);
  if (staffId) add('a.staff_id = ?', staffId);
  if (q) {
    params.push(q);
    const i = params.length;
    conds.push(`(a.entity_id = $${i}::text OR a.detail::text ILIKE '%' || $${i}::text || '%')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const total = (await db.query(`SELECT count(*)::int AS n FROM audit_logs a ${where}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.actor_label,
            to_char(a.created_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI:SS') AS at_local,
            s.full_name AS staff_name, s.username
       FROM audit_logs a LEFT JOIN staff s ON s.id = a.staff_id
       ${where}
      ORDER BY a.id DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return {
    total,
    items: rows.map((r) => ({
      id: r.id, at: r.at_local, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
      actor: r.staff_name ? `${r.staff_name} (${r.username})` : (r.actor_label === 'customer' ? 'Khách hàng' : 'Hệ thống'),
      detail: r.detail,
    })),
  };
}

module.exports = {
  listMembers, listRoles, createMember, updateMember, resetPassword, changeOwnPassword, listAudit,
  validateUsername, validatePassword,
};
