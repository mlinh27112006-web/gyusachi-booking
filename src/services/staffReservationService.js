const db = require('../db');
const { AppError } = require('../errors');
const { getSettings, getOpeningHours } = require('../settings');
const rules = require('./bookingRules');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const STATUSES = ['confirmed', 'completed', 'no_show', 'cancelled'];
const CHANNELS = ['website', 'hotline', 'fanpage'];

// Cột reminder_result do reminderService tạo; bảo đảm đã có trước khi truy vấn.
const ensureCols = () => require('./reminderService').ensureSchema();

const SELECT_SQL = `
  SELECT r.id, r.booking_code, r.status, r.channel, r.party_size, r.note, r.table_id,
         r.start_time, r.end_time, r.arrived_at, r.released_at, r.reminder_result,
         c.full_name AS customer_name, c.phone AS customer_phone, c.no_show_count,
         t.code AS table_code, t.floor,
         s.full_name AS created_by_name,
         to_char(r.start_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS start_local,
         to_char(r.end_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS end_local,
         to_char(r.arrived_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS arrived_local,
         to_char(r.released_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS released_local
    FROM reservations r
    JOIN customers c ON c.id = r.customer_id
    JOIN dining_tables t ON t.id = r.table_id
    LEFT JOIN staff s ON s.id = r.created_by`;

// Quy tắc đổi trạng thái (một nơi duy nhất, dùng cho cả nút hiển thị và kiểm tra khi bấm):
//   arrive    đang confirmed, chưa đến, từ (giờ hẹn - arrive_early_minutes) đến hết giờ giữ bàn
//   release   đã bấm "đã đến" (quy tắc C: phải đến rồi mới về được)
//   no_show   chưa đến và đã qua giờ hẹn
//   cancel    chưa đến
function allowedActions(row, nowMs, settings) {
  const confirmed = row.status === 'confirmed';
  const arrived = row.arrived_at != null;
  const start = new Date(row.start_time).getTime();
  const end = new Date(row.end_time).getTime();
  return {
    arrive: confirmed && !arrived && nowMs >= start - settings.arrive_early_minutes * 60000 && nowMs < end,
    release: confirmed && arrived,
    no_show: confirmed && !arrived && nowMs >= start,
    cancel: confirmed && !arrived,
    // Sửa (đổi bàn, giờ, số khách): lượt còn hiệu lực, khách chưa đến và chưa hết giờ giữ bàn.
    edit: confirmed && !arrived && nowMs < end,
  };
}

function toDto(row, nowMs, settings) {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    status: row.status,
    channel: row.channel,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    noShowCount: row.no_show_count,
    reminder: row.reminder_result || null,
    tableId: row.table_id,
    tableCode: row.table_code,
    floor: row.floor,
    partySize: row.party_size,
    note: row.note,
    start: row.start_local,
    end: row.end_local,
    arrivedAt: row.arrived_local,
    releasedAt: row.released_local,
    createdBy: row.created_by_name,
    actions: allowedActions(row, nowMs, settings),
  };
}

const MESSAGES = {
  arrive: 'Chưa thể bấm "khách đã đến": lượt đặt đã xử lý, đã bấm rồi, hoặc còn quá sớm so với giờ hẹn',
  release: 'Chỉ bấm "khách đã về" được khi đã bấm "khách đã đến"',
  no_show: 'Chỉ đánh dấu "không đến" khi khách chưa đến và đã qua giờ hẹn',
  cancel: 'Không thể hủy: lượt đặt đã xử lý hoặc khách đã đến (hãy bấm "khách đã về")',
};

// Danh sách đặt bàn theo ngày (mặc định hôm nay), lọc theo trạng thái, kênh, từ khóa.
async function list({ date, status, channel, q }) {
  await ensureCols();
  const settings = await getSettings();
  const params = [date];
  let where = `r.start_time >= ($1::date::timestamp AT TIME ZONE ${LOCAL})
               AND r.start_time < (($1::date + 1)::timestamp AT TIME ZONE ${LOCAL})`;
  if (status) { params.push(status); where += ` AND r.status = $${params.length}`; }
  if (channel) { params.push(channel); where += ` AND r.channel = $${params.length}`; }
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    where += ` AND (c.full_name ILIKE $${params.length} OR c.phone LIKE $${params.length} OR r.booking_code ILIKE $${params.length})`;
  }
  const { rows } = await db.query(`${SELECT_SQL} WHERE ${where} ORDER BY r.start_time, t.code`, params);
  const now = Date.now();
  return rows.map((r) => toDto(r, now, settings));
}

