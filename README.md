# Gyu Sachi Yakiniku - Hệ thống đặt bàn đa kênh

Node.js (Express) + PostgreSQL, giao diện HTML/CSS/JavaScript thuần.

## Yêu cầu
- Node.js 18 trở lên
- PostgreSQL 14 trở lên (đã tạo database `gyusachi` và chạy `db/schema.sql`, `db/seed.sql`)

## Chạy dự án
1. Cài thư viện: `npm install`
2. Copy `.env.example` thành `.env`, sửa `DATABASE_URL` (mật khẩu PostgreSQL của bạn) và `JWT_SECRET`.
3. Chạy: `npm run dev` (tự khởi động lại khi sửa code) hoặc `npm start`.
4. Mở http://localhost:3000/api/health. Thấy `"ok": true` và `"tables": 18` là kết nối đúng.

## Cấu trúc thư mục
```
db/                 schema.sql, seed.sql
src/
  server.js         khởi động Express, các route chung
  config.js         đọc biến môi trường
  db.js             kết nối PostgreSQL, hàm giao dịch
  settings.js       đọc bảng settings
  errors.js         lỗi có mã HTTP
  middleware/       xác thực, phân quyền, xử lý lỗi
  routes/           các nhóm API (đặt bàn, đăng nhập, nhân viên...)
  services/         nghiệp vụ (tìm bàn, khóa mềm, đặt bàn...)
public/             trang khách
admin/              trang quản trị (đường dẫn /admin)
```

## Chính sách đặt bàn (hiển thị trên website và bot)
- **Thời gian dùng bàn:** 2 tiếng tính từ giờ hẹn (`settings.hold_minutes` = 120).
- **Giờ đến muộn nhất để đặt:** ca trưa 13:00, ca tối 21:00 (thứ Bảy, Chủ nhật 21:00), tức 60 phút trước giờ đóng cửa ca.
- **Khách đến trễ:** nhà hàng giữ bàn tối đa 30 phút sau giờ hẹn; quá 30 phút lượt đặt có thể bị hủy để nhường bàn. Màn quản trị hiện "quá 30 phút giữ bàn, có thể nhả bàn" cạnh lượt trễ; nhân viên bấm "Không đến" để nhả bàn.
- **Đổi giờ/bàn/số khách:** chưa đổi trực tiếp trên web; khách đặt lượt mới rồi hủy lượt cũ, hoặc gọi hotline.
- **Buffet trưa 219K:** chỉ áp dụng ca trưa 10:30–14:00; các mức từ 269K dùng được cả trưa và tối.
- **Đi 4 tính 3:** buffet từ 349K, thứ Hai đến thứ Năm cả ngày, thứ Sáu đến Chủ nhật đến 16:00; không áp dụng ngày lễ chính thức của Nhà nước. Ví dụ: 4 khách buffet 349K trả 3 suất = 1.047.000đ.
- **Chống dò mã đặt bàn:** tra cứu/hủy sai 5 lần (tính theo IP và theo số điện thoại) thì khóa tạm 10 phút (`bookingController.js`, lưu trong bộ nhớ).

## Kiểm thử chống đặt trùng
- `node tests/concurrency.test.js` (đặt `BASE_URL` nếu không chạy ở `http://localhost:3000`): 20 yêu cầu cùng giữ một bàn (đúng 1 thành công), đặt trùng, giờ giao nhau, quá khứ, quá xa, vượt sức chứa, sai số điện thoại, hủy lượt đã xử lý, khóa khi nhập sai. Dùng số điện thoại thử 0900000001 và tự hủy lượt thử.
- `psql "$DATABASE_URL" -f tests/db-exclusion.sql`: chứng minh ràng buộc ở tầng cơ sở dữ liệu (EXCLUDE chống trùng, trigger sức chứa, trạng thái cuối không đổi lại, nhật ký chỉ thêm). Chạy trong giao dịch và ROLLBACK, không để lại dữ liệu.
