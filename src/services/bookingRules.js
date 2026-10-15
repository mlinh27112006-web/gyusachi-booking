// Các quy tắc đặt bàn thuần túy (không đụng cơ sở dữ liệu): giờ, ngày, số khách, thông tin khách.
// Mọi giờ trong hệ thống tính theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
const { AppError } = require('../errors');

const TZ_OFFSET_MIN = 7 * 60;
const pad = (n) => String(n).padStart(2, '0');

// Ngày giờ hiện tại theo giờ Việt Nam: { date: 'YYYY-MM-DD', minutes: số phút từ 00:00 }.
function vnNow(nowMs = Date.now()) {
  const d = new Date(nowMs + TZ_OFFSET_MIN * 60000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseTime(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const formatTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// 1 = thứ 2 ... 7 = chủ nhật (khớp cột day_of_week trong opening_hours).
function isoDayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Các giờ khách được chọn trong một ngày: bước 30 phút trong từng ca,
// muộn nhất là (giờ đóng ca - last_seating_before_close), bỏ các giờ đã qua.
// openingHours: [{ day_of_week, open_time: 'HH:MM', close_time: 'HH:MM' }]
function slotsForDate(date, openingHours, settings, nowMs = Date.now()) {
  const dow = isoDayOfWeek(date);
  const step = settings.slot_step_minutes;
  const before = settings.last_seating_before_close;
  const now = vnNow(nowMs);
  const slots = [];
  for (const shift of openingHours.filter((h) => h.day_of_week === dow)) {
    const open = parseTime(shift.open_time);
    const close = parseTime(shift.close_time);
    for (let m = open; m <= close - before; m += step) {
      if (date === now.date && m <= now.minutes) continue;
      slots.push(formatTime(m));
    }
  }
  return slots.sort();
}

// Ngày phải hợp lệ, không ở quá khứ và nằm trong thời hạn đặt trước.
function validateDate(date, settings, nowMs = Date.now()) {
  if (!isValidDate(date)) throw new AppError(400, 'Ngày không hợp lệ', 'INVALID_DATE');
  const today = vnNow(nowMs).date;
  if (date < today) throw new AppError(400, 'Không thể đặt bàn cho ngày đã qua', 'DATE_IN_PAST');
  if (date > addDays(today, settings.booking_window_days)) {
    throw new AppError(400, `Chỉ nhận đặt trước tối đa ${settings.booking_window_days} ngày`, 'DATE_TOO_FAR');
  }
  return date;
}

// Kiểm tra ngày và giờ khách chọn, trả về thời điểm bắt đầu dạng timestamptz '2026-10-07 18:00:00+07'.
function validateSlot(date, time, settings, openingHours, nowMs = Date.now()) {
  validateDate(date, settings, nowMs);
  if (!slotsForDate(date, openingHours, settings, nowMs).includes(String(time))) {
    throw new AppError(400, 'Nhà hàng không nhận khách vào giờ này. Vui lòng chọn giờ khác', 'INVALID_TIME');
  }
  return `${date} ${time}:00+07`;
}

function validateParty(value, settings) {
  const party = Number(value);
  if (!Number.isInteger(party) || party < 1) {
    throw new AppError(400, 'Vui lòng nhập số khách hợp lệ', 'INVALID_PARTY');
  }
  if (party > settings.max_online_party_size) {
    throw new AppError(
      400,
      `Nhóm trên ${settings.max_online_party_size} khách vui lòng gọi hotline ${settings.hotline} để được sắp xếp`,
      'PARTY_TOO_LARGE'
    );
  }
  return party;
}

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  else if (p.startsWith('84') && p.length === 11) p = `0${p.slice(2)}`;
  if (!/^0\d{9}$/.test(p)) {
    throw new AppError(400, 'Số điện thoại không hợp lệ (cần 10 chữ số, ví dụ 0905123456)', 'INVALID_PHONE');
  }
  return p;
}

function validateName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) {
    throw new AppError(400, 'Vui lòng nhập họ tên (từ 2 đến 100 ký tự)', 'INVALID_NAME');
  }
  return name;
}

function validateNote(raw) {
  const note = String(raw || '').trim();
  if (note.length > 500) throw new AppError(400, 'Ghi chú tối đa 500 ký tự', 'NOTE_TOO_LONG');
  return note || null;
}

function validateId(raw, label = 'bàn') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, `Vui lòng chọn ${label}`, 'INVALID_ID');
  return id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

module.exports = {
  vnNow, isValidDate, parseTime, formatTime, isoDayOfWeek, addDays,
  slotsForDate, validateDate, validateSlot, validateParty, normalizePhone, validateName, validateNote,
  validateId, isUuid,
};
