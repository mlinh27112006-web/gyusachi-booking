const config = require('../config');
const { AppError } = require('../errors');
const rules = require('../services/bookingRules');
const fb = require('../services/facebookService');

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

// ---- Webhook thật (Facebook gọi, không có JWT) ----
// GET: Facebook xác minh địa chỉ webhook bằng verify token.
function verify(req, res) {
  const q = req.query;
  if (config.fbVerifyToken && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.fbVerifyToken) {
    return res.status(200).type('text/plain').send(String(q['hub.challenge'] || ''));
  }
  return res.status(403).type('text/plain').send('Forbidden');
}

// POST: nhận tin nhắn. Bắt buộc đúng chữ ký HMAC; sai chữ ký thì ghi log từ chối và trả 403.
const receive = wrap(async (req, res) => {
  if (!config.fbAppSecret) throw new AppError(403, 'Webhook Facebook chưa được cấu hình (thiếu FB_APP_SECRET)', 'FB_NOT_CONFIGURED');
  if (!fb.verifySignature(req.rawBody, req.headers['x-hub-signature-256'], config.fbAppSecret)) {
    await fb.logRejected(req.rawBody).catch(() => {});
    throw new AppError(403, 'Chữ ký không hợp lệ', 'BAD_SIGNATURE');
  }
  const b = body(req);
  if (b.object !== 'page' || !Array.isArray(b.entry)) throw new AppError(404, 'Sự kiện không được hỗ trợ', 'NOT_SUPPORTED');
  for (const entry of b.entry) {
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const text = ev && ev.message && typeof ev.message.text === 'string' ? ev.message.text.trim() : '';
      const senderId = ev && ev.sender && ev.sender.id ? String(ev.sender.id) : '';
      if (!text || !senderId || (ev.message && ev.message.is_echo)) continue;
      // Lỗi ở một tin nhắn không được làm Facebook gửi lại cả lô.
      await fb.handleIncoming({
        senderId, text: text.slice(0, 2000), mid: ev.message.mid ? String(ev.message.mid) : null,
        raw: { event: ev }, signatureValid: true, isDemo: false,
      }).catch((e) => console.error('Lỗi xử lý tin nhắn Facebook:', e.message));
    }
  }
  res.status(200).type('text/plain').send('EVENT_RECEIVED');
});

// ---- Nhân viên (cần quyền facebook.handle) ----
// Chế độ mô phỏng: giả lập một tin nhắn từ khách để thử toàn bộ luồng mà không cần Facebook thật.
const demo = wrap(async (req, res) => {
  const b = body(req);
  const text = String(b.text || '').trim();
  if (!text || text.length > 1000) throw new AppError(400, 'Nội dung tin nhắn từ 1 đến 1000 ký tự', 'INVALID_TEXT');
  const senderId = String(b.senderId || 'demo-user').trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(senderId)) throw new AppError(400, 'Mã người gửi không hợp lệ', 'INVALID_SENDER');
  const senderName = b.senderName ? String(b.senderName).trim().slice(0, 60) : null;
  const r = await fb.handleIncoming({
    senderId: `demo:${senderId}`, senderName, text, mid: null, raw: { demo: true }, signatureValid: null, isDemo: true,
  });
  res.status(201).json({ senderId: `demo:${senderId}`, reply: r.reply, matchedKeyword: r.matchedKeyword });
});

const status = wrap(async (req, res) => res.json({ connected: fb.isConnected(), appSecretSet: !!config.fbAppSecret, verifyTokenSet: !!config.fbVerifyToken }));

const conversations = wrap(async (req, res) => res.json({ conversations: await fb.conversations() }));

const messages = wrap(async (req, res) => {
  const senderId = String(req.query.senderId || '').trim();
  if (!senderId || senderId.length > 80) throw new AppError(400, 'Thiếu mã người gửi', 'INVALID_SENDER');
  res.json({ senderId, messages: await fb.messages(senderId) });
});

const reply = wrap(async (req, res) => {
  const b = body(req);
  const text = String(b.text || '').trim();
  const senderId = String(b.senderId || '').trim();
  if (!senderId) throw new AppError(400, 'Thiếu mã người gửi', 'INVALID_SENDER');
  if (!text || text.length > 1000) throw new AppError(400, 'Nội dung từ 1 đến 1000 ký tự', 'INVALID_TEXT');
  const r = await fb.staffReply(req.user, senderId, text);
  res.status(201).json({ ok: true, delivered: r.delivered });
});

const listRules = wrap(async (req, res) => res.json({ rules: await fb.listRules() }));
const createRule = wrap(async (req, res) => res.status(201).json(await fb.createRule(req.user, body(req))));
const updateRule = wrap(async (req, res) => res.json(await fb.updateRule(req.user, rules.validateId(req.params.id, 'kịch bản'), body(req))));
const deleteRule = wrap(async (req, res) => { await fb.deleteRule(req.user, rules.validateId(req.params.id, 'kịch bản')); res.status(204).end(); });

module.exports = { verify, receive, demo, status, conversations, messages, reply, listRules, createRule, updateRule, deleteRule };
