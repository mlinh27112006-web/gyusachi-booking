// Xác nhận và nhắc lịch qua Messenger cho khách đặt bằng fanpage.
// Lưu ý của Facebook: chỉ gửi được trong 24 giờ kể từ tin nhắn cuối của khách. Nếu quá hạn, lượt đặt được
// đánh dấu "cần gọi nhắc" để nhân viên gọi điện (hiện ở danh sách đặt bàn).
const db = require('../db');
const { getSettings } = require('../settings');
const fb = require('./facebookService');

// Số phút nhắc trước giờ hẹn: số nguyên từ 15 đến 1440; sai định dạng thì dùng 120 và ghi cảnh báo.
function parseRemindMinutes(raw) {
  if (raw === undefined || raw === '') return 120;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 15 && n <= 1440) return n;
  console.warn(`REMIND_BEFORE_MIN="${raw}" không hợp lệ (cần số nguyên 15-1440), dùng mặc định 120 phút.`);
  return 120;
}
const REMIND_BEFORE_MIN = parseRemindMinutes(process.env.REMIND_BEFORE_MIN);
const LOCAL = "'Asia/Ho_Chi_Minh'";

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = db.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_result varchar(200);
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const fmt = (r, hotline) => `${r.name}, ${r.start_local.slice(11)} ngày ${r.start_local.slice(8, 10)}/${r.start_local.slice(5, 7)}, bàn ${String(r.table_code).toUpperCase()} (tầng ${r.floor}), ${r.party_size} khách`;

function confirmText(r, hotline) {
  return `Dạ Gyu Sachi Yakiniku xác nhận đặt bàn của anh/chị ${fmt(r)}. Mã đặt bàn: ${r.booking_code}. Cần đổi hoặc hủy, anh/chị nhắn lại hoặc gọi hotline ${hotline} ạ. Gyu Sachi Yakiniku xin cảm ơn.`;
}
function remindText(r, hotline) {
  return `Dạ Gyu Sachi Yakiniku nhắc anh/chị: ${fmt(r)} sẽ diễn ra sắp tới. Mã đặt bàn: ${r.booking_code}. Nhà hàng giữ bàn tối đa 30 phút sau giờ hẹn. Nếu không đến được, anh/chị vui lòng nhắn lại hoặc gọi hotline ${hotline} ạ. Gyu Sachi Yakiniku xin cảm ơn.`;
}

const ROW_SQL = `
  SELECT r.id, r.booking_code, r.party_size, c.full_name AS name, t.code AS table_code, t.floor,
         to_char(r.start_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS start_local,
         (SELECT l.external_user_id FROM channel_logs l
           WHERE l.reservation_id = r.id AND l.direction = 'in' AND l.external_user_id IS NOT NULL
           ORDER BY l.id LIMIT 1) AS psid
    FROM reservations r
    JOIN customers c ON c.id = r.customer_id
    JOIN dining_tables t ON t.id = r.table_id`;

async function logOut(r, text, result) {
  await db.query(
    `INSERT INTO channel_logs (reservation_id, channel, direction, external_user_id, message_text, raw_payload)
     VALUES ($1, 'fanpage', 'out', $2, $3, $4::jsonb)`,
    [r.id, r.psid, text, JSON.stringify({ kind: 'reminder', ok: result.ok, reason: result.reason || null })]);
}

// Nhắc những lượt fanpage sắp tới giờ. Mỗi lượt được "nhận" bằng một câu UPDATE nên không bao giờ gửi hai lần.
async function check() {
  await ensureSchema();
  const s = await getSettings();
  // Lượt đã bị "nhận" nhưng máy chủ tắt giữa chừng nên chưa có kết quả gửi (quá 5 phút): nhả ra để thử gửi lại.
  await db.query(
    `UPDATE reservations SET reminded_at = NULL
      WHERE reminded_at < now() - interval '5 minutes' AND reminder_result IS NULL
        AND status = 'confirmed' AND arrived_at IS NULL AND start_time > now()`);
  const claimed = await db.query(
    `UPDATE reservations r SET reminded_at = now()
      WHERE r.id IN (
        SELECT r2.id FROM reservations r2
         WHERE r2.status = 'confirmed' AND r2.arrived_at IS NULL AND r2.reminded_at IS NULL AND r2.channel = 'fanpage'
           AND r2.start_time > now() AND r2.start_time <= now() + make_interval(mins => $1::int)
           AND r2.created_at <= r2.start_time - make_interval(mins => $1::int)
         FOR UPDATE SKIP LOCKED)
      RETURNING r.id`, [REMIND_BEFORE_MIN]);
  for (const { id } of claimed.rows) {
    const r = (await db.query(`${ROW_SQL} WHERE r.id = $1`, [id])).rows[0];
    let result;
    if (!r.psid) result = { ok: false, reason: 'Không có mã Messenger của khách' };
    else if (!fb.isConnected()) result = { ok: false, reason: 'Chưa nối Facebook' };
    else result = await fb.sendToFacebook(r.psid, remindText(r, s.hotline));
    await db.query('UPDATE reservations SET reminder_result = $2 WHERE id = $1',
      [id, result.ok ? 'Đã nhắc qua Messenger' : `Cần gọi nhắc: ${String(result.reason).slice(0, 150)}`]);
    if (r.psid) await logOut(r, remindText(r, s.hotline), result).catch(() => {});
  }
  return claimed.rowCount;
}

// Xác nhận qua Messenger cho lượt do nhân viên tạo hộ khách fanpage (bot tự xác nhận ngay trong cuộc trò chuyện).
async function sendConfirmation(bookingCode) {
  try {
    const s = await getSettings();
    const r = (await db.query(`${ROW_SQL} WHERE r.booking_code = $1`, [bookingCode])).rows[0];
    if (!r || !r.psid || !fb.isConnected()) return { ok: false, reason: 'skipped' };
    const text = confirmText(r, s.hotline);
    const result = await fb.sendToFacebook(r.psid, text);
    await logOut(r, text, result).catch(() => {});
    return result;
  } catch (e) { return { ok: false, reason: e.message }; }
}

if (!process.env.NO_TIMERS) {
  ensureSchema().catch((e) => console.error('Nhắc lịch:', e.message));
  setInterval(() => check().catch((e) => console.error('Nhắc lịch:', e.message)), 60000).unref();
}

module.exports = { check, sendConfirmation, ensureSchema, REMIND_BEFORE_MIN };
