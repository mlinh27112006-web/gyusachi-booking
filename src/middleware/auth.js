const jwt = require('jsonwebtoken'); const config = require('../config'); const { AppError } = require('../errors'); const staffAuth = require('../services/staffAuth');
async function authenticate(req, res, next) {
  try {
    const h = String(req.headers.authorization || ''); if (!h.startsWith('Bearer ')) throw new AppError(401, 'Vui lòng đăng nhập', 'UNAUTHENTICATED');
    let p; try { p = jwt.verify(h.slice(7), config.jwtSecret); } catch (e) { throw new AppError(401, 'Phiên đăng nhập đã hết hạn', 'UNAUTHENTICATED'); }
    const row = await staffAuth.findById(p.uid); if (!row || !row.is_active) throw new AppError(401, 'Tài khoản không còn hiệu lực', 'UNAUTHENTICATED');
    if (row.password_changed_at && p.iat && p.iat < Math.floor(new Date(row.password_changed_at).getTime() / 1000)) throw new AppError(401, 'Mật khẩu đã thay đổi, vui lòng đăng nhập lại', 'UNAUTHENTICATED');
    req.user = staffAuth.toUser(row); next();
  } catch (e) { next(e); }
}
const requirePermission = (perm) => (req, res, next) => (req.user && req.user.permissions.includes(perm) ? next() : next(new AppError(403, 'Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN')));
module.exports = { authenticate, requirePermission };
