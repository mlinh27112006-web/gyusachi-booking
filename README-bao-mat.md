# Bản vá: header bảo mật, giới hạn đăng nhập admin, chống lạm dụng thời gian thực, truy vấn giờ trống gộp, nhãn truy cập
Giải nén đè lên thư mục dự án rồi `npm.cmd start`. Cần áp dụng sau bản chống spam (gyusachi-patch-chongspam.zip); i18n.js ở đây đã gồm cả hai.
- Header bảo mật (src/middleware/securityHeaders.js): nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy, HSTS khi chạy https, và CSP.
  Nếu CSP chặn nhầm tài nguyên của trang (xem Console trình duyệt), đặt biến môi trường CSP=off trên Render để tắt riêng CSP rồi báo lại.
- Đăng nhập admin: tối đa 20 lần mỗi 10 phút cho mỗi IP (ngoài khóa 5 lần theo tên đăng nhập).
- /api/stream: mỗi IP tối đa 8 kết nối thời gian thực; đăng nhập và tra cứu mã không còn phát tín hiệu cho mọi trình duyệt.
- /api/availability: một truy vấn cho cả ngày (có dự phòng về cách cũ nếu lỗi).
- config.js: cảnh báo JWT_SECRET dưới 32 ký tự khi NODE_ENV=production.
- server.js: trust proxy, tắt x-powered-by, trang 404 thân thiện, tắt gọn khi Render gửi SIGTERM, không sập vì lỗi lọt lưới.
- book.html + i18n.js: nút +/- số khách có nhãn đọc được ("Giảm số khách"/"Tăng số khách", có bản tiếng Anh).
