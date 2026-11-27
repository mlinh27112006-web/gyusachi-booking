const crypto = require('crypto');
const db = require('../db');
const { AppError } = require('../errors');
const { getSettings } = require('../settings');
const config = require('../config');
const bot = require('./botService');

const LOCAL = "'Asia/Ho_Chi_Minh'";

// ---- Chữ ký của Facebook: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(rawBody, appSecret) ----
function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !rawBody || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  let given;
  try { given = Buffer.from(header.slice(7), 'hex'); } catch { return false; }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// ---- So khớp từ khóa: không phân biệt hoa thường và dấu, khớp theo từ nguyên vẹn ----
function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matches(text, keyword) {
  const k = normalize(keyword);
  if (!k) return false;
  return ` ${normalize(text)} `.includes(` ${k} `);
}

async function findReply(text) {
  const { rows } = await db.query(
    'SELECT id, keyword, reply_text FROM fb_auto_replies WHERE is_active ORDER BY sort_order, id');
  const hit = rows.find((r) => matches(text, r.keyword));
  if (hit) return { keyword: hit.keyword, text: hit.reply_text };
  const s = await getSettings();
  return { keyword: null, text: `Dạ Gyu Sachi đã nhận tin nhắn của anh/chị, nhân viên sẽ phản hồi sớm ạ. Cần gấp anh/chị vui lòng gọi hotline ${s.hotline} ạ.` };
}

// ---- Gửi tin lên Facebook (Send API). Chỉ gửi được cho người đã nhắn trong 24 giờ gần nhất. ----
// Trả về { ok: true } hoặc { ok: false, reason } (không ném lỗi để webhook luôn trả 200).
function isConnected() { return !!config.fbPageToken; }

async function sendToFacebook(psid, text) {
  if (!config.fbPageToken) return { ok: false, reason: 'NO_TOKEN' };
  try {
    const res = await fetch(`${config.fbGraphUrl}/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.fbPageToken}` },
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text } }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    let msg = ''; let code = null;
    try { const j = await res.json(); msg = (j.error && j.error.message) || ''; code = j.error && j.error.code; } catch { /* không đọc được nội dung */ }
    return { ok: false, reason: describeError(res.status, code, msg) };
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'Facebook không phản hồi (quá 8 giây)' : 'Không kết nối được Facebook' };
  }
}

function describeError(status, code, msg) {
  if (code === 190 || status === 401) return 'Page Access Token không hợp lệ hoặc đã hết hạn';
  if (code === 10 || code === 200 || /outside of allowed window|24/.test(msg)) return 'Đã quá 24 giờ kể từ tin nhắn cuối của khách, Facebook không cho gửi';
  if (code === 100) return 'Facebook không nhận mã người nhận này';
  return `Facebook từ chối (${status}${msg ? `: ${msg.slice(0, 120)}` : ''})`;
}

// Nhận một tin nhắn đến (thật hoặc mô phỏng): ghi log, tìm câu trả lời tự động, ghi log trả lời.
// Tin nhắn thật có mid: nếu đã xử lý rồi (Facebook gửi lại) thì bỏ qua, không trả lời hai lần.
async function handleIncoming({ senderId, senderName, text, mid, raw, signatureValid, isDemo }) {
  if (mid) {
    const dup = await db.query(`SELECT 1 FROM channel_logs WHERE channel = 'fanpage' AND raw_payload->>'mid' = $1 LIMIT 1`, [mid]);
    if (dup.rowCount > 0) return { duplicate: true };
  }
  // Bot đặt bàn xử lý trước; không phải yêu cầu đặt bàn thì dùng kịch bản từ khóa.
  let botReply = null;
  try { botReply = await bot.handle(senderId, text); } catch (e) { console.error('Lỗi bot đặt bàn:', e.message); }
  const reply = botReply ? { keyword: 'bot đặt bàn', text: botReply.text } : await findReply(text);
  let outId = null;
  await db.withTransaction(async (client) => {
    await client.query(
      `INSERT INTO channel_logs (channel, direction, external_user_id, message_text, raw_payload, signature_valid, is_demo)
       VALUES ('fanpage', 'in', $1, $2, $3::jsonb, $4, $5)`,
      [senderId, text, JSON.stringify({ ...(raw || {}), mid: mid || null, senderName: senderName || null }), signatureValid, isDemo]);
    const out = await client.query(
      `INSERT INTO channel_logs (channel, direction, external_user_id, message_text, raw_payload, is_demo)
       VALUES ('fanpage', 'out', $1, $2, $3::jsonb, $4) RETURNING id`,
      [senderId, reply.text, JSON.stringify({ auto: true, keyword: reply.keyword, delivered: isDemo ? 'demo' : false }), isDemo]);
    outId = out.rows[0].id;
  });
  // Tin thật: gửi câu trả lời tự động lên Facebook sau khi đã ghi log, rồi ghi lại kết quả.
  if (!isDemo && config.fbPageToken) {
    const r = await sendToFacebook(senderId, reply.text);
    await db.query(
      `UPDATE channel_logs SET raw_payload = raw_payload || $2::jsonb WHERE id = $1`,
      [outId, JSON.stringify(r.ok ? { delivered: 'sent' } : { delivered: 'failed', error: r.reason })]).catch(() => {});
  }
  return { duplicate: false, reply: reply.text, matchedKeyword: reply.keyword };
}

