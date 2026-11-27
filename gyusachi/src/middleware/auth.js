const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../errors');
const staffAuth = require('../services/staffAuth');

// Xác thực danh tính từ token trong header  Authorization: Bearer <token>.
// Quyền hạn được đọc lại từ cơ sở dữ liệu ở mỗi request, nên đổi vai trò
// hoặc khóa tài khoản có hiệu lực ngay, không phải chờ token hết hạn.
async function authenticate(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'Bạn chưa đăng nhập', 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'TOKEN_EXPIRED');
      }
      throw new AppError(401, 'Token không hợp lệ', 'INVALID_TOKEN');
    }

    const row = await staffAuth.findById(payload.uid);
    if (!row || !row.is_active) {
      throw new AppError(401, 'Tài khoản không còn hiệu lực', 'ACCOUNT_DISABLED');
    }
    req.user = staffAuth.toUser(row);
    next();
  } catch (err) {
    next(err);
  }
}

// Chỉ cho đi tiếp khi người dùng có đủ các quyền được nêu.
// Ví dụ: router.get('/', authenticate, requirePermission('report.view'), handler)
function requirePermission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Bạn chưa đăng nhập', 'UNAUTHORIZED'));
    const missing = codes.filter((code) => !req.user.permissions.includes(code));
    if (missing.length > 0) {
      return next(new AppError(403, 'Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN'));
    }
    next();
  };
}

module.exports = { authenticate, requirePermission };
