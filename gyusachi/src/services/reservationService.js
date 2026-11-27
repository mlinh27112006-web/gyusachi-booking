const crypto = require('crypto');
const db = require('../db');
const { AppError } = require('../errors');
const tableService = require('./tableService');

const RANGE = "tstzrange($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), '[)')";
const LOCAL = "'Asia/Ho_Chi_Minh'";

const DETAIL_SQL = `
  SELECT r.id, r.booking_code, r.status, r.channel, r.party_size, r.note, r.arrived_at,
         t.code AS table_code, t.floor, c.full_name AS customer_name,
         to_char(r.start_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS start_local,
         to_char(r.end_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS end_local
    FROM reservations r
    JOIN dining_tables t ON t.id = r.table_id
    JOIN customers c ON c.id = r.customer_id`;

function toDto(row) {
  return {
    bookingCode: row.booking_code,
    status: row.status,
    channel: row.channel,
    partySize: row.party_size,
    note: row.note,
    tableCode: row.table_code,
    floor: row.floor,
    customerName: row.customer_name,
    start: row.start_local,
    end: row.end_local,
    // Khách chỉ tự hủy được khi lượt còn hiệu lực và nhân viên chưa ghi nhận khách đã đến.
    canCancel: row.status === 'confirmed' && row.arrived_at == null,
  };
}

