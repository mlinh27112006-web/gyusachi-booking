// Giới hạn tần suất gọi API công khai (chống spam đặt bàn và chống giữ bàn ảo). Lưu trong bộ nhớ:
// khởi động lại máy chủ là xóa sạch, đủ cho một nhà hàng. Địa chỉ IP lấy theo cùng cách với phần tra cứu mã đặt bàn.
const { AppError } = require('../errors');

const hits = new Map(); // khóa -> mảng thời điểm (rateLimit) hoặc Map(id -> thời điểm) (distinctLimit)
// IP thật do Express tính theo 'trust proxy' (server.js). Không dùng phần đầu của X-Forwarded-For vì khách tự khai được.
const ipOf = (req) => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

function sweep(now, maxAge) {
  if (hits.size < 5000) return;
  for (const [k, v] of hits) {
    const last = Array.isArray(v) ? v[v.length - 1] : Math.max(0, ...v.values());
    if (!last || now - last > maxAge) hits.delete(k);
  }
  if (hits.size > 10000) hits.clear();
}

function tooMany(res, waitMs, message) {
  res.set('Retry-After', String(Math.max(1, Math.ceil(waitMs / 1000))));
  return new AppError(429, message || 'Bạn thao tác hơi nhanh. Vui lòng thử lại sau ít phút hoặc gọi hotline để được hỗ trợ', 'RATE_LIMITED');
}

// Tối đa `max` yêu cầu trong `windowMs` cho mỗi địa chỉ IP.
function rateLimit({ name, max, windowMs, message }) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_OFF === '1') return next(); // chỉ dùng khi chạy kiểm thử đồng thời trên máy mình
    const now = Date.now(); const key = `${name}:${ipOf(req)}`;
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(tooMany(res, windowMs - (now - arr[0]), message));
    arr.push(now); hits.set(key, arr); sweep(now, windowMs);
    return next();
  };
}

// Tối đa `max` giá trị khác nhau (ví dụ mã giữ bàn) trong `windowMs` cho mỗi địa chỉ IP. Dùng lại giá trị cũ thì không tính thêm,
// nên khách thật đổi bàn nhiều lần (cùng một mã) không bị chặn, còn kẻ gửi mã ngẫu nhiên liên tục để giữ nhiều bàn thì bị chặn.
function distinctLimit({ name, max, windowMs, idOf, message }) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_OFF === '1') return next();
    const now = Date.now(); const key = `${name}:${ipOf(req)}`;
    const seen = hits.get(key) instanceof Map ? hits.get(key) : new Map();
    for (const [id, t] of seen) if (now - t >= windowMs) seen.delete(id);
    const id = String(idOf(req) || `new-${now}-${Math.random()}`);
    if (!seen.has(id) && seen.size >= max) return next(tooMany(res, windowMs - (now - Math.min(...seen.values())), message));
    seen.set(id, now); hits.set(key, seen); sweep(now, windowMs);
    return next();
  };
}

module.exports = { rateLimit, distinctLimit, ipOf, _reset: () => hits.clear() };
