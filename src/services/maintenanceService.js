// Quản lý bàn (tạm ngưng/mở lại) và lịch đóng cửa/bảo trì theo ngày hoặc khung giờ.
// Tự tạo bảng và quyền "table.manage" ở lần dùng đầu tiên (không cần chạy migration thủ công).
const db = require('../db');
const { AppError } = require('../errors');
const rules = require('./bookingRules');
const liveBus = require('./liveBus');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const MAX_RANGE_DAYS = 90;

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = db.query(`
      ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS maintenance_note varchar(200);
      CREATE TABLE IF NOT EXISTS closures (
        id         serial PRIMARY KEY,
        date_from  date NOT NULL,
        date_to    date NOT NULL,
        time_from  time,
        time_to    time,
        reason     varchar(200) NOT NULL,
        created_by integer REFERENCES staff(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (date_to >= date_from),
        CHECK ((time_from IS NULL) = (time_to IS NULL)),
        CHECK (time_to IS NULL OR time_to > time_from)
      );
      INSERT INTO permissions (code, description) VALUES ('table.manage', 'Quản lý bàn và lịch đóng cửa, bảo trì')
        ON CONFLICT (code) DO NOTHING;
      INSERT INTO role_permissions (role_id, permission_code)
        SELECT id, 'table.manage' FROM roles WHERE code IN ('owner', 'admin', 'manager')
        ON CONFLICT DO NOTHING;`).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ---- Bộ nhớ đệm lịch đóng cửa cho bookingRules.slotsForDate (hàm đồng bộ, dùng ở mọi kênh) ----
async function refresh() {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT to_char(date_from, 'YYYY-MM-DD') AS df, to_char(date_to, 'YYYY-MM-DD') AS dt,
            to_char(time_from, 'HH24:MI') AS tf, to_char(time_to, 'HH24:MI') AS tt, reason
       FROM closures WHERE date_to >= (now() AT TIME ZONE ${LOCAL})::date`);
  rules.setClosures(rows);
}
refresh().catch(() => {});
setInterval(() => refresh().catch(() => {}), 30000).unref();

// ---- Bàn ----
async function listTables() {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT t.id, t.code, t.floor, t.capacity, t.is_vip, t.is_active, t.maintenance_note,
            (SELECT count(*)::int FROM reservations r
              WHERE r.table_id = t.id AND r.status = 'confirmed' AND r.end_time > now()) AS upcoming
       FROM dining_tables t ORDER BY t.floor, t.code`);
  return rows.map((r) => ({
    id: r.id, code: r.code, floor: r.floor, capacity: r.capacity, isVip: r.is_vip,
    isActive: r.is_active, note: r.maintenance_note, upcoming: r.upcoming,
  }));
}

