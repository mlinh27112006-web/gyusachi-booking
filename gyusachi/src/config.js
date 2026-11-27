require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường ${name}. Hãy copy .env.example thành .env rồi điền giá trị.`);
    process.exit(1);
  }
  return value;
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
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: '8h',
  fbVerifyToken: process.env.FB_VERIFY_TOKEN || '',
  fbAppSecret: process.env.FB_APP_SECRET || '',
  fbPageToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
  fbGraphUrl: (process.env.FB_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/+$/, ''),
};
