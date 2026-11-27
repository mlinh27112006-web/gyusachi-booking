const db = require('../db');
const { AppError } = require('../errors');
const { getSettings } = require('../settings');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const STATUSES = ['confirmed', 'completed', 'no_show', 'cancelled'];
const CHANNELS = ['website', 'hotline', 'fanpage'];

const SELECT_SQL = `
  SELECT r.id, r.booking_code, r.status, r.channel, r.party_size, r.note,
         r.start_time, r.end_time, r.arrived_at, r.released_at,
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
      // Bàn mở lại cho khách mới sau (giờ về + thời gian dọn bàn). Không ngắn hơn 1 phút sau giờ hẹn.
      await client.query(
        `UPDATE reservations
            SET status = 'completed', released_at = now(),
                end_time = GREATEST(start_time + interval '1 minute',
                                    LEAST(end_time, now() + make_interval(mins => $2::int)))
          WHERE id = $1`,
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

async function get(id) {
  const settings = await getSettings();
  const { rows } = await db.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
  if (rows.length === 0) throw new AppError(404, 'Không tìm thấy lượt đặt', 'NOT_FOUND');
  return toDto(rows[0], Date.now(), settings);
}

module.exports = { list, get, transition, allowedActions, STATUSES, CHANNELS };
