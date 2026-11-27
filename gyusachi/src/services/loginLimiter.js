// Khóa tạm đăng nhập: sai MAX_FAILS lần liên tiếp thì khóa LOCK_MS.
// Tính theo tên đăng nhập, lưu trong bộ nhớ (khởi động lại server là xóa sạch).
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

const attempts = new Map(); // tên đăng nhập (chữ thường) -> { fails, lastFail, lockedUntil }

const keyOf = (username) => String(username).trim().toLowerCase();

// Còn bị khóa bao nhiêu mili giây (0 nếu không bị khóa).
function remainingLockMs(username, now = Date.now()) {
  const key = keyOf(username);
  const entry = attempts.get(key);
  if (!entry || !entry.lockedUntil) return 0;
  if (entry.lockedUntil <= now) {
    attempts.delete(key);
    return 0;
  }
  return entry.lockedUntil - now;
}

function recordFailure(username, now = Date.now()) {
  if (attempts.size >= MAX_ENTRIES) attempts.clear(); // tránh đầy bộ nhớ khi bị dò tên đăng nhập
  const key = keyOf(username);
  const entry = attempts.get(key) || { fails: 0, lastFail: now, lockedUntil: 0 };
  // Sai từ lâu rồi thì đếm lại từ đầu.
  if (now - entry.lastFail > LOCK_MS) entry.fails = 0;
  entry.fails += 1;
  entry.lastFail = now;
  if (entry.fails >= MAX_FAILS) {
    entry.lockedUntil = now + LOCK_MS;
    entry.fails = 0;
  }
  attempts.set(key, entry);
}

function reset(username) {
  attempts.delete(keyOf(username));
}

module.exports = { remainingLockMs, recordFailure, reset, MAX_FAILS, LOCK_MS };
