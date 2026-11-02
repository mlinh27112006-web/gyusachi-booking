// Tạo bảng và nạp dữ liệu mẫu vào PostgreSQL bằng Node.js (không cần cài psql).
// Chạy một lần:  npm run db:init
// Thêm tham số --no-seed để chỉ tạo bảng, không nạp tài khoản mẫu.
// Cảnh báo: chạy lại trên CSDL đã có dữ liệu sẽ báo lỗi "already exists" (an toàn, không xóa gì).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
// Chọn CSDL: nếu bạn gõ DATABASE_URL trong PowerShell thì dùng đúng địa chỉ đó (ưu tiên cao nhất, kể cả khi .env có DB_NAME);
// nếu không thì theo .env như khi chạy server. Luôn in ra đang nối tới đâu để tránh chạy nhầm vào CSDL khác.
const fromShell = !!process.env.DATABASE_URL;
require('dotenv').config();
const url = process.env.DATABASE_URL;
const parts = !fromShell && process.env.DB_NAME ? { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 5432, user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME } : null;
if (!url && !parts) { console.error('Thiếu DATABASE_URL (hoặc DB_NAME...) trong .env hoặc dòng lệnh.'); process.exit(1); }
const ssl = /^(1|true|yes)$/i.test(process.env.DATABASE_SSL || '') ? { rejectUnauthorized: false } : undefined;
function target() {
  if (parts) return `${parts.host}:${parts.port}/${parts.database} (từ .env)`;
  try { const u = new URL(url); return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname} (từ ${fromShell ? 'dòng lệnh' : '.env'})`; } catch (e) { return '(DATABASE_URL không đọc được)'; }
}
console.log('Kết nối tới:', target(), '| SSL:', ssl ? 'bật' : 'tắt');
const files = ['schema.sql'];
if (!process.argv.includes('--no-seed')) files.push('seed.sql');

(async () => {
  const client = new Client({ ...(parts || { connectionString: url }), ssl });
  await client.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8');
      console.log('Đang chạy', f, '...');
      await client.query(sql);
      console.log('  xong', f);
    }
    const r = await client.query('SELECT count(*)::int AS n FROM dining_tables');
    console.log('Hoàn tất. Số bàn trong CSDL:', r.rows[0].n);
  } catch (e) {
    console.error('Lỗi:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