async function transition(id, action, user) {
  await ensureCols();
  const settings = await getSettings();
  return db.withTransaction(async (client) => {
    const found = await client.query(`${SELECT_SQL} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    if (found.rowCount === 0) throw new AppError(404, 'Không tìm thấy lượt đặt', 'NOT_FOUND');
    const row = found.rows[0];

    // Giờ lấy từ cơ sở dữ liệu để nhất quán với now() trong các câu UPDATE bên dưới.
    const nowMs = new Date((await client.query('SELECT now() AS n')).rows[0].n).getTime();
    if (!allowedActions(row, nowMs, settings)[action]) throw new AppError(409, MESSAGES[action], 'NOT_ALLOWED');

    if (action === 'arrive') {
      await client.query('UPDATE reservations SET arrived_at = now() WHERE id = $1', [id]);
    } else if (action === 'release') {
      // Bàn mở lại cho khách mới sau (giờ về + thời gian dọn bàn), dù khách về sớm, đúng giờ hay muộn hơn giờ giữ bàn.
      // Nếu khách ở quá giờ mà đã có lượt khác đặt ngay sau trên cùng bàn, chỉ kéo dài đến đầu lượt đó (không đè lên lượt kế tiếp).
      // Không ngắn hơn 1 phút sau giờ hẹn.
      await client.query(
        `UPDATE reservations r
            SET status = 'completed', released_at = now(),
                end_time = GREATEST(r.start_time + interval '1 minute',
                                    LEAST(now() + make_interval(mins => $2::int),
                                          COALESCE((SELECT min(o.start_time) FROM reservations o
                                                     WHERE o.table_id = r.table_id AND o.id <> r.id
                                                       AND (o.status = 'confirmed' OR o.released_at IS NOT NULL)
                                                       AND o.start_time >= r.end_time), 'infinity'::timestamptz)))
          WHERE r.id = $1`,
        [id, settings.cleanup_minutes]
      );
    } else {
      await client.query('UPDATE reservations SET status = $2 WHERE id = $1', [id, action === 'cancel' ? 'cancelled' : 'no_show']);
    }

    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', $2, 'reservation', $3, $4::jsonb)`,
      [user.id, `reservation.${action}`, String(id),
        JSON.stringify({ bookingCode: row.booking_code, table: row.table_code, from: row.status })]
    );

    const after = await client.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
    return toDto(after.rows[0], nowMs, settings);
  });
}

// Sửa lượt đặt: đổi bàn, ngày giờ, số khách (chỉ khi lượt còn chờ khách). Mọi thay đổi chạy trong MỘT giao dịch, vẫn qua
// khóa theo bàn, kiểm tra khóa mềm của khách web và ràng buộc EXCLUDE của cơ sở dữ liệu (chốt chặn cuối cùng chống trùng bàn).
async function modify(id, input, user) {
  await ensureCols();
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
  return db.withTransaction(async (client) => {
    const found = await client.query(`${SELECT_SQL} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    if (found.rowCount === 0) throw new AppError(404, 'Không tìm thấy lượt đặt', 'NOT_FOUND');
    const row = found.rows[0];
    const nowMs = new Date((await client.query('SELECT now() AS n')).rows[0].n).getTime();
    if (!allowedActions(row, nowMs, settings).edit) {
      throw new AppError(409, 'Chỉ sửa được lượt đang chờ khách (chưa đến, chưa hủy và chưa hết giờ giữ bàn)', 'NOT_ALLOWED');
    }

    const curDate = row.start_local.slice(0, 10); const curTime = row.start_local.slice(11, 16);
    const date = input.date === undefined ? curDate : input.date;
    const time = input.time === undefined ? curTime : input.time;
    const party = input.party === undefined ? row.party_size : Number(input.party);
    const tableId = input.tableId === undefined ? row.table_id : input.tableId;
    if (!rules.isValidDate(date)) throw new AppError(400, 'Ngày không hợp lệ', 'INVALID_DATE');
    if (rules.parseTime(time) === null) throw new AppError(400, 'Giờ không hợp lệ', 'INVALID_TIME');
    if (!Number.isInteger(party) || party < 1 || party > 8) throw new AppError(400, 'Số khách phải từ 1 đến 8. Nhóm đông hơn cần xử lý riêng (ghép bàn) ngoài hệ thống', 'INVALID_PARTY');

    const timeChanged = date !== curDate || time !== curTime;
    const tableChanged = tableId !== row.table_id;
    if (!timeChanged && !tableChanged && party === row.party_size) throw new AppError(400, 'Chưa có thay đổi nào để lưu', 'NO_CHANGE');

    // Giờ mới phải là giờ nhận khách hợp lệ (đúng ca, chưa qua, không trùng lịch đóng cửa). Giữ nguyên giờ thì không kiểm lại.
    const start = timeChanged ? rules.validateSlot(date, time, settings, hours) : `${date} ${time}:00+07`;

    const tb = (await client.query('SELECT id, code, capacity, is_active FROM dining_tables WHERE id = $1', [tableId])).rows[0];
    if (!tb) throw new AppError(404, 'Không tìm thấy bàn', 'NOT_FOUND');
    if (!tb.is_active) throw new AppError(409, `Bàn ${tb.code.toUpperCase()} đang tạm ngưng`, 'TABLE_UNAVAILABLE');
    if (party > tb.capacity) {
      throw new AppError(400, `Bàn ${tb.code.toUpperCase()} chỉ có ${tb.capacity} chỗ, không đủ cho ${party} khách`, 'PARTY_TOO_LARGE');
    }

    // Khóa theo từng bàn (cùng khóa với lúc tạo đặt bàn), theo thứ tự id để hai lượt sửa chéo nhau không bị kẹt.
    for (const t of [...new Set([row.table_id, tableId])].sort((a, b) => a - b)) {
      await client.query('SELECT pg_advisory_xact_lock(1001, $1::int)', [t]);
    }
    if (timeChanged || tableChanged) {
      const held = await client.query(
        `SELECT 1 FROM table_locks WHERE table_id = $3 AND expires_at > now()
            AND during && tstzrange($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), '[)')`,
        [start, settings.hold_minutes, tableId]);
      if (held.rowCount > 0) throw new AppError(409, 'Bàn này đang được khách khác giữ chỗ. Vui lòng chọn bàn khác hoặc thử lại sau ít phút', 'TABLE_HELD');
    }

    try {
      await client.query(
        `UPDATE reservations SET table_id = $2, party_size = $3,
                start_time = $4::timestamptz,
                end_time = CASE WHEN $5::boolean THEN $4::timestamptz + make_interval(mins => $6::int) ELSE end_time END
          WHERE id = $1`,
        [id, tableId, party, start, timeChanged, settings.hold_minutes]);
    } catch (err) {
      if (err.code === '23P01') throw new AppError(409, `Bàn ${tb.code.toUpperCase()} đã có khách trong khung giờ này. Vui lòng chọn bàn hoặc giờ khác`, 'TABLE_CONFLICT');
      if (err.code === '23514') throw new AppError(409, err.message, 'TABLE_UNAVAILABLE');
      throw err;
    }

    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'reservation.update', 'reservation', $2, $3::jsonb)`,
      [user.id, String(id), JSON.stringify({
        bookingCode: row.booking_code,
        from: { table: row.table_code, start: row.start_local, party: row.party_size },
        to: { table: tb.code, start: `${date} ${time}`, party },
      })]);

    const after = await client.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
    return toDto(after.rows[0], nowMs, settings);
  });
}

async function get(id) {
  await ensureCols();
  const settings = await getSettings();
  const { rows } = await db.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
  if (rows.length === 0) throw new AppError(404, 'Không tìm thấy lượt đặt', 'NOT_FOUND');
  return toDto(rows[0], Date.now(), settings);
}

module.exports = { list, get, transition, modify, allowedActions, STATUSES, CHANNELS };
