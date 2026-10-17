// Bot đặt bàn bằng câu chat tự nhiên (tiếng Việt) cho kênh fanpage.
// Khách nhắn "đặt bàn 4 người 7h tối mai", bot tự tách số khách, ngày, giờ; hỏi phần còn thiếu;
// tìm bàn trống phù hợp, xin họ tên và số điện thoại, xác nhận rồi giữ bàn qua đúng quy tắc chống trùng của hệ thống.
// Trạng thái hội thoại lưu trong bộ nhớ 20 phút (không cần bảng mới).
const rules = require('./bookingRules');
const reservationService = require('./reservationService');
const tableService = require('./tableService');
const db = require('../db');
const { getSettings, getOpeningHours } = require('../settings');
const config = require('../config');

const TTL_MS = 20 * 60 * 1000;
const sessions = new Map();

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s:/\-+.]/g, ' ').replace(/\s+/g, ' ').trim();
}

const WORD_NUM = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const WEEKDAY = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const fmtDate = (d) => `${WEEKDAY[rules.isoDayOfWeek(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

// ---------- Tách thông tin từ câu chat ----------
function takeDate(n, today, opts = {}) {
  let m;
  if ((m = /\b(hom nay|toi nay|trua nay|chieu nay|bua nay|ngay nay)\b/.exec(n))) return { date: today, rest: n.replace(m[0], ' ') };
  if ((m = /\b(ngay kia|ngay mot)\b/.exec(n))) return { date: rules.addDays(today, 2), rest: n.replace(m[0], ' ') };
  if ((m = (opts.bareMai === false ? /\b(ngay mai)\b/ : /\b(ngay mai|mai)\b/).exec(n))) return { date: rules.addDays(today, 1), rest: n.replace(m[0], ' ') };
  if ((m = /\b(chu nhat|cn)\b/.exec(n))) return { date: nextDow(today, 7), rest: n.replace(m[0], ' ') };
  if ((m = /\bthu\s*([2-7])\b/.exec(n))) return { date: nextDow(today, Number(m[1]) - 1), rest: n.replace(m[0], ' ') };
  if ((m = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/.exec(n))) {
    const d = fromDM(Number(m[1]), Number(m[2]), today);
    if (d) return { date: d, rest: n.replace(m[0], ' ') };
  }
  if ((m = /\b(?:ngay\s*)?(\d{1,2})\s*thang\s*(\d{1,2})\b/.exec(n))) {
    const d = fromDM(Number(m[1]), Number(m[2]), today);
    if (d) return { date: d, rest: n.replace(m[0], ' ') };
  }
  if ((m = /\bngay\s*(\d{1,2})\b/.exec(n))) {
    const day = Number(m[1]); let [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    let d = fromDM(day, mo, today);
    if (!d || d < today) { mo += 1; if (mo > 12) { mo = 1; y += 1; } d = fromDM(day, mo, today, y); }
    if (d) return { date: d, rest: n.replace(m[0], ' ') };
  }
  return { date: null, rest: n };
}
function nextDow(today, dow) {
  for (let i = 0; i < 7; i += 1) { const d = rules.addDays(today, i); if (rules.isoDayOfWeek(d) === dow) return d; }
  return today;
}
function fromDM(day, month, today, yearOverride) {
  let y = yearOverride || Number(today.slice(0, 4));
  let s = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!rules.isValidDate(s)) return null;
  if (!yearOverride && s < today) { y += 1; s = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; if (!rules.isValidDate(s)) return null; }
  return s;
}

function applyPeriod(h, period) {
  if (period === 'toi' || period === 'chieu' || period === 'dem') return h < 12 ? h + 12 : h;
  if (period === 'trua') return h >= 1 && h <= 4 ? h + 12 : h;
  if (period === 'sang') return h;
  return h >= 1 && h <= 9 ? h + 12 : h; // nhà hàng mở từ 10:30 nên "7h" là 19:00
}
function takeTime(n) {
  let m = /\b(\d{1,2})\s*(?::|h|gio|g)\s*(\d{2})?(?!\d)\s*(sang|trua|chieu|toi|dem)?/.exec(n);
  let h, min, period;
  if (m) { h = Number(m[1]); min = m[2] ? Number(m[2]) : 0; period = m[3]; }
  else if ((m = /\b(\d{1,2})\s*(sang|trua|chieu|toi|dem)\b/.exec(n))) { h = Number(m[1]); min = 0; period = m[2]; }
  else return { time: null, rest: n, period: null };
  if (h > 23 || min > 59) return { time: null, rest: n, period: null };
  h = applyPeriod(h, period);
  return { time: rules.formatTime(h * 60 + min), rest: n.replace(m[0], ' '), period: period || null };
}
function takeParty(n) {
  let m = /\b(\d{1,2})\s*(?:nguoi|khach|pax|suat)\b/.exec(n);
  if (m) return { party: Number(m[1]), rest: n.replace(m[0], ' ') };
  m = /\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:nguoi|khach)\b/.exec(n);
  if (m) return { party: WORD_NUM[m[1]], rest: n.replace(m[0], ' ') };
  m = /\b(?:cho|ban|nhom)\s*(\d{1,2})\b(?!\s*(?::|h\b|g\b|gio|\/|-|\d))/.exec(n);
  if (m) return { party: Number(m[1]), rest: n.replace(m[0], ' ') };
  return { party: null, rest: n };
}
function takeContact(original) {
  let text = original;
  let phone = null;
  const pm = /(?:\+?84|0)[\d\s.\-]{8,13}\d/.exec(text);
  if (pm) { try { phone = rules.normalizePhone(pm[0]); text = text.replace(pm[0], ' '); } catch { /* không phải số điện thoại */ } }
  const cleaned = text.replace(/\b(tên|ten|họ tên|ho ten|tôi tên là|mình tên là|em tên là|sđt|sdt|số điện thoại|so dien thoai|điện thoại|dt|là|la|số|so)\b[:.]?/gi, ' ')
    .replace(/[,;:.]/g, ' ').replace(/\s+/g, ' ').trim();
  const letters = /^[\p{L}\s'’-]{2,60}$/u.test(cleaned) && !/\d/.test(cleaned);
  return { phone, name: letters ? cleaned : null };
}

const CONFIRM = /^(ok|oke|okay|dong y|xac nhan|chot|dung roi|vang|da|yes|y|duoc|ok nhe|ok em|ok ban|chot nhe)\b/;
const BOOK_INTENT = /\b(dat ban|dat cho|giu ban|giu cho|book|booking|dat truoc|con ban|con cho)\b/;
const MAP_INTENT = /\b(so do|xem ban|xem cho|hinh ban|vi tri ban|chon ban|ban nao|ban trong|ban con trong)\b/;
const CHANGE_TABLE = /\b(doi ban|ban khac|doi cho|cho khac|chon lai ban)\b/;
const TABLE_CODE = /\bban\s*([a-z]\d{1,2})\b/;

// Lượt đặt từ fanpage bắt buộc có người tạo (ràng buộc của cơ sở dữ liệu), nên bot dùng một tài khoản hệ thống
// không đăng nhập được (khóa sẵn, mật khẩu không hợp lệ). Tài khoản tự tạo ở lần đặt bàn đầu tiên.
let botStaffId = null;
async function getBotStaff() {
  if (botStaffId) return botStaffId;
  let r = await db.query("SELECT id FROM staff WHERE username = 'bot_fanpage'");
  if (r.rowCount === 0) {
    r = await db.query(
      `INSERT INTO staff (username, password_hash, full_name, role_id, is_active)
       SELECT 'bot_fanpage', '!', 'Bot đặt bàn (chatbot)', id, false FROM roles WHERE code = 'fanpage_staff'
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`);
  }
  botStaffId = r.rows[0].id;
  return botStaffId;
}

// ---------- Hội thoại ----------
function getSession(id) {
  const s = sessions.get(id);
  if (s && Date.now() - s.ts < TTL_MS) return s;
  sessions.delete(id);
  return null;
}

async function nearestSlots(date, time, party, settings, hours) {
  const slots = rules.slotsForDate(date, hours, settings);
  const want = rules.parseTime(time);
  const withDist = [];
  for (const t of slots) {
    const start = `${date} ${t}:00+07`;
    if (await tableService.countAvailable({ start, holdMinutes: settings.hold_minutes, party }) > 0) {
      withDist.push({ t, d: Math.abs(rules.parseTime(t) - want) });
    }
  }
  return withDist.sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.t).sort();
}

// Danh sách bàn còn trống đúng giờ, đúng số khách (xếp theo tầng, số chỗ, mã bàn).
async function freeTables(s, settings, hours) {
  const start = rules.validateSlot(s.date, s.time, settings, hours);
  const { tables } = await tableService.getTableMap({ start, holdMinutes: settings.hold_minutes, party: s.party });
  const free = tables.filter((t) => t.selectable).sort((a, b) => a.floor - b.floor || a.capacity - b.capacity || a.code.localeCompare(b.code));
  return { start, free };
}

// Chọn bàn: ưu tiên bàn khách yêu cầu (nếu còn trống), bỏ qua các bàn khách đã bảo đổi, còn lại chọn bàn vừa chỗ nhất.
async function findTable(s, settings, hours) {
  const { start, free } = await freeTables(s, settings, hours);
  const byCap = [...free].sort((a, b) => a.capacity - b.capacity || a.code.localeCompare(b.code));
  let table = null; let miss = null; let chosen = false;
  if (s.wantCode) {
    table = free.find((t) => t.code.toLowerCase() === s.wantCode) || null;
    if (table) chosen = true; else miss = s.wantCode;
    s.wantCode = null;
  }
  if (!table) table = byCap.find((t) => !(s.skip || []).includes(t.code)) || null;
  if (!table && byCap.length && (s.skip || []).length) { s.skip = []; table = byCap.find((t) => t.code === s.prevCode) || byCap[0]; }
  return { start, table, free, miss, chosen };
}

const publicBase = () => config.publicUrl || 'https://gyusachi.vn';
// Danh sách bàn còn trống theo tầng + đường dẫn mở sơ đồ bàn trên website (đã điền sẵn ngày, giờ, số khách).
function tableListText(free, s) {
  const byFloor = {};
  for (const t of free) (byFloor[t.floor] = byFloor[t.floor] || []).push(`${t.code.toUpperCase()} (${t.capacity} chỗ)`);
  const lines = Object.keys(byFloor).sort().map((f) => `• Tầng ${f}: ${byFloor[f].slice(0, 10).join(', ')}${byFloor[f].length > 10 ? '…' : ''}`);
  const link = `${publicBase()}/book.html?date=${s.date}&time=${s.time}&party=${s.party}`;
  return `Các bàn còn trống lúc ${s.time} ${fmtDate(s.date)} cho ${s.party} khách:\n${lines.join('\n')}\nAnh/chị nhắn "bàn ${(free[0] || { code: 'a2' }).code.toUpperCase()}" để chọn bàn đó, hoặc nhắn "đổi bàn" để em gợi ý bàn khác. Muốn xem sơ đồ và chọn bàn trực tiếp: ${link}`;
}

// Gộp các giờ liên tiếp thành khoảng, ví dụ "10:30–13:00 và 16:30–21:00".
function slotRanges(slots, step) {
  const out = []; let from = null; let prev = null;
  for (const t of slots) {
    const m = rules.parseTime(t);
    if (from === null) { from = t; } else if (m - prev > step) { out.push(`${from}–${rules.formatTime(prev)}`); from = t; }
    prev = m;
  }
  if (from !== null) out.push(`${from}–${rules.formatTime(prev)}`);
  return out.join(' và ');
}
const phoneFmt = (p) => String(p).replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

const SIGN = 'Gyu Sachi Yakiniku xin cảm ơn.';
const THANKS = /\b(cam on|cam on nhieu|cam on nha|cam on ban|thanks|thank you|thank|tks|thank u|bye|tam biet)\b/;

// Chuyển lỗi kiểm tra của hệ thống thành câu trả lời lịch sự, rõ ràng cho khách.
function politeError(e, settings) {
  return `${politeErrorBody(e, settings)} ${SIGN}`;
}
function politeErrorBody(e, settings) {
  const hot = phoneFmt(settings.hotline);
  switch (e.code) {
    case 'DATE_TOO_FAR': {
      const last = rules.addDays(rules.vnNow().date, settings.booking_window_days);
      return `Dạ hiện nhà hàng nhận đặt bàn trước tối đa ${settings.booking_window_days} ngày, tức đến hết ${fmtDate(last)}. Anh/chị vui lòng chọn một ngày trong khoảng này, hoặc liên hệ hotline ${hot} để được hỗ trợ ạ.`;
    }
    case 'DATE_IN_PAST':
      return 'Dạ anh/chị vui lòng chọn ngày khác vì ngày này đã qua nên không thể đặt bàn được ạ.';
    case 'INVALID_DATE':
      return 'Dạ em chưa hiểu rõ ngày anh/chị muốn đặt. Anh/chị vui lòng nhắn lại theo dạng "ngày mai", "thứ Bảy" hoặc "15/10" giúp em nhé ạ.';
    case 'INVALID_PARTY':
      return 'Dạ anh/chị cho em xin số lượng khách (ví dụ "4 người") để em kiểm tra bàn phù hợp nhé ạ.';
    case 'PARTY_TOO_LARGE':
      return `Dạ với nhóm trên ${settings.max_online_party_size} khách, nhà hàng cần sắp xếp riêng. Anh/chị vui lòng liên hệ hotline ${hot} để được hỗ trợ tốt nhất ạ.`;
    case 'INVALID_PHONE':
      return 'Dạ số điện thoại chưa đúng định dạng. Anh/chị vui lòng gửi lại số gồm 10 chữ số (ví dụ 0905 123 456) giúp em nhé ạ.';
    case 'INVALID_NAME':
      return 'Dạ anh/chị vui lòng cho em xin họ tên để em ghi nhận đặt bàn nhé ạ.';
    case 'INVALID_TIME':
      return 'Dạ nhà hàng không nhận khách vào giờ này. Anh/chị vui lòng chọn giờ khác trong khung giờ mở cửa giúp em nhé ạ.';
    default:
      return `Dạ ${e.message}. Anh/chị vui lòng kiểm tra lại giúp em nhé ạ.`;
  }
}

const summary = (s) => `• ${s.party} khách\n• ${fmtDate(s.date)}, ${s.time}\n• Bàn ${s.tableCode.toUpperCase()} (tầng ${s.floor})\n• ${s.name} – ${s.phone}`;

async function handle(senderId, rawText, opts = {}) {
  const original = String(rawText || '').trim();
  let n = norm(original);
  let s = getSession(senderId);
  const tableCodeM = TABLE_CODE.exec(n);
  const wantChange = CHANGE_TABLE.test(n);
  const wantMap = MAP_INTENT.test(n);
  const tableTalk = wantChange || wantMap || !!tableCodeM;
  const intent = BOOK_INTENT.test(n) || tableTalk;

  if (s && /\b(huy|thoi|khong dat|bo qua|thoat)\b/.test(n) && !CONFIRM.test(n)) {
    sessions.delete(senderId);
    return { text: 'Dạ em đã hủy yêu cầu đặt bàn. Khi cần anh/chị cứ nhắn "đặt bàn" để em hỗ trợ lại nhé ạ. ' + SIGN };
  }

  const settings = await getSettings();
  const hours = await getOpeningHours();
  const today = rules.vnNow().date;

  // Tách thông tin mới trong câu.
  let rest = n;
  // "Mai" viết hoa đi cùng tên người (Mai Linh, Thị Mai) hoặc đang hỏi họ tên thì là tên, không phải "ngày mai".
  const nameMai = /(?:\p{Lu}[\p{L}]*\s+Mai\b)|(?:\bMai\s+\p{Lu})/u.test(original);
  const dt = takeDate(rest, today, { bareMai: !(nameMai || (s && s.stage === 'contact')) }); rest = dt.rest;
  const tm = takeTime(rest); rest = tm.rest;
  const pt = takeParty(rest); rest = pt.rest;
  let found = { date: dt.date, time: tm.time, party: pt.party };
  // Câu trả lời chỉ là một con số: hiểu theo câu hỏi trước đó.
  if (s && /^\d{1,2}$/.test(n) && !found.party && !found.time) {
    if (s.asking === 'party') found.party = Number(n);
    else if (s.asking === 'time') found.time = rules.formatTime(applyPeriod(Number(n), null) * 60);
  }
  const contact = s && (s.stage === 'contact' || s.stage === 'confirm' || (s.date && s.time && s.party)) ? takeContact(original) : { phone: null, name: null };
  const gotSlot = found.date || found.time || found.party;
  const isConfirm = !!s && s.stage === 'confirm' && CONFIRM.test(n) && !gotSlot;

  // Khách cảm ơn hoặc chào tạm biệt khi không đang đặt bàn dở: đáp lại lịch sự.
  if ((!s || s.stage === 'slots' && !s.party && !s.date && !s.time) && THANKS.test(n) && !intent && !gotSlot) {
    sessions.delete(senderId);
    return { text: `Dạ không có chi ạ! Cảm ơn anh/chị đã quan tâm đến nhà hàng. Cần hỗ trợ thêm anh/chị cứ nhắn cho em nhé, hẹn gặp anh/chị tại nhà hàng ạ. ${SIGN}` };
  }

  if (!s) {
    if (!intent && !(gotSlot && /\b(ban|cho)\b/.test(n))) return null; // không phải yêu cầu đặt bàn: để kịch bản từ khóa xử lý
    s = { stage: 'slots', ts: Date.now(), channel: opts.channel || 'fanpage' };
    sessions.set(senderId, s);
  }
  s.ts = Date.now();

  if (isConfirm) return finish(senderId, s, settings, hours);

  // Khách muốn chọn bàn theo mã, đổi bàn khác hoặc xem sơ đồ bàn.
  if (tableCodeM) s.wantCode = tableCodeM[1];
  if (wantMap) s.wantMap = true;
  if (s.tableCode && !gotSlot && (wantChange || (tableCodeM && tableCodeM[1] !== s.tableCode.toLowerCase()))) {
    if (wantChange) s.skip = [...(s.skip || []), s.tableCode];
    s.prevCode = s.tableCode; s.tableCode = null; s.stage = 'slots'; s.changing = true;
  }

  if (found.party) s.party = found.party;
  if (found.date) s.date = found.date;
  if (found.time) s.time = found.time;
  if (contact.phone) s.phone = contact.phone;
  if (contact.name && !gotSlot && !tableTalk) s.name = contact.name;
  if (gotSlot) { s.stage = 'slots'; s.tableCode = null; s.skip = []; s.changing = false; }

  // Kiểm tra từng phần.
  if (s.party != null) {
    try { rules.validateParty(s.party, settings); } catch (e) { s.party = null; s.asking = 'party'; return { text: politeError(e, settings) }; }
  }
  if (s.date) {
    try { rules.validateDate(s.date, settings); } catch (e) { s.date = null; s.asking = 'date'; return { text: politeError(e, settings) }; }
  }
  if (s.date && s.time) {
    const ok = rules.slotsForDate(s.date, hours, settings).includes(s.time);
    if (!ok) {
      const slots = rules.slotsForDate(s.date, hours, settings);
      s.time = null; s.asking = 'time';
      if (slots.length === 0) { s.date = null; s.asking = 'date'; return { text: 'Dạ ngày này nhà hàng không còn giờ nhận khách. Anh/chị chọn giúp em ngày khác nhé ạ. ' + SIGN }; }
      const sample = slotRanges(slots, settings.slot_step_minutes);
      return { text: `Dạ ${fmtDate(s.date)} nhà hàng nhận khách trong khung giờ ${sample} (cách nhau 30 phút). Anh/chị muốn đến lúc nào ạ?` };
    }
  }

  // Còn thiếu gì thì hỏi.
  const missing = [];
  if (!s.party) missing.push('party');
  if (!s.date) missing.push('date');
  if (!s.time) missing.push('time');
  if (missing.length) {
    s.asking = missing[0];
    const label = { party: 'số người', date: 'ngày (ví dụ "mai", "thứ 7", "15/10")', time: 'giờ (ví dụ "19h", "7h tối")' };
    const known = [s.party && `${s.party} khách`, s.date && fmtDate(s.date), s.time && s.time].filter(Boolean);
    return { text: `${known.length ? `Dạ em ghi nhận ${known.join(', ')}. ` : 'Dạ em hỗ trợ đặt bàn ngay ạ. '}Anh/chị cho em xin ${missing.map((k) => label[k]).join(' và ')} nhé.` };
  }

  // Khách chỉ muốn xem bàn trống (chưa đổi bàn): gửi danh sách và đường dẫn sơ đồ.
  if (s.tableCode && s.wantMap && !s.changing) {
    const { free } = await freeTables(s, settings, hours);
    s.wantMap = false;
    return { text: `Dạ hiện em đang xếp bàn ${s.tableCode.toUpperCase()} (tầng ${s.floor}) cho anh/chị. ${tableListText(free, s)}` };
  }

  // Đủ số khách, ngày, giờ: tìm bàn.
  let pre = '';
  if (!s.tableCode) {
    const { table, free, miss, chosen } = await findTable(s, settings, hours);
    if (!table) {
      const alt = await nearestSlots(s.date, s.time, s.party, settings, hours);
      const t0 = s.time; s.time = null; s.asking = 'time';
      if (alt.length) return { text: `Dạ rất tiếc, lúc ${t0} ${fmtDate(s.date)} đã hết bàn cho ${s.party} khách. Các giờ còn bàn gần nhất: ${alt.join(', ')}. Anh/chị chọn giờ nào ạ?` };
      s.date = null; s.asking = 'date';
      return { text: `Dạ rất tiếc, ngày đó đã hết bàn cho ${s.party} khách. Anh/chị chọn giúp em ngày khác nhé, hoặc gọi hotline ${phoneFmt(settings.hotline)} ạ. ${SIGN}` };
    }
    s.tableId = table.id; s.tableCode = table.code; s.floor = table.floor; s.stage = 'contact';
    const label = `bàn ${table.code.toUpperCase()} (tầng ${table.floor})`;
    if (miss) pre += `Dạ bàn ${miss.toUpperCase()} giờ đó không còn trống hoặc không đủ chỗ, em xếp ${label} thay thế ạ. `;
    else if (chosen) pre += `Dạ em chọn ${label} theo ý anh/chị ạ. `;
    else if (s.changing) pre += table.code === s.prevCode ? `Dạ giờ này chỉ còn đúng ${label} thôi ạ. ` : `Dạ em đã đổi sang ${label} ạ. `;
    if (miss || s.changing || s.wantMap) pre += `\n${tableListText(free, s)}\n`;
    s.changing = false; s.wantMap = false; s.prevCode = null;
  }

  if (!s.name || !s.phone) {
    s.asking = 'contact';
    const need = !s.name && !s.phone ? 'họ tên và số điện thoại' : !s.name ? 'họ tên' : 'số điện thoại';
    return { text: pre ? `${pre}\nAnh/chị cho em xin ${need} để giữ bàn ạ.` : `Dạ còn bàn ${s.tableCode.toUpperCase()} (tầng ${s.floor}) cho ${s.party} khách, ${fmtDate(s.date)} lúc ${s.time}. Anh/chị cho em xin ${need} để giữ bàn ạ.` };
  }

  s.stage = 'confirm';
  return { text: `${pre ? `${pre}\n` : ''}Dạ em xin xác nhận thông tin đặt bàn:\n${summary(s)}\nAnh/chị nhắn "ok" để em chốt giữ bàn nhé, hoặc nhắn lại phần cần đổi. Nhắn "hủy" để dừng ạ.` };
}

async function finish(senderId, s, settings, hours) {
  try {
    const start = rules.validateSlot(s.date, s.time, settings, hours);
    const r = await reservationService.create({
      source: 'staff', channel: s.channel || 'fanpage', tableId: s.tableId, party: s.party, start, holdMinutes: settings.hold_minutes,
      note: s.channel === 'website' ? 'Đặt qua chatbot trên website' : 'Đặt qua chatbot fanpage', lockToken: null,
      customer: { name: rules.validateName(s.name), phone: rules.normalizePhone(s.phone) },
      staffUser: { id: await getBotStaff() }, externalUserId: senderId,
      rawRequest: { bot: true, party: s.party, date: s.date, time: s.time, tableId: s.tableId },
    });
    sessions.delete(senderId);
    return { text: `Dạ em đã giữ bàn thành công ạ!\nMã đặt bàn: ${r.bookingCode}\n${summary(s)}\nBàn được giữ ${settings.hold_minutes} phút kể từ giờ hẹn. Anh/chị tra cứu hoặc hủy trên website bằng số điện thoại và mã đặt bàn. Hẹn gặp anh/chị tại nhà hàng ạ!\nGyu Sachi Yakiniku xin chân thành cảm ơn anh/chị đã đặt bàn.`, bookingCode: r.bookingCode };
  } catch (e) {
    if (e.status === 409 || e.code === '23P01') {
      // Bàn vừa bị người khác đặt: tìm lại.
      s.tableCode = null; s.stage = 'slots';
      const { table } = await findTable(s, settings, hours).catch(() => ({ table: null }));
      if (table) {
        s.tableId = table.id; s.tableCode = table.code; s.floor = table.floor; s.stage = 'confirm';
        return { text: `Dạ bàn vừa được khách khác đặt mất rồi ạ. Em đổi sang bàn ${table.code.toUpperCase()} (tầng ${table.floor}) cùng giờ nhé. Anh/chị nhắn "ok" để em chốt ạ.` };
      }
      const alt = await nearestSlots(s.date, s.time, s.party, settings, hours);
      s.time = null; s.asking = 'time';
      return { text: alt.length ? `Dạ giờ đó vừa hết bàn ạ. Các giờ còn bàn: ${alt.join(', ')}. Anh/chị chọn giờ nào ạ?` : `Dạ ngày đó vừa hết bàn, anh/chị gọi hotline ${phoneFmt(settings.hotline)} giúp em nhé ạ. ${SIGN}` };
    }
    if (e.status && e.status < 500) { s.stage = 'contact'; if (/điện thoại/.test(e.message)) s.phone = null; if (/họ tên/.test(e.message)) s.name = null; return { text: politeError(e, settings) }; }
    throw e;
  }
}

module.exports = { handle, _parse: { takeDate, takeTime, takeParty, takeContact, norm } };