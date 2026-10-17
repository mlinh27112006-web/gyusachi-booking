const { AppError } = require('../errors');
const { getSettings, getOpeningHours } = require('../settings');
const rules = require('../services/bookingRules');
const tableService = require('../services/tableService');
const reservationService = require('../services/reservationService');
const staffRes = require('../services/staffReservationService');

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

// Chuẩn hóa ngày, giờ, số khách dùng chung cho nhiều API.
async function parseSlot(date, time, partyRaw) {
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
  const party = rules.validateParty(partyRaw, settings);
  const start = rules.validateSlot(date, time, settings, hours);
  return { settings, party, start, holdMinutes: settings.hold_minutes };
}

// GET /api/availability?date=2026-10-07&party=4 : các giờ trong ngày và số bàn còn chọn được.
async function availability(req, res, next) {
  try {
    const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
    const date = rules.validateDate(req.query.date, settings);
    const party = rules.validateParty(req.query.party, settings);
    const times = rules.slotsForDate(date, hours, settings);
    const slots = [];
    for (const time of times) {
      const count = await tableService.countAvailable({
        start: `${date} ${time}:00+07`, holdMinutes: settings.hold_minutes, party,
      });
      slots.push({ time, available: count });
    }
    res.json({ date, party, slots });
  } catch (err) { next(err); }
}

// GET /api/tables/map?date&time&party&lockToken : sơ đồ bàn cho khách.
async function tableMap(req, res, next) {
  try {
    const { party, start, holdMinutes } = await parseSlot(req.query.date, req.query.time, req.query.party);
    const lockToken = rules.isUuid(req.query.lockToken) ? req.query.lockToken : null;
    res.json(await tableService.getTableMap({ start, holdMinutes, party, lockToken }));
  } catch (err) { next(err); }
}

// POST /api/locks : giữ bàn 5 phút khi khách chọn bàn.
async function createLock(req, res, next) {
  try {
    const b = body(req);
    const { settings, party, start, holdMinutes } = await parseSlot(b.date, b.time, b.party);
    const tableId = rules.validateId(b.tableId);
    const token = rules.isUuid(b.lockToken) ? b.lockToken : null;
    const lock = await tableService.acquireLock({
      tableId, start, holdMinutes, party, token, ttlSeconds: settings.soft_lock_ttl_seconds,
    });
    res.status(201).json(lock);
  } catch (err) { next(err); }
}

// DELETE /api/locks/:token : khách bỏ chọn bàn.
async function releaseLock(req, res, next) {
  try {
    if (!rules.isUuid(req.params.token)) throw new AppError(400, 'Mã giữ bàn không hợp lệ', 'INVALID_TOKEN');
    await tableService.releaseLock(req.params.token);
    res.status(204).end();
  } catch (err) { next(err); }
}

// POST /api/reservations : khách tự đặt bàn trên website.
async function createPublic(req, res, next) {
  try {
    const b = body(req);
    const { party, start, holdMinutes } = await parseSlot(b.date, b.time, b.party);
    if (!rules.isUuid(b.lockToken)) throw new AppError(410, 'Hết thời gian giữ bàn. Vui lòng chọn lại bàn', 'LOCK_EXPIRED');
    const reservation = await reservationService.create({
      source: 'website',
      channel: 'website',
      tableId: rules.validateId(b.tableId),
      party, start, holdMinutes,
      note: rules.validateNote(b.note),
      lockToken: b.lockToken,
      customer: { name: rules.validateName(b.name), phone: rules.normalizePhone(b.phone) },
      staffUser: null,
      rawRequest: { name: b.name, phone: b.phone, party: b.party, date: b.date, time: b.time, tableId: b.tableId, note: b.note },
    });
    res.status(201).json(reservation);
  } catch (err) { next(err); }
}

// POST /api/reservations/lookup  { phone, code }
async function lookup(req, res, next) {
  try {
    const b = body(req);
    res.json(await reservationService.lookup(rules.normalizePhone(b.phone), normalizeCode(b.code)));
  } catch (err) { next(err); }
}

// POST /api/reservations/cancel  { phone, code }
async function cancel(req, res, next) {
  try {
    const b = body(req);
    res.json(await reservationService.cancelByCustomer(rules.normalizePhone(b.phone), normalizeCode(b.code)));
  } catch (err) { next(err); }
}

function normalizeCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^GYU-\d{4}(-\d{4})?$/.test(code)) throw new AppError(400, 'Mã đặt bàn có dạng GYU-1510-0909 (4 số cuối là 4 số cuối số điện thoại của bạn)', 'INVALID_CODE');
  return code;
}

