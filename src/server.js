const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const { getSettings } = require('./settings');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Giữ lại nội dung gốc (rawBody) để sau này kiểm tra chữ ký HMAC của Facebook.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// Trang khách ở gốc, trang quản trị ở /admin.
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Kiểm tra server và cơ sở dữ liệu đang chạy.
app.get('/api/health', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT now() AS time, (SELECT count(*)::int FROM dining_tables) AS tables'
    );
    res.json({ ok: true, db: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Thông tin công khai cho trang khách (giờ, hotline, giới hạn đặt bàn).
app.get('/api/settings', async (req, res, next) => {
  try {
    const s = await getSettings();
    const hours = await db.query(
      'SELECT day_of_week, to_char(open_time, \'HH24:MI\') AS open_time, to_char(close_time, \'HH24:MI\') AS close_time FROM opening_hours ORDER BY day_of_week, open_time'
    );
    res.json({
      restaurantName: s.restaurant_name,
      address: s.restaurant_address,
      hotline: s.hotline,
      holdMinutes: s.hold_minutes,
      slotStepMinutes: s.slot_step_minutes,
      lastSeatingBeforeClose: s.last_seating_before_close,
      bookingWindowDays: s.booking_window_days,
      maxOnlinePartySize: s.max_online_party_size,
      openingHours: hours.rows,
    });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/staff', require('./routes/staffReservations'));
app.use('/api/staff', require('./routes/staffAdmin'));
app.use('/api/staff/facebook', require('./routes/staffFacebook'));
app.use('/api/facebook', require('./routes/facebook'));
app.use('/api/bot', require('./routes/bot'));
app.use('/api', require('./routes/booking'));

app.use('/api', notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server đang chạy tại http://localhost:${config.port}`);
});
