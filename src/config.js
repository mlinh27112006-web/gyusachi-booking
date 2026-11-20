require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường ${name}. Hãy copy .env.example thành .env rồi điền giá trị.`);
    process.exit(1);
  }
  return value;
}

// Khóa ký token quá ngắn thì dễ bị đoán: cảnh báo khi chạy thật (không chặn, để máy chủ vẫn khởi động được).
function checkSecret(s) {
  if (process.env.NODE_ENV === 'production' && s.length < 32) {
    console.warn('CẢNH BÁO: JWT_SECRET nên dài ít nhất 32 ký tự ngẫu nhiên.');
  }
  return s;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  // Cách 1: một chuỗi DATABASE_URL. Cách 2 (dễ hơn nếu mật khẩu có ký tự đặc biệt như @ # / %):
  // điền riêng DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, không cần mã hóa gì cả.
  databaseUrl: process.env.DB_NAME ? '' : required('DATABASE_URL'),
  db: process.env.DB_NAME ? {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  } : null,
  jwtSecret: checkSecret(required('JWT_SECRET')),
  jwtExpiresIn: '8h',
  // Địa chỉ công khai của website (bot dùng để gửi link sơ đồ bàn). Demo qua ngrok thì điền địa chỉ ngrok.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  fbVerifyToken: process.env.FB_VERIFY_TOKEN || '',
  fbAppSecret: process.env.FB_APP_SECRET || '',
  fbPageToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
  fbGraphUrl: (process.env.FB_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/+$/, ''),
};