async function setTableActive(user, id, isActive, noteRaw) {
  if (typeof isActive !== 'boolean') throw new AppError(400, 'isActive phải là true hoặc false', 'INVALID_FIELD');
  const note = String(noteRaw || '').trim();
  if (!isActive && (note.length < 3 || note.length > 200)) {
    throw new AppError(400, 'Vui lòng ghi lý do tạm ngưng bàn (3 đến 200 ký tự)', 'INVALID_NOTE');
  }
  await ensureSchema();
  const out = await db.withTransaction(async (client) => {
    // Xếp hàng cùng khóa với lúc tạo đặt bàn (1001, mã bàn) để tạm ngưng bàn và đặt bàn không chạy đồng thời trên cùng một bàn.
    await client.query('SELECT pg_advisory_xact_lock(1001, $1::int)', [id]);
    const cur = (await client.query('SELECT id, code, is_active FROM dining_tables WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw new AppError(404, 'Không tìm thấy bàn', 'NOT_FOUND');
    if (cur.is_active === isActive) return { code: cur.code, changed: false };
    if (!isActive) {
      const n = (await client.query(
        `SELECT count(*)::int AS n FROM reservations WHERE table_id = $1 AND status = 'confirmed' AND end_time > now()`, [id])).rows[0].n;
      if (n > 0) {
        throw new AppError(409, `Bàn ${cur.code.toUpperCase()} còn ${n} lượt đặt chưa xử lý. Hãy hủy hoặc đổi bàn cho khách trước khi tạm ngưng`, 'HAS_UPCOMING');
      }
    }
    let releasedLocks = 0;
    if (!isActive) {
      // Khách đang giữ bàn này (chưa bấm xác nhận): nhả khóa ngay để họ nhận thông báo "bàn không còn" khi xác nhận, thay vì lỗi dữ liệu chung.
      releasedLocks = (await client.query('DELETE FROM table_locks WHERE table_id = $1', [id])).rowCount;
    }
    await client.query('UPDATE dining_tables SET is_active = $2, maintenance_note = $3 WHERE id = $1', [id, isActive, isActive ? null : note]);
    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'table.update', 'dining_table', $2, $3::jsonb)`,
      [user.id, String(id), JSON.stringify({ table: cur.code, isActive, note: isActive ? undefined : note, releasedLocks })]);
    return { code: cur.code, changed: true, releasedLocks };
  });
  liveBus.changed();
  return out;
}

// ---- Lịch đóng cửa ----
async function listClosures() {
  await ensureSchema();
  const { rows } = await db.query(
    `SELECT c.id, to_char(c.date_from, 'YYYY-MM-DD') AS df, to_char(c.date_to, 'YYYY-MM-DD') AS dt,
            to_char(c.time_from, 'HH24:MI') AS tf, to_char(c.time_to, 'HH24:MI') AS tt, c.reason, s.full_name AS by
       FROM closures c LEFT JOIN staff s ON s.id = c.created_by
      WHERE c.date_to >= (now() AT TIME ZONE ${LOCAL})::date
      ORDER BY c.date_from, c.time_from NULLS FIRST, c.id`);
  return rows.map((r) => ({ id: r.id, dateFrom: r.df, dateTo: r.dt, timeFrom: r.tf, timeTo: r.tt, reason: r.reason, createdBy: r.by }));
}

function cleanClosure(b) {
  const today = rules.vnNow().date;
  const dateFrom = b.dateFrom; const dateTo = b.dateTo || b.dateFrom;
  if (!rules.isValidDate(dateFrom) || !rules.isValidDate(dateTo)) throw new AppError(400, 'Ngày không hợp lệ', 'INVALID_DATE');
  if (dateFrom < today) throw new AppError(400, 'Không thể đặt lịch đóng cửa cho ngày đã qua', 'DATE_IN_PAST');
  if (dateTo < dateFrom) throw new AppError(400, 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu', 'INVALID_RANGE');
  if (rules.addDays(dateFrom, MAX_RANGE_DAYS - 1) < dateTo) throw new AppError(400, `Mỗi lịch đóng cửa tối đa ${MAX_RANGE_DAYS} ngày`, 'RANGE_TOO_LONG');
  let timeFrom = null; let timeTo = null;
  if (b.timeFrom || b.timeTo) {
    const a = rules.parseTime(b.timeFrom); const z = rules.parseTime(b.timeTo);
    if (a === null || z === null || z <= a) throw new AppError(400, 'Khung giờ không hợp lệ (giờ kết thúc phải sau giờ bắt đầu)', 'INVALID_TIME');
    timeFrom = b.timeFrom; timeTo = b.timeTo;
  }
  const reason = String(b.reason || '').trim().replace(/\s+/g, ' ');
  if (reason.length < 3 || reason.length > 200) throw new AppError(400, 'Vui lòng ghi lý do (3 đến 200 ký tự)', 'INVALID_REASON');
  return { dateFrom, dateTo, timeFrom, timeTo, reason };
}

async function createClosure(user, input) {
  const v = cleanClosure(input);
  await ensureSchema();
  const out = await db.withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO closures (date_from, date_to, time_from, time_to, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [v.dateFrom, v.dateTo, v.timeFrom, v.timeTo, v.reason, user.id]);
    const id = ins.rows[0].id;
    // Lượt đã đặt trong thời gian đóng cửa không tự hủy: báo số lượng để nhân viên liên hệ khách.
    // Tính theo GIAO NHAU của [giờ hẹn, giờ hết giữ bàn) với từng khung đóng cửa của từng ngày (kể cả lượt bắt đầu trước giờ đóng cửa nhưng kéo dài vào trong).
    const conflicts = (await client.query(
      `SELECT count(*)::int AS n FROM reservations r
        WHERE r.status = 'confirmed'
          AND EXISTS (
            SELECT 1 FROM generate_series($1::date, $2::date, interval '1 day') AS g(d)
             WHERE tstzrange(r.start_time, r.end_time, '[)') &&
                   tstzrange((g.d::date + COALESCE($3::time, time '00:00'))::timestamp AT TIME ZONE ${LOCAL},
                             CASE WHEN $4::time IS NULL THEN ((g.d::date + 1)::timestamp AT TIME ZONE ${LOCAL})
                                  ELSE (g.d::date + $4::time)::timestamp AT TIME ZONE ${LOCAL} END, '[)'))`,
      [v.dateFrom, v.dateTo, v.timeFrom, v.timeTo])).rows[0].n;
    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'closure.create', 'closure', $2, $3::jsonb)`, [user.id, String(id), JSON.stringify({ ...v, conflicts })]);
    return { id, conflicts };
  });
  await refresh();
  liveBus.changed();
  return out;
}

async function deleteClosure(user, id) {
  await ensureSchema();
  await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `DELETE FROM closures WHERE id = $1
       RETURNING to_char(date_from, 'YYYY-MM-DD') AS df, to_char(date_to, 'YYYY-MM-DD') AS dt, reason`, [id]);
    if (rows.length === 0) throw new AppError(404, 'Không tìm thấy lịch đóng cửa', 'NOT_FOUND');
    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'closure.delete', 'closure', $2, $3::jsonb)`, [user.id, String(id), JSON.stringify(rows[0])]);
  });
  await refresh();
  liveBus.changed();
}

module.exports = { ensureSchema, refresh, listTables, setTableActive, listClosures, createClosure, deleteClosure };
