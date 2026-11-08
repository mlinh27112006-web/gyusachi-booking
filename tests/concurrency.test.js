// Kiểm thử chống đặt trùng và tính nhất quán dữ liệu qua API thật (cần Node 18+, không cần cài thêm gói).
//   node tests/concurrency.test.js                       (mặc định http://localhost:3000)
//   BASE_URL=https://gyusachi-booking.onrender.com node tests/concurrency.test.js
// Script tạo 1 lượt đặt thử (khách "Khach Thu Nghiem", SĐT 0900000001) rồi tự hủy. Kiểm thử khóa khi nhập sai sẽ khóa
// tạm địa chỉ IP của máy đang chạy 10 phút ở chức năng tra cứu/hủy (đặt SKIP_LOCKOUT=1 để bỏ qua).
const crypto = require('crypto');
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TEST_PHONE = '0900000001';
const TEST_CODE_SUFFIX = TEST_PHONE.slice(-4);
const results = [];

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) { /* 204 hoặc không có nội dung */ }
  return { status: res.status, data };
}
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'ĐẠT  ' : 'LỖI  '} ${name}${detail ? '  → ' + detail : ''}`);
}
const vnToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function findSlot(party) {
  for (let i = 1; i <= 6; i += 1) {
    const date = addDays(vnToday(), i);
    const r = await call('GET', `/api/availability?date=${date}&party=${party}`);
    if (r.status !== 200) continue;
    const slot = r.data.slots.find((s) => s.available >= 1);
    if (slot) return { date, time: slot.time };
  }
  return null;
}

(async () => {
  console.log(`Kiểm thử tại ${BASE}\n`);
  const party = 2;
  const slot = await findSlot(party);
  if (!slot) { console.log('Không tìm được giờ trống trong 6 ngày tới để thử.'); process.exit(2); }
  const q = `date=${slot.date}&time=${slot.time}&party=${party}`;
  const map = await call('GET', `/api/tables/map?${q}`);
  const free = (map.data.tables || []).filter((t) => t.selectable);
  check('Sơ đồ bàn trả về danh sách bàn, có bàn còn trống', map.status === 200 && free.length > 0, `${slot.date} ${slot.time}, ${free.length} bàn trống`);
  const table = free[0];

  // 1. Nhiều người cùng giữ một bàn một lúc: đúng 1 người được, còn lại bị từ chối 409.
  const N = 20;
  const tokens = Array.from({ length: N }, () => crypto.randomUUID());
  const lockRes = await Promise.all(tokens.map((t) => call('POST', '/api/locks', { date: slot.date, time: slot.time, party, tableId: table.id, lockToken: t })));
  const won = lockRes.filter((r) => r.status === 201);
  const lost = lockRes.filter((r) => r.status === 409);
  check(`${N} yêu cầu cùng giữ bàn ${table.code.toUpperCase()}: đúng 1 thành công`, won.length === 1, `thành công ${won.length}, bị từ chối 409: ${lost.length}, khác: ${N - won.length - lost.length}`);
  check('Các yêu cầu còn lại bị từ chối bằng 409, không có lỗi máy chủ 5xx', lost.length === N - 1 && lockRes.every((r) => r.status < 500));
  const winnerToken = tokens[lockRes.findIndex((r) => r.status === 201)];

  // 2. Bàn đang được giữ thì sơ đồ của người khác hiện là không chọn được.
  const map2 = await call('GET', `/api/tables/map?${q}`);
  const t2 = (map2.data.tables || []).find((t) => t.id === table.id);
  check('Bàn đang bị giữ hiện không chọn được với khách khác', !!t2 && t2.selectable === false);

  // 3. Người giữ bàn hoàn tất đặt: có mã đặt bàn đúng định dạng, 4 số cuối khớp số điện thoại.
  const make = (extra) => call('POST', '/api/reservations', { name: 'Khach Thu Nghiem', phone: TEST_PHONE, party, date: slot.date, time: slot.time, tableId: table.id, lockToken: winnerToken, note: 'kiem thu tu dong', ...extra });
  const booked = await make();
  const code = booked.data && booked.data.bookingCode;
  check('Đặt bàn thành công (201) và có mã đặt bàn đúng dạng GYU-DDMM-xxxx', booked.status === 201 && /^GYU-\d{4}-\d{4}$/.test(code || '') && code.endsWith(TEST_CODE_SUFFIX), code);

  // 4. Đặt lại đúng bàn đó (kể cả dùng lại token) không được.
  const again = await make();
  check('Đặt lần hai vào cùng bàn cùng giờ bị từ chối (không trùng lịch)', again.status >= 400 && again.status < 500, `HTTP ${again.status}`);
  const lockAfter = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/api/locks', { date: slot.date, time: slot.time, party, tableId: table.id, lockToken: crypto.randomUUID() })));
  check('Sau khi đã đặt, 10 yêu cầu giữ cùng bàn đều bị từ chối', lockAfter.every((r) => r.status === 409), lockAfter.map((r) => r.status).join(','));
  const lockOverlap = await call('POST', '/api/locks', { date: slot.date, time: addHalfHour(slot.time), party, tableId: table.id, lockToken: crypto.randomUUID() });
  check('Giữ bàn ở giờ giao nhau trong 2 tiếng của lượt đã đặt cũng bị từ chối', lockOverlap.status === 409, `HTTP ${lockOverlap.status}`);

  // 5. Dữ liệu không hợp lệ.
  const past = await call('GET', `/api/tables/map?date=${addDays(vnToday(), -1)}&time=${slot.time}&party=2`);
  check('Không cho đặt bàn trong quá khứ', past.status === 400, past.data && past.data.code);
  const far = await call('GET', `/api/tables/map?date=${addDays(vnToday(), 60)}&time=${slot.time}&party=2`);
  check('Không cho đặt quá xa (vượt số ngày được đặt trước)', far.status === 400, far.data && far.data.code);
  const big = await call('GET', `/api/tables/map?${q.replace('party=2', 'party=9')}`);
  check('Không cho đặt online nhóm vượt giới hạn khách', big.status === 400, big.data && big.data.code);
  const small = ((await call('GET', `/api/tables/map?${q}`)).data.tables || []).find((t) => t.capacity < 6 && t.id !== table.id);
  if (small) {
    const over = await call('POST', '/api/locks', { date: slot.date, time: slot.time, party: 6, tableId: small.id, lockToken: crypto.randomUUID() });
    check(`Không cho giữ bàn ${small.code.toUpperCase()} (${small.capacity} chỗ) cho 6 khách vượt sức chứa`, over.status >= 400 && over.status < 500 && over.status !== 201, `HTTP ${over.status}`);
  } else { console.log('BỎ QUA  Không tìm thấy bàn nhỏ để thử vượt sức chứa'); }
  const badTime = await call('GET', `/api/tables/map?date=${slot.date}&time=03:00&party=2`);
  check('Không cho đặt giờ ngoài giờ mở cửa', badTime.status === 400, badTime.data && badTime.data.code);

  // 6. Tra cứu và hủy.
  const wrongPhone = await call('POST', '/api/reservations/lookup', { phone: '0911222333', code });
  check('Đúng mã đặt bàn nhưng sai số điện thoại: không tra cứu được (404)', wrongPhone.status === 404, `HTTP ${wrongPhone.status}`);
  const okLookup = await call('POST', '/api/reservations/lookup', { phone: TEST_PHONE, code });
  check('Đúng cả mã và số điện thoại: tra cứu được', okLookup.status === 200 && okLookup.data.bookingCode === code);
  const cancel1 = await call('POST', '/api/reservations/cancel', { phone: TEST_PHONE, code });
  check('Khách hủy lượt đặt thành công', cancel1.status === 200 && cancel1.data.status === 'cancelled', `HTTP ${cancel1.status}`);
  const cancel2 = await call('POST', '/api/reservations/cancel', { phone: TEST_PHONE, code });
  check('Hủy lại lượt đã xử lý bị từ chối (409)', cancel2.status === 409, `HTTP ${cancel2.status}`);
  const reLock = await call('POST', '/api/locks', { date: slot.date, time: slot.time, party, tableId: table.id, lockToken: crypto.randomUUID() });
  check('Sau khi hủy, bàn được trả lại và giữ được cho khách khác', reLock.status === 201, `HTTP ${reLock.status}`);
  if (reLock.status === 201 && reLock.data) await call('DELETE', `/api/locks/${reLock.data.lockToken || reLock.data.token || ''}`).catch(() => {});

  // 7. Khóa tạm khi nhập sai nhiều lần.
  if (!process.env.SKIP_LOCKOUT) {
    const tries = [];
    for (let i = 0; i < 7; i += 1) tries.push((await call('POST', '/api/reservations/lookup', { phone: '0933333333', code: 'GYU-1510-3333' })).status);
    check('Nhập sai nhiều lần liên tiếp bị khóa tạm (429)', tries.includes(429) && tries.indexOf(429) <= 5, tries.join(','));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nKết quả: ${results.length - failed.length}/${results.length} đạt.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('Không chạy được kiểm thử:', e.message); process.exit(2); });

function addHalfHour(t) { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 30; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }
