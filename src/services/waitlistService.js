const db = require('../db');
const { AppError } = require('../errors');
const { getSettings } = require('../settings');
const tableService = require('./tableService');
const liveBus = require('./liveBus');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const NOTICE_MINUTES = 10;   // khách có 10 phút để trả lời "ok" giữ bàn
const MAX_ACTIVE_PER_PHONE = 3;
const SIGN = 'Gyu Sachi Yakiniku xin cảm ơn.';
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const SELECT = `SELECT id, customer_name, phone, party_size, channel, external_user_id, status, note, notify_result, booking_code,
       start_time, notified_at, notify_expires_at, created_at,
       to_char(start_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD') AS date_local,
       to_char(start_time AT TIME ZONE ${LOCAL}, 'HH24:MI') AS time_local
  FROM waitlist`;

function toDto(r) {
  return {
    id: r.id, name: r.customer_name, phone: r.phone, party: r.party_size, channel: r.channel,
    status: r.status, note: r.note, result: r.notify_result, bookingCode: r.booking_code,
    date: r.date_local, time: r.time_local,
    notifiedAt: r.notified_at, expiresAt: r.notify_expires_at, createdAt: r.created_at,
    canMessage: r.channel === 'fanpage' && !!r.external_user_id,
  };
}

// "Thứ Sáu 23/10" từ chuỗi YYYY-MM-DD (tự tính thứ để không phụ thuộc múi giờ máy chủ).
function fmtDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]} ${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// Ghi tên chờ. Cùng số điện thoại và cùng giờ đang chờ thì trả lại lượt cũ, không tạo thêm.
async function join({ name, phone, party, start, channel, externalUserId = null, staffId = null, note = null }) {
  const dup = await db.query(
    `${SELECT} WHERE phone = $1 AND start_time = $2::timestamptz AND status IN ('waiting', 'notified') LIMIT 1`, [phone, start]);
  if (dup.rowCount) return { entry: toDto(dup.rows[0]), existed: true };
  const cnt = await db.query(
    "SELECT count(*)::int AS n FROM waitlist WHERE phone = $1 AND status IN ('waiting', 'notified')", [phone]);
  if (cnt.rows[0].n >= MAX_ACTIVE_PER_PHONE) {
    throw new AppError(409, `Mỗi số điện thoại chỉ ghi tối đa ${MAX_ACTIVE_PER_PHONE} lượt chờ cùng lúc`, 'WAITLIST_LIMIT');
  }
  const ins = await db.query(
    `INSERT INTO waitlist (customer_name, phone, party_size, start_time, channel, external_user_id, created_by, note)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8) RETURNING id`,
    [name, phone, party, start, channel, externalUserId, staffId, note]);
  const row = await db.query(`${SELECT} WHERE id = $1`, [ins.rows[0].id]);
  liveBus.changed();
  setTimeout(() => check().catch(() => {}), 300); // có thể đang có bàn trống sẵn
  return { entry: toDto(row.rows[0]), existed: false };
}

// Danh sách cho nhân viên: lượt đang chờ/đã báo, cộng các lượt vừa đóng trong 24 giờ gần đây.
async function list() {
  const { rows } = await db.query(
    `${SELECT}
      WHERE (status IN ('waiting', 'notified') AND start_time > now() - interval '2 hours')
         OR (status IN ('booked', 'expired', 'cancelled') AND created_at > now() - interval '24 hours')
      ORDER BY (status IN ('waiting', 'notified')) DESC, start_time, created_at`);
  return rows.map(toDto);
}

async function staffAction(id, action, user) {
  const found = await db.query(`${SELECT} WHERE id = $1`, [id]);
  if (!found.rowCount) throw new AppError(404, 'Không tìm thấy lượt chờ', 'NOT_FOUND');
  const row = found.rows[0];
  if (!['waiting', 'notified'].includes(row.status)) throw new AppError(409, 'Lượt chờ này đã đóng', 'NOT_ALLOWED');
  if (action === 'cancel') {
    await db.query("UPDATE waitlist SET status = 'cancelled' WHERE id = $1", [id]);
  } else if (action === 'contacted') {
    // Nhân viên đã gọi khách: gia hạn thêm thời gian giữ chỗ cho khách.
    await db.query(
      `UPDATE waitlist SET status = 'notified', notified_at = COALESCE(notified_at, now()),
              notify_expires_at = now() + make_interval(mins => $2::int), notify_result = 'Nhân viên đã gọi khách'
        WHERE id = $1`, [id, NOTICE_MINUTES]);
  } else {
    throw new AppError(404, 'Thao tác không tồn tại', 'NOT_FOUND');
  }
  await db.query(
    `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
     VALUES ($1, 'staff', $2, 'waitlist', $3, $4::jsonb)`,
    [user.id, `waitlist.${action}`, String(id), JSON.stringify({ phone: row.phone, party: row.party_size })]);
  liveBus.changed();
  const after = await db.query(`${SELECT} WHERE id = $1`, [id]);
  return toDto(after.rows[0]);
}

// Lượt chờ đã được báo của một người nhắn Messenger/web (để bot hiểu "ok" là đồng ý giữ bàn).
async function activeNoticeFor(externalUserId) {
  if (!externalUserId) return null;
  const { rows } = await db.query(
    `${SELECT} WHERE external_user_id = $1 AND status = 'notified' AND notify_expires_at > now()
      ORDER BY notified_at DESC LIMIT 1`, [externalUserId]);
  return rows[0] ? toDto(rows[0]) : null;
}

async function markBooked(id, bookingCode) {
  await db.query("UPDATE waitlist SET status = 'booked', booking_code = $2 WHERE id = $1", [id, bookingCode]);
  liveBus.changed();
}
async function markCancelled(id) {
  await db.query("UPDATE waitlist SET status = 'cancelled' WHERE id = $1 AND status IN ('waiting', 'notified')", [id]);
  liveBus.changed();
  setTimeout(() => check().catch(() => {}), 200); // nhường bàn cho người chờ kế tiếp
}

let running = false;
// Kiểm tra toàn bộ lượt chờ; gọi sau mỗi thay đổi đặt bàn và định kỳ 60 giây.
async function check() {
  if (running) return;
  running = true;
  let changed = false;
  try {
    const settings = await getSettings();
    // 1. Lượt quá giờ hẹn, hoặc đã báo mà khách không trả lời kịp: đóng lại.
    const ex = await db.query(
      `UPDATE waitlist SET status = 'expired'
        WHERE (status IN ('waiting', 'notified') AND start_time < now())
           OR (status = 'notified' AND notify_expires_at < now())
        RETURNING id`);
    if (ex.rowCount) changed = true;
    // 2. Khách đã có đặt bàn đúng giờ (do nhân viên tạo hộ hay tự đặt): đánh dấu đã đặt.
    const bk = await db.query(
      `UPDATE waitlist w SET status = 'booked', booking_code = r.booking_code
         FROM reservations r JOIN customers c ON c.id = r.customer_id
        WHERE w.status IN ('waiting', 'notified') AND c.phone = w.phone AND r.start_time = w.start_time
          AND r.status = 'confirmed'
        RETURNING w.id`);
    if (bk.rowCount) changed = true;
    // 3. Theo thứ tự đăng ký: còn bàn trống cho khung giờ thì báo khách. Số bàn trống phải lớn hơn
    //    số khách đã được báo cùng giờ (đang giữ chỗ), để không báo trùng một bàn cho nhiều người.
    const waiting = await db.query(
      `${SELECT} WHERE status = 'waiting' AND start_time > now() ORDER BY created_at, id`);
    for (const row of waiting.rows) {
      const avail = await tableService.countAvailable({ start: row.start_time, holdMinutes: settings.hold_minutes, party: row.party_size });
      const held = await db.query(
        "SELECT count(*)::int AS n FROM waitlist WHERE status = 'notified' AND start_time = $1::timestamptz AND notify_expires_at > now()",
        [row.start_time]);
      if (avail <= held.rows[0].n) continue;
      const claim = await db.query(
        `UPDATE waitlist SET status = 'notified', notified_at = now(), notify_expires_at = now() + make_interval(mins => $2::int)
          WHERE id = $1 AND status = 'waiting' RETURNING id`, [row.id, NOTICE_MINUTES]);
      if (!claim.rowCount) continue;
      changed = true;
      let result = 'Cần nhân viên gọi khách';
      if (row.channel === 'fanpage' && row.external_user_id) {
        const fb = require('./facebookService'); // nạp muộn để tránh vòng lặp require với botService
        const text = `Dạ Gyu Sachi xin thông báo: vừa có bàn trống cho ${row.party_size} khách, ${fmtDate(row.date_local)} lúc ${row.time_local} ạ.\n` +
          `Anh/chị nhắn "ok" trong ${NOTICE_MINUTES} phút để em giữ bàn ngay nhé, hoặc nhắn "không" nếu không cần nữa ạ.\n${SIGN}`;
        const r = await fb.sendToFacebook(row.external_user_id, text);
        result = r.ok ? 'Bot đã nhắn Messenger cho khách' : `Không nhắn được Messenger (${r.reason}), cần gọi khách`;
      }
      await db.query('UPDATE waitlist SET notify_result = $2 WHERE id = $1', [row.id, result.slice(0, 200)]);
    }
  } finally {
    running = false;
    if (changed) liveBus.changed();
  }
}

module.exports = { join, list, staffAction, activeNoticeFor, markBooked, markCancelled, check, fmtDate, NOTICE_MINUTES };
