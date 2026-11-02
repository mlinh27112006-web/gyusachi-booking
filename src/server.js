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

// Nén gzip nếu đã cài gói "compression" (tùy chọn, không có vẫn chạy bình thường).
try { const compression = require('compression'); app.use(compression({ filter: (req, res) => req.path !== '/api/stream' && compression.filter(req, res) })); } catch (e) { /* bỏ qua */ }

// Trang khách ở gốc, trang quản trị ở /admin. Ảnh/CSS/JS được cache trình duyệt, HTML luôn kiểm tra lại.
const staticOpts = {
  etag: true,
  setHeaders: (res, file) => {
    if (/\.(webp|png|jpg|jpeg|svg|woff2?)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    else if (/\.(css|js)$/i.test(file)) res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    else res.setHeader('Cache-Control', 'no-cache');
    if (/sw\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  },
};
app.use(express.static(path.join(__dirname, '..', 'public'), staticOpts));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin'), { etag: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

// robots.txt và sitemap.xml lấy địa chỉ từ PUBLIC_URL (hoặc theo host đang truy cập).
function baseUrl(req) { return config.publicUrl || `${req.protocol}://${req.get('host')}`; }
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /lookup.html\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const b = baseUrl(req);
  const urls = ['/', '/menu.html', '/book.html', '/about.html', '/recruitment.html'];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${b}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
});

// Thời gian thực: mọi thao tác ghi thành công (khách, nhân viên, bot, Facebook) báo cho các trình duyệt đang mở.
const live = require('./services/liveBus');
const waitlist = require('./services/waitlistService');
let wlTimer = null;
function scheduleWaitlistCheck() {
  clearTimeout(wlTimer);
  wlTimer = setTimeout(() => waitlist.check().catch((e) => console.error('Waitlist:', e.message)), 800);
}
app.get('/api/stream', (req, res) => live.connect(req, res));
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      live.changed();
      scheduleWaitlistCheck(); // có thể vừa trống bàn: báo người đang chờ
    });
  }
  next();
});

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
app.use('/api/staff/waitlist', require('./routes/staffWaitlist'));
app.use('/api/facebook', require('./routes/facebook'));
app.use('/api/bot', require('./routes/bot'));
app.use('/api', require('./routes/booking'));

app.use('/api', notFound);
app.use(errorHandler);

// Định kỳ 60 giây: giữ chỗ hết hạn, khóa mềm hết hạn, đến giờ hẹn... đều có thể làm trống bàn.
setInterval(() => waitlist.check().catch((e) => console.error('Waitlist:', e.message)), 60000).unref();

// Tự tạo bảng danh sách chờ nếu CSDL chưa có (file migration viết kiểu IF NOT EXISTS nên chạy lại vẫn an toàn).
async function ensureSchema() {
  try {
    const sql = require('fs').readFileSync(path.join(__dirname, '..', 'db', 'migrations', '004_waitlist.sql'), 'utf8');
    await db.query(sql);
  } catch (e) { console.error('Không tạo được bảng danh sách chờ:', e.message); }
}
ensureSchema();

app.listen(config.port, () => {
  console.log(`Server đang chạy tại http://localhost:${config.port}`);
});
