const { Pool } = require('pg');
const config = require('./config');

// Một số nhà cung cấp (Render dùng địa chỉ ngoài, Neon, Supabase...) bắt buộc SSL.
// Đặt DATABASE_SSL=true để bật; mặc định tắt (chạy trên máy cá nhân hoặc địa chỉ nội bộ).
const useSsl = /^(1|true|yes)$/i.test(process.env.DATABASE_SSL || '');
if (!config.db) {
  try { new URL(config.databaseUrl); } catch (e) {
    console.error('\nDATABASE_URL trong file .env không phải đường dẫn hợp lệ.');
    console.error('Đúng dạng:  postgres://TEN_USER:MAT_KHAU@localhost:5432/TEN_DATABASE');
    console.error('Thường do mật khẩu có ký tự đặc biệt (@ # / : %), có dấu ngoặc kép hoặc khoảng trắng.');
    console.error('Cách dễ nhất: xóa dòng DATABASE_URL và điền 5 dòng DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (xem .env.example).\n');
    process.exit(1);
  }
}
const pool = new Pool({
  ...(config.db ? config.db : { connectionString: config.databaseUrl }),
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Lỗi kết nối PostgreSQL:', err.message);
});

// Chạy một câu lệnh đơn lẻ.
function query(text, params) {
  return pool.query(text, params);
}

// Chạy nhiều câu lệnh trong một giao dịch. Có lỗi ở bước nào thì rollback toàn bộ.
// Ví dụ: await withTransaction(async (client) => { await client.query(...); ... });
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