// Ghi nhận request sai chữ ký để có bằng chứng; không xử lý nội dung.
async function logRejected(rawBody) {
  await db.query(
    `INSERT INTO channel_logs (channel, direction, message_text, raw_payload, signature_valid, is_demo)
     VALUES ('fanpage', 'in', NULL, $1::jsonb, false, false)`,
    [JSON.stringify({ rejected: true, size: rawBody ? rawBody.length : 0 })]);
}

// ---- Màn hình nhân viên fanpage ----
async function conversations() {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (l.external_user_id)
            l.external_user_id AS sender_id, l.is_demo,
            l.message_text AS last_text, l.direction AS last_direction,
            to_char(l.created_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS last_at,
            (SELECT count(*)::int FROM channel_logs x WHERE x.channel = 'fanpage' AND x.external_user_id = l.external_user_id) AS messages,
            (SELECT count(*)::int FROM channel_logs x WHERE x.external_user_id = l.external_user_id AND x.reservation_id IS NOT NULL) AS reservations,
            (SELECT x.raw_payload->>'senderName' FROM channel_logs x WHERE x.external_user_id = l.external_user_id AND x.raw_payload->>'senderName' IS NOT NULL ORDER BY x.id DESC LIMIT 1) AS sender_name
       FROM channel_logs l
      WHERE l.channel = 'fanpage' AND l.external_user_id IS NOT NULL AND l.message_text IS NOT NULL
      ORDER BY l.external_user_id, l.id DESC`);
  return rows
    .map((r) => ({
      senderId: r.sender_id, senderName: r.sender_name, isDemo: r.is_demo, lastText: r.last_text,
      lastDirection: r.last_direction, lastAt: r.last_at, messages: r.messages, reservations: r.reservations,
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}

async function messages(senderId, limit = 100) {
  const { rows } = await db.query(
    `SELECT l.id, l.direction, l.message_text, l.is_demo, l.signature_valid,
            to_char(l.created_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI:SS') AS at_local,
            l.raw_payload->>'auto' AS auto, l.raw_payload->>'delivered' AS delivered, l.raw_payload->>'error' AS delivery_error, r.booking_code
       FROM channel_logs l LEFT JOIN reservations r ON r.id = l.reservation_id
      WHERE l.channel = 'fanpage' AND l.external_user_id = $1
        AND (l.message_text IS NOT NULL OR l.reservation_id IS NOT NULL)
      ORDER BY l.id DESC LIMIT ${Number(limit)}`, [senderId]);
  return rows.reverse().map((r) => ({
    id: r.id, direction: r.direction, type: r.message_text == null ? 'reservation' : 'message',
    text: r.message_text == null ? `Đã tạo đặt bàn ${r.booking_code}` : r.message_text, at: r.at_local, auto: r.auto === 'true',
    isDemo: r.is_demo, signatureValid: r.signature_valid, bookingCode: r.booking_code,
    delivered: r.direction === 'out' ? (r.delivered || null) : undefined, deliveryError: r.delivery_error || undefined,
  }));
}

// Nhân viên nhắn trả lời. Chưa có kết nối Facebook thật nên chỉ ghi lại (delivered: false / 'demo').
async function staffReply(user, senderId, text) {
  const demo = (await db.query(
    `SELECT bool_or(is_demo) AS d FROM channel_logs WHERE channel = 'fanpage' AND external_user_id = $1`, [senderId])).rows[0].d;
  if (demo === null) throw new AppError(404, 'Không tìm thấy cuộc trò chuyện này', 'NOT_FOUND');
  // Cuộc trò chuyện thật và đã nối Facebook: gửi trước; Facebook từ chối thì báo lỗi, không ghi là đã gửi.
  let delivered = demo ? 'demo' : false;
  if (!demo && config.fbPageToken) {
    const r = await sendToFacebook(senderId, text);
    if (!r.ok) throw new AppError(502, `Không gửi được tin lên Facebook: ${r.reason}`, 'FB_SEND_FAILED');
    delivered = 'sent';
  }
  await db.withTransaction(async (client) => {
    await client.query(
      `INSERT INTO channel_logs (channel, direction, external_user_id, message_text, raw_payload, is_demo)
       VALUES ('fanpage', 'out', $1, $2, $3::jsonb, $4)`,
      [senderId, text, JSON.stringify({ auto: false, staffId: user.id, delivered }), demo]);
    await client.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'facebook.reply', 'fb_user', $2, $3::jsonb)`, [user.id, senderId, JSON.stringify({ length: text.length, delivered })]);
  });
  return { delivered };
}

