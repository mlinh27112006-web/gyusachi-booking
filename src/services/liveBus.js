// Kênh sự kiện thời gian thực (Server-Sent Events). Chỉ gửi tín hiệu "có thay đổi", KHÔNG gửi dữ liệu khách;
// trình duyệt nhận tín hiệu rồi tự tải lại sơ đồ/danh sách qua API (API vẫn kiểm tra quyền như thường).
const clients = new Set();
const perIp = new Map(); // IP -> số kết nối đang mở
const MAX_PER_IP = 8;
let timer = null;

function connect(req, res) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'; // IP thật theo 'trust proxy'
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) { res.writeHead(429, { 'Retry-After': '30' }); res.end(); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\nevent: hello\ndata: {}\n\n');
  if (clients.size >= 500) { res.end(); return; }
  clients.add(res); perIp.set(ip, (perIp.get(ip) || 0) + 1);
  req.on('close', () => {
    clients.delete(res);
    const n = (perIp.get(ip) || 1) - 1; if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
  });
}

// Gộp nhiều thay đổi sát nhau thành một tín hiệu.
function changed() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const r of clients) { try { r.write(`event: changed\ndata: ${Date.now()}\n\n`); } catch (e) { clients.delete(r); } }
  }, 150);
}

// Nhịp tim 25 giây để proxy (Render) không cắt kết nối rỗng.
setInterval(() => { for (const r of clients) { try { r.write(': ping\n\n'); } catch (e) { clients.delete(r); } } }, 25000).unref();

module.exports = { connect, changed, count: () => clients.size };
