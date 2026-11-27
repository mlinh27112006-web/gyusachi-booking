const db = require('../db');

// Lấy nhân viên cùng vai trò và toàn bộ quyền của vai trò đó trong một câu truy vấn.
const SELECT_STAFF = `
  SELECT s.id, s.username, s.password_hash, s.full_name, s.is_active,
         r.code AS role_code, r.name AS role_name,
         COALESCE(
           array_agg(rp.permission_code ORDER BY rp.permission_code)
             FILTER (WHERE rp.permission_code IS NOT NULL),
           '{}') AS permissions
    FROM staff s
    JOIN roles r ON r.id = s.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id`;
const GROUP_BY = ' GROUP BY s.id, r.id';

async function findByUsername(username) {
  const { rows } = await db.query(
    `${SELECT_STAFF} WHERE lower(s.username) = lower($1)${GROUP_BY}`,
    [username]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(`${SELECT_STAFF} WHERE s.id = $1${GROUP_BY}`, [id]);
  return rows[0] || null;
}

// Dữ liệu an toàn để trả về giao diện (không có mật khẩu).
function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role_code,
    roleName: row.role_name,
    permissions: row.permissions,
  };
}

module.exports = { findByUsername, findById, toUser };
