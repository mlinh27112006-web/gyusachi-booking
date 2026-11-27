const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../errors');
const limiter = require('../services/loginLimiter');
const staffAuth = require('../services/staffAuth');

// Dùng để so sánh mật khẩu khi tên đăng nhập không tồn tại,
// để thời gian phản hồi không tiết lộ tài khoản nào có thật.
const DUMMY_HASH = bcrypt.hashSync('khong-ton-tai', 10);

async function login(req, res, next) {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) {
      throw new AppError(400, 'Vui lòng nhập tên đăng nhập và mật khẩu', 'MISSING_FIELDS');
    }

    const lockMs = limiter.remainingLockMs(username);
    if (lockMs > 0) {
      const minutes = Math.ceil(lockMs / 60000);
      throw new AppError(429, `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút`, 'LOCKED');
    }

    const row = await staffAuth.findByUsername(username);
    const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

    if (!row || !passwordOk || !row.is_active) {
      limiter.recordFailure(username);
      throw new AppError(401, 'Sai tên đăng nhập hoặc mật khẩu', 'BAD_CREDENTIALS');
    }

    limiter.reset(username);
    const token = jwt.sign({ uid: row.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    // Trả kèm danh sách quyền để giao diện tự hiện đúng menu và nút.
    res.json({ token, expiresIn: config.jwtExpiresIn, user: staffAuth.toUser(row) });
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
