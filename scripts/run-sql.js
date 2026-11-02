// Chạy một file .sql lên CSDL đang cấu hình (dùng cho file nâng cấp trong db/migrations, không cần cài psql).
// Ví dụ:  npm run db:run -- db/migrations/003_booking_code_phone.sql
// Dùng chung cấu hình với dự án: DATABASE_URL (hoặc DB_HOST, DB_NAME...) trong .env; thêm DATABASE_SSL=true nếu CSDL ở trên mạng.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const file = process.argv[2];
if (!file) { console.error('Thiếu tên file. Ví dụ: npm run db:run -- db/migrations/003_booking_code_phone.sql'); process.exit(1); }
const full = path.resolve(file);
if (!fs.existsSync(full)) { console.error('Không tìm thấy file:', full); process.exit(1); }

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

(async () => {
  const client = new Client({ ...(parts || { connectionString: url }), ssl });
  await client.connect();
  try {
    console.log('Đang chạy', path.basename(full), '...');
    await client.query(fs.readFileSync(full, 'utf8'));
    console.log('Hoàn tất.');
  } catch (e) {
    console.error('Lỗi:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
