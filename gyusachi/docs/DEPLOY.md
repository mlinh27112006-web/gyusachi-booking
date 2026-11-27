# Đưa web lên mạng bằng Render (từng bước)

Mục tiêu: có một đường dẫn dạng `https://gyusachi.onrender.com` để thầy cô mở khi chấm và để sau này nối Facebook.
Cần: tài khoản GitHub, tài khoản Render (đăng ký bằng GitHub, không cần thẻ cho gói miễn phí).

## Bước 1. Đưa mã lên GitHub

1. Tạo repo mới trên GitHub, ví dụ `gyusachi` (để Private cũng được).
2. Mở PowerShell trong thư mục dự án và chạy:

```
git init
git add .
git commit -m "Gyu Sachi booking"
git branch -M main
git remote add origin https://github.com/TEN-CUA-BAN/gyusachi.git
git push -u origin main
```

File `.env` đã nằm trong `.gitignore` nên mật khẩu của bạn không bị đưa lên. Hãy kiểm tra trên GitHub là không thấy file `.env`.

## Bước 2. Tạo cơ sở dữ liệu PostgreSQL trên Render

1. Vào dashboard Render, chọn **New > PostgreSQL**.
2. Name: `gyusachi-db`, Database: `gyusachi`, chọn gói **Free**, Region gần nhất (Singapore).
3. Bấm **Create Database**, chờ trạng thái **Available**.
4. Trong trang của database, copy hai đường dẫn:
   - **Internal Database URL**: dùng cho web chạy trên Render (bước 4).
   - **External Database URL**: dùng để tạo bảng từ máy bạn (bước 3).

Lưu ý: gói miễn phí của Render có thời hạn và có thể bị xóa sau một thời gian. Hãy xem thông báo trong trang database. Nếu cần chạy lâu cho buổi bảo vệ thì tạo vào gần ngày bảo vệ.

## Bước 3. Tạo bảng và nạp dữ liệu mẫu (làm một lần)

Mở PowerShell trong thư mục dự án (đã chạy `npm.cmd install` trước đó):

```
$env:DATABASE_URL="DAN-EXTERNAL-DATABASE-URL-VAO-DAY"
$env:DATABASE_SSL="true"
npm.cmd run db:init
```

Kết quả đúng là dòng `Hoàn tất. Số bàn trong CSDL: 18`. Lệnh này tạo toàn bộ bảng, ràng buộc chống đặt trùng và tài khoản mẫu.
Nếu muốn không có tài khoản mẫu thì thêm `-- --no-seed` vào cuối lệnh, nhưng khi đó bạn phải tự tạo tài khoản chủ nhà hàng.

Nếu báo lỗi `already exists` nghĩa là bảng đã được tạo từ lần trước, không cần làm lại.

## Bước 4. Tạo Web Service

1. Dashboard Render, chọn **New > Web Service**, chọn repo `gyusachi` vừa đưa lên.
2. Điền:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
3. Mục **Environment Variables**, thêm:

| Tên | Giá trị |
|---|---|
| `DATABASE_URL` | Internal Database URL ở bước 2 |
| `JWT_SECRET` | một chuỗi ngẫu nhiên dài (ví dụ gõ lung tung 40 ký tự) |
| `FB_VERIFY_TOKEN` | `gyusachi-verify-token` (hoặc chuỗi bạn tự chọn) |

   Hai biến `FB_APP_SECRET` và `FB_PAGE_ACCESS_TOKEN` để trống, điền sau khi nối Facebook.
   Không cần đặt `PORT`, Render tự cấp.
4. Bấm **Create Web Service**, chờ log báo server đã chạy (lần đầu mất 2 đến 4 phút).

Mở đường dẫn Render cấp. Trang chủ hiện ra là thành công. Trang quản trị ở `/admin/`.

## Bước 5. Kiểm tra sau khi lên mạng

1. Mở `/book.html`, đặt thử một bàn, được mã `GYU-xxxx`.
2. Mở `/admin/`, đăng nhập `owner` với mật khẩu mẫu `Gyu@2026`, thấy lượt đặt vừa tạo.
3. **Đổi ngay mật khẩu của mọi tài khoản mẫu** (menu Nhân viên, nút Đặt lại mật khẩu, hoặc Đổi mật khẩu ở góc dưới). Web đã công khai trên mạng nên không để mật khẩu mẫu.

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Log báo `Thiếu biến môi trường DATABASE_URL` | Chưa thêm biến ở bước 4 |
| `no pg_hba.conf entry` hoặc `SSL required` khi chạy `db:init` | Chưa đặt `DATABASE_SSL=true` ở PowerShell |
| Web chạy nhưng đăng nhập báo lỗi máy chủ | Chưa chạy bước 3, hoặc dán nhầm URL của database khác |
| Mở web lần đầu rất chậm (30 đến 60 giây) | Gói miễn phí ngủ khi lâu không có người truy cập, mở trước buổi demo vài phút |
| Hiện chữ `Cannot GET /` | Start Command phải là `npm start`, và repo phải có thư mục `public` |

## Khi nào nối Facebook

Sau khi web đã chạy ổn trên Render, xem hướng dẫn nối Facebook (đăng ký webhook tại `https://TEN-WEB-CUA-BAN.onrender.com/api/facebook/webhook`). Thêm hai biến `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN` vào Render rồi chọn **Manual Deploy > Restart** để máy chủ đọc biến mới.
