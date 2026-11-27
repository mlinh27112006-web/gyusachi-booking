const express = require('express');
const bot = require('../services/botService');
const fb = require('../services/facebookService');
const { AppError } = require('../errors');

const router = express.Router();

// Giới hạn 40 tin/phút cho mỗi địa chỉ IP để chống spam (trong bộ nhớ, đủ cho một nhà hàng).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 40;
}

// POST /api/bot/chat { sessionId, text } -> { reply }
// Khung chat trên website dùng chung bộ não với bot fanpage; lượt đặt tạo ra có kênh "website".
router.post('/chat', async (req, res, next) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
    if (limited(ip)) throw new AppError(429, 'Bạn nhắn hơi nhanh, vui lòng thử lại sau ít phút', 'RATE_LIMITED');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const text = String(b.text || '').trim();
    const sid = String(b.sessionId || '');
    if (!/^[a-z0-9-]{8,64}$/i.test(sid)) throw new AppError(400, 'Phiên chat không hợp lệ', 'INVALID_SESSION');
    if (!text || text.length > 300) throw new AppError(400, 'Tin nhắn từ 1 đến 300 ký tự', 'INVALID_TEXT');
    const r = await bot.handle(`web:${sid}`, text, { channel: 'website' });
    if (r) return res.json({ reply: r.text, bookingCode: r.bookingCode || null });
    const k = await fb.findReply(text);
    const hint = k.keyword ? '' : '\nAnh/chị thử nhắn: "đặt bàn 4 người 7h tối mai" để em giữ bàn ngay nhé ạ.';
    res.json({ reply: k.text + hint, bookingCode: null });
  } catch (err) { next(err); }
});

module.exports = router;