const randomCode = () => `GYU-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;

// Tạo đặt bàn. Dùng chung cho cả ba kênh:
//   source 'website'  khách tự đặt, bắt buộc có khóa mềm còn hạn và bàn phải đúng nhóm theo số khách
//   source 'staff'    nhân viên nhập hộ (hotline, fanpage), được chọn mọi bàn trống đủ chỗ
// Gộp khách hàng, đặt bàn, log kênh, nhật ký vào MỘT giao dịch: lỗi ở bước nào cũng rollback hết.
async function create(input) {
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await db.withTransaction((client) => createInTransaction(client, input));
      } catch (err) {
        // Trùng mã đặt bàn (hiếm): thử lại với mã khác.
        if (err.code === '23505' && err.constraint === 'reservations_booking_code_key') continue;
        throw err;
      }
    }
    throw new AppError(500, 'Không tạo được mã đặt bàn, vui lòng thử lại', 'CODE_FAILED');
  } finally {
    // Nhả khóa mềm ngay sau khi xử lý xong, thành công hay thất bại.
    if (input.lockToken) await tableService.releaseLock(input.lockToken).catch(() => {});
  }
}

async function createInTransaction(client, input) {
  const { source, channel, tableId, party, start, holdMinutes, note, lockToken, customer, staffUser, rawRequest, externalUserId } = input;

  // Xếp hàng theo từng bàn: các lượt đặt cùng bàn được xử lý lần lượt, tránh deadlock
  // khi nhiều người chèn cùng lúc (bàn khác nhau vẫn chạy song song).
  await client.query('SELECT pg_advisory_xact_lock(1001, $1::int)', [tableId]);

  if (source === 'website') {
    const lock = await client.query(
      `SELECT 1 FROM table_locks
        WHERE lock_token = $3::uuid AND table_id = $4 AND expires_at > now()
          AND during = ${RANGE}
          FOR UPDATE`,
      [start, holdMinutes, lockToken, tableId]
    );
    if (lock.rowCount === 0) {
      throw new AppError(410, 'Hết thời gian giữ bàn. Vui lòng chọn lại bàn', 'LOCK_EXPIRED');
    }
    // Số khách có thể đã đổi sau khi giữ bàn: kiểm tra lại bàn còn đúng nhóm.
    const ok = await client.query(
      `SELECT 1 FROM available_tables($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), $3::smallint, $4::uuid)
        WHERE id = $5`,
      [start, holdMinutes, party, lockToken, tableId]
    );
    if (ok.rowCount === 0) {
      throw new AppError(409, 'Bàn này không phù hợp với số khách. Vui lòng chọn lại bàn', 'TABLE_UNAVAILABLE');
    }
  } else {
    const held = await client.query(
      `SELECT 1 FROM table_locks WHERE table_id = $3 AND expires_at > now() AND during && ${RANGE}`,
      [start, holdMinutes, tableId]
    );
    if (held.rowCount > 0) {
      throw new AppError(409, 'Bàn này đang được khách khác giữ chỗ. Vui lòng chọn bàn khác hoặc thử lại sau ít phút', 'TABLE_HELD');
    }
  }

  // Tạo mới hoặc dùng lại hồ sơ khách theo số điện thoại (giữ nguyên tên cũ nếu đã có).
  const cust = await client.query(
    `INSERT INTO customers (full_name, phone) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET full_name = customers.full_name
     RETURNING id`,
    [customer.name, customer.phone]
  );

  // Ràng buộc EXCLUDE trong cơ sở dữ liệu là chốt chặn cuối cùng chống trùng bàn.
  const inserted = await client.query(
    `INSERT INTO reservations
       (booking_code, customer_id, table_id, party_size, start_time, end_time, channel, note, created_by)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz + make_interval(mins => $6::int), $7, $8, $9)
     RETURNING id`,
    [randomCode(), cust.rows[0].id, tableId, party, start, holdMinutes, channel, note, staffUser ? staffUser.id : null]
  );
  const reservationId = inserted.rows[0].id;

  await client.query(
    `INSERT INTO channel_logs (reservation_id, channel, direction, external_user_id, raw_payload)
     VALUES ($1, $2, 'in', $3, $4::jsonb)`,
    [reservationId, channel, externalUserId || null, JSON.stringify(rawRequest)]
  );
  await client.query(
    `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
     VALUES ($1, $2, 'reservation.create', 'reservation', $3, $4::jsonb)`,
    [staffUser ? staffUser.id : null, staffUser ? 'staff' : 'customer', String(reservationId),
      JSON.stringify({ channel, tableId, party, start })]
  );

  if (lockToken) await client.query('DELETE FROM table_locks WHERE lock_token = $1::uuid', [lockToken]);

  const detail = await client.query(`${DETAIL_SQL} WHERE r.id = $1`, [reservationId]);
  return toDto(detail.rows[0]);
}

// Khách tra cứu bằng số điện thoại và mã đặt bàn.
async function lookup(phone, code) {
  const { rows } = await db.query(`${DETAIL_SQL} WHERE r.booking_code = $1 AND c.phone = $2`, [code, phone]);
  if (rows.length === 0) {
    throw new AppError(404, 'Không tìm thấy lượt đặt. Vui lòng kiểm tra lại số điện thoại và mã đặt bàn', 'NOT_FOUND');
  }
  return toDto(rows[0]);
}

// Khách tự hủy (không giới hạn thời gian). Chỉ hủy được lượt còn ở trạng thái confirmed.
async function cancelByCustomer(phone, code) {
  return db.withTransaction(async (client) => {
    const found = await client.query(
      `SELECT r.id, r.status, r.arrived_at FROM reservations r
         JOIN customers c ON c.id = r.customer_id
        WHERE r.booking_code = $1 AND c.phone = $2
          FOR UPDATE OF r`,
      [code, phone]
    );
    if (found.rowCount === 0) {
      throw new AppError(404, 'Không tìm thấy lượt đặt. Vui lòng kiểm tra lại số điện thoại và mã đặt bàn', 'NOT_FOUND');
    }
    const { id, status, arrived_at: arrivedAt } = found.rows[0];
    if (status !== 'confirmed' || arrivedAt != null) {
      throw new AppError(409, 'Lượt đặt này đã được xử lý nên không thể hủy', 'NOT_CANCELLABLE');
    }
    await client.query(`UPDATE reservations SET status = 'cancelled' WHERE id = $1`, [id]);
    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES (NULL, 'customer', 'reservation.status', 'reservation', $1, $2::jsonb)`,
      [String(id), JSON.stringify({ from: 'confirmed', to: 'cancelled' })]
    );
    const detail = await client.query(`${DETAIL_SQL} WHERE r.id = $1`, [id]);
    return toDto(detail.rows[0]);
  });
}

module.exports = { create, lookup, cancelByCustomer };