// ---- Kịch bản trả lời tự động ----
const toRule = (r) => ({ id: r.id, keyword: r.keyword, replyText: r.reply_text, sortOrder: r.sort_order, isActive: r.is_active });

async function listRules() {
  return (await db.query('SELECT * FROM fb_auto_replies ORDER BY sort_order, id')).rows.map(toRule);
}

function cleanRule(input, partial) {
  const out = {};
  if (!partial || input.keyword !== undefined) {
    const k = String(input.keyword || '').trim();
    if (k.length < 1 || k.length > 60 || !normalize(k)) throw new AppError(400, 'Từ khóa từ 1 đến 60 ký tự', 'INVALID_KEYWORD');
    out.keyword = k;
  }
  if (!partial || input.replyText !== undefined) {
    const t = String(input.replyText || '').trim();
    if (t.length < 1 || t.length > 1000) throw new AppError(400, 'Nội dung trả lời từ 1 đến 1000 ký tự', 'INVALID_REPLY');
    out.reply_text = t;
  }
  if (input.sortOrder !== undefined) {
    const n = Number(input.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 999) throw new AppError(400, 'Thứ tự từ 0 đến 999', 'INVALID_SORT');
    out.sort_order = n;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new AppError(400, 'isActive phải là true hoặc false', 'INVALID_FIELD');
    out.is_active = input.isActive;
  }
  return out;
}

async function auditRule(client, user, action, id, detail) {
  await client.query(
    `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
     VALUES ($1, 'staff', $2, 'fb_auto_reply', $3, $4::jsonb)`, [user.id, action, String(id), JSON.stringify(detail)]);
}

async function createRule(user, input) {
  const v = cleanRule(input, false);
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO fb_auto_replies (keyword, reply_text, sort_order, is_active)
       VALUES ($1, $2, $3, $4) RETURNING *`, [v.keyword, v.reply_text, v.sort_order ?? 0, v.is_active ?? true]);
    await auditRule(client, user, 'facebook.rule_create', rows[0].id, { keyword: v.keyword });
    return toRule(rows[0]);
  });
}

async function updateRule(user, id, input) {
  const v = cleanRule(input, true);
  const keys = Object.keys(v);
  return db.withTransaction(async (client) => {
    if (keys.length === 0) {
      const cur = await client.query('SELECT * FROM fb_auto_replies WHERE id = $1', [id]);
      if (cur.rowCount === 0) throw new AppError(404, 'Không tìm thấy kịch bản', 'NOT_FOUND');
      return toRule(cur.rows[0]);
    }
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const { rows } = await client.query(
      `UPDATE fb_auto_replies SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((k) => v[k]), id]);
    if (rows.length === 0) throw new AppError(404, 'Không tìm thấy kịch bản', 'NOT_FOUND');
    await auditRule(client, user, 'facebook.rule_update', id, { fields: keys });
    return toRule(rows[0]);
  });
}

async function deleteRule(user, id) {
  await db.withTransaction(async (client) => {
    const { rows } = await client.query('DELETE FROM fb_auto_replies WHERE id = $1 RETURNING keyword', [id]);
    if (rows.length === 0) throw new AppError(404, 'Không tìm thấy kịch bản', 'NOT_FOUND');
    await auditRule(client, user, 'facebook.rule_delete', id, { keyword: rows[0].keyword });
  });
}

module.exports = {
  verifySignature, normalize, matches, findReply, isConnected, sendToFacebook, handleIncoming, logRejected,
  conversations, messages, staffReply, listRules, createRule, updateRule, deleteRule,
};
