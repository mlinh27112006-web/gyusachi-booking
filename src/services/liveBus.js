// Kênh sự kiện thời gian thực (Server-Sent Events). Chỉ gửi tín hiệu "có thay đổi", KHÔNG gửi dữ liệu khách;
// trình duyệt nhận tín hiệu rồi tự tải lại sơ đồ/danh sách qua API (API vẫn kiểm tra quyền như thường).
const clients = new Set();
let timer = null;

function connect(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\nevent: hello\ndata: {}\n\n');
  if (clients.size >= 500) { res.end(); return; }
  clients.add(res);
  req.on('close', () => clients.delete(res));
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
