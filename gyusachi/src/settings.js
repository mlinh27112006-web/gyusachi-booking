const { query } = require('./db');

const CACHE_MS = 60 * 1000;
const KEEP_AS_TEXT = new Set(['hotline', 'restaurant_name', 'restaurant_address']);

let cache = null;
let loadedAt = 0;

// Đọc bảng settings, đổi các giá trị số thành kiểu số, lưu tạm 60 giây.
async function getSettings() {
  if (cache && Date.now() - loadedAt < CACHE_MS) return cache;
  const { rows } = await query('SELECT key, value FROM settings');
  const settings = {};
  for (const row of rows) {
    const isNumber = /^\d+$/.test(row.value) && !KEEP_AS_TEXT.has(row.key);
    settings[row.key] = isNumber ? Number(row.value) : row.value;
  }
  cache = settings;
  loadedAt = Date.now();
  return settings;
}

// Giờ mở cửa theo từng ca: [{ day_of_week, open_time: 'HH:MM', close_time: 'HH:MM' }].
async function getOpeningHours() {
  const { rows } = await query(
    `SELECT day_of_week,
            to_char(open_time, 'HH24:MI') AS open_time,
            to_char(close_time, 'HH24:MI') AS close_time
       FROM opening_hours
      ORDER BY day_of_week, open_time`
  );
  return rows;
}

module.exports = { getSettings, getOpeningHours };