// ---- Nhân viên ----
// Kênh của lượt đặt do nhân viên nhập: theo vai trò, còn quản lý trở lên chọn hotline hoặc fanpage.
function staffChannel(user, requested) {
  if (user.role === 'hotline_staff') return 'hotline';
  if (user.role === 'fanpage_staff') return 'fanpage';
  if (requested === 'hotline' || requested === 'fanpage') return requested;
  throw new AppError(400, 'Vui lòng chọn kênh: hotline hoặc fanpage', 'INVALID_CHANNEL');
}

// Nhân viên được đặt hộ khách, không bị giới hạn số khách online nhưng vẫn theo giờ mở cửa.
async function staffParse(date, time, partyRaw) {
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
  const party = Number(partyRaw);
  if (!Number.isInteger(party) || party < 1 || party > 20) {
    throw new AppError(400, 'Số khách phải từ 1 đến 20', 'INVALID_PARTY');
  }
  const start = rules.validateSlot(date, time, settings, hours);
  return { party, start, holdMinutes: settings.hold_minutes };
}

// GET /api/staff/tables/map?date&time&party
async function staffTableMap(req, res, next) {
  try {
    const { party, start, holdMinutes } = await staffParse(req.query.date, req.query.time, req.query.party);
    res.json(await tableService.getTableMap({ start, holdMinutes, party, staffMode: true }));
  } catch (err) { next(err); }
}

// GET /api/staff/slots?date= : các giờ nhận khách trong ngày (cho nhân viên chọn giờ).
async function staffSlots(req, res, next) {
  try {
    const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
    const date = rules.validateDate(req.query.date, settings);
    res.json({ date, slots: rules.slotsForDate(date, hours, settings), holdMinutes: settings.hold_minutes });
  } catch (err) { next(err); }
}

// Đặt bàn từ tin nhắn fanpage: gắn mã người nhắn (fbSenderId) để biết lượt đặt từ cuộc trò chuyện nào.
function fbSender(b, channel) {
  if (channel !== 'fanpage' || !b.fbSenderId) return null;
  const id = String(b.fbSenderId).trim();
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) throw new AppError(400, 'Mã người nhắn Facebook không hợp lệ', 'INVALID_SENDER');
  return id;
}

// POST /api/staff/reservations
async function staffCreate(req, res, next) {
  try {
    const b = body(req);
    const { party, start, holdMinutes } = await staffParse(b.date, b.time, b.party);
    const reservation = await reservationService.create({
      source: 'staff',
      channel: staffChannel(req.user, b.channel),
      tableId: rules.validateId(b.tableId),
      party, start, holdMinutes,
      note: rules.validateNote(b.note),
      lockToken: null,
      customer: { name: rules.validateName(b.name), phone: rules.normalizePhone(b.phone) },
      staffUser: req.user,
      externalUserId: fbSender(b, staffChannel(req.user, b.channel)),
      rawRequest: { name: b.name, phone: b.phone, party: b.party, date: b.date, time: b.time, tableId: b.tableId, note: b.note },
    });
    res.status(201).json(reservation);
  } catch (err) { next(err); }
}

// GET /api/staff/reservations?date=&status=&channel=&q=
async function staffList(req, res, next) {
  try {
    const q = req.query;
    const date = q.date ? (rules.isValidDate(q.date) ? q.date : null) : rules.vnNow().date;
    if (!date) throw new AppError(400, 'Ngày không hợp lệ', 'INVALID_DATE');
    if (q.status && !staffRes.STATUSES.includes(q.status)) throw new AppError(400, 'Trạng thái không hợp lệ', 'INVALID_STATUS');
    if (q.channel && !staffRes.CHANNELS.includes(q.channel)) throw new AppError(400, 'Kênh không hợp lệ', 'INVALID_CHANNEL');
    const text = String(q.q || '').trim().slice(0, 50);
    res.json({ date, reservations: await staffRes.list({ date, status: q.status || null, channel: q.channel || null, q: text || null }) });
  } catch (err) { next(err); }
}

async function staffGet(req, res, next) {
  try { res.json(await staffRes.get(rules.validateId(req.params.id, 'lượt đặt'))); } catch (err) { next(err); }
}

// POST /api/staff/reservations/:id/:action  (arrive | release | no-show | cancel)
const ACTIONS = { arrive: 'arrive', release: 'release', 'no-show': 'no_show', cancel: 'cancel' };
async function staffAction(req, res, next) {
  try {
    const action = ACTIONS[req.params.action];
    if (!action) throw new AppError(404, 'Thao tác không tồn tại', 'NOT_FOUND');
    res.json(await staffRes.transition(rules.validateId(req.params.id, 'lượt đặt'), action, req.user));
  } catch (err) { next(err); }
}

module.exports = {
  staffList, staffGet, staffAction,
  availability, tableMap, createLock, releaseLock, createPublic, lookup, cancel,
  staffTableMap, staffCreate, staffSlots,
};
