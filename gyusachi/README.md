# Gyu Sachi Yakiniku - Hệ thống đặt bàn đa kênh

Đồ án: website đặt bàn cho nhà hàng **Gyu Sachi Yakiniku, 44 Trần Văn Trứ, Đà Nẵng** (hotline 0934971972). Khách đặt bàn qua website, nhân viên đặt hộ khách gọi hotline hoặc nhắn fanpage, tất cả cùng một sơ đồ bàn nên không bao giờ trùng bàn trùng giờ.

Trang khách gồm trang chủ (bảng giá, ưu đãi "đi 4 tính 3" cho buffet từ 349K, bản đồ Google, bộ đếm lượt đặt trong tháng), Về chúng tôi, thực đơn dạng quyển sách lật trang (buffet trưa 199K, các mức 269K, 299K, 349K, 389K, 469K, Menu lẻ, Đồ uống), đặt bàn, tra cứu, Tuyển dụng và khung chat đặt bàn nhanh; giao diện song ngữ Việt/Anh, co giãn theo điện thoại và máy tính. Mặt bằng sơ đồ bàn vẽ theo nhà hàng thật, tọa độ nằm ở `public/js/floorplan.js`; ảnh thực đơn ở `public/img/menu`, danh sách trang từng mức giá ở `public/js/menu.js`.

Công nghệ: Node.js 22 + Express 4, PostgreSQL 14 trở lên, giao diện HTML/CSS/JavaScript thuần (không dùng framework).

## 1. Chức năng theo 8 phân hệ

| # | Phân hệ | Đã làm |
|---|---|---|
| 1 | Đặt bàn | Chọn ngày, số khách, giờ (bước 30 phút, đặt trước 7 ngày, cho đặt cùng ngày), chọn bàn trên sơ đồ 2 tầng, mã `GYU-xxxx`, tra cứu và hủy bằng số điện thoại + mã |
| 2 | Chống trùng lịch | Khóa mềm 5 phút khi khách đang điền form; ràng buộc `EXCLUDE` của PostgreSQL (không thể có hai lượt trùng bàn trùng giờ, kể cả khi hai người bấm cùng lúc); giao dịch + khóa theo từng bàn |
| 3 | Xác thực, phân quyền | JWT 8 giờ, 5 vai trò, quyền đọc lại từ CSDL mỗi request (khóa tài khoản có hiệu lực ngay), khóa đăng nhập 5 phút sau 5 lần sai |
| 4 | Quản lý nhân viên | Thêm, sửa họ tên và vai trò, đặt lại mật khẩu, khóa/mở khóa; quy tắc ai được quản ai |
| 5 | Nhật ký (audit log) | Mọi thao tác quan trọng được ghi; bảng chỉ ghi thêm, trigger chặn sửa và xóa |
| 6 | Báo cáo thống kê | Theo ngày, kênh, giờ cao điểm, từng bàn, tỷ lệ hủy, tỷ lệ không đến, mức lấp đầy, khách hay không đến |
| 7 | Webhook Facebook | Xác minh webhook, kiểm tra chữ ký HMAC, chống xử lý trùng tin, trả lời tự động theo từ khóa, nhân viên trả lời tay, gửi tin lên Facebook thật khi có token, chế độ mô phỏng để thử không cần Facebook |
| 8 | Giao diện | Trang khách song ngữ Việt/Anh (đặt bàn, tra cứu/hủy) và trang quản trị 8 màn hình (tiếng Việt) |


## 2. Cài đặt trên Windows

Cần: Node.js 18 trở lên (khuyến nghị 22), PostgreSQL 14 trở lên (có pgAdmin), VS Code.

**Bước 1. Tạo cơ sở dữ liệu.** Trong pgAdmin: chuột phải *Databases* > *Create* > *Database*, đặt tên `gyusachi`. Chọn database đó, mở *Query Tool*, mở file `db/schema.sql`, bấm chạy (F5). Sau đó mở `db/seed.sql` và chạy tiếp. Thứ tự bắt buộc: `schema.sql` trước, `seed.sql` sau. (Dùng psql thì: `psql -U postgres -d gyusachi -f db/schema.sql` rồi `-f db/seed.sql`.)

**Bước 2. Cài thư viện.** Mở terminal trong thư mục dự án và chạy `npm.cmd install`. (Gặp lỗi "running scripts is disabled" thì dùng `npm.cmd` thay `npm`, hoặc chạy một lần `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)

**Bước 3. Tạo file `.env`.** Copy `.env.example` thành `.env`, rồi sửa:
- `DATABASE_URL=postgres://postgres:MAT_KHAU@localhost:5432/gyusachi` (thay `MAT_KHAU` bằng mật khẩu PostgreSQL của bạn)
- `JWT_SECRET=` một chuỗi dài ngẫu nhiên
- Các biến `FB_*` để trống nếu chưa dùng Facebook thật.

**Bước 4. Chạy.** `npm.cmd start` (hoặc `npm.cmd run dev` để tự khởi động lại khi sửa code). Mở http://localhost:3000/api/health, thấy `"ok": true` và `"tables": 18` là đúng.

Các địa chỉ: trang chủ http://localhost:3000/, thực đơn http://localhost:3000/menu.html, đặt bàn http://localhost:3000/book.html, tra cứu http://localhost:3000/lookup.html, quản trị http://localhost:3000/admin/

Nếu bạn đã tạo CSDL từ phiên bản cũ (trước bước "khách đã về + dọn bàn"), chạy thêm một lần `db/migrations/002_cleanup_buffer.sql`. Cài mới hoàn toàn thì không cần.

**Lỗi thường gặp**
- `password authentication failed`: sai mật khẩu trong `DATABASE_URL`.
- `relation ... does not exist`: chưa chạy `schema.sql` đúng database.
- Thiếu biến môi trường: chưa tạo `.env` hoặc thiếu `DATABASE_URL`, `JWT_SECRET`.
- Cổng 3000 đang bận: đổi `PORT` trong `.env`.
- Máy không có mạng: chữ Be Vietnam Pro không tải được, trang tự dùng chữ hệ thống, vẫn chạy bình thường.

## 3. Tài khoản mẫu và phân quyền

Mật khẩu chung `Gyu@2026` (chỉ để phát triển và demo; đổi bằng "Đổi mật khẩu" ở góc dưới menu trước khi dùng thật).

| Tài khoản | Vai trò | Xem và tạo đặt bàn, đổi trạng thái | Sơ đồ bàn | Báo cáo | Facebook | Nhân viên, Nhật ký |
|---|---|---|---|---|---|---|
| `owner` | Chủ nhà hàng | có | có | có | có | có (tạo được admin) |
| `admin` | Quản trị viên | có | có | có | có | có |
| `manager` | Quản lý | có | có | có | có | không |
| `hotline` | Nhân viên hotline | có | có | không | không | không |
| `fanpage` | Nhân viên fanpage | có | có | không | có | không |

Quy tắc nhân viên: không ai tạo hoặc sửa được owner; chỉ owner tạo, sửa, khóa admin; không tự khóa hoặc tự đổi vai trò của mình; mật khẩu 8 đến 72 ký tự gồm cả chữ và số; tên đăng nhập gồm chữ thường, số và `. _ -` (3 đến 30 ký tự). Menu quản trị chỉ hiện các màn hình mà vai trò được phép.

## 4. Quy tắc nghiệp vụ

- Nhà hàng có 1 cơ sở, 18 bàn, 92 chỗ: tầng 1 (a1 2 chỗ, a2 đến a4 4 chỗ, a5 và a6 6 chỗ, a7 8 chỗ), tầng 2 (vip1, vip2 8 chỗ, b1 đến b5 6 chỗ, b6 và b7 4 chỗ, b8 và b9 2 chỗ).
- Giờ mở cửa: thứ 2 đến thứ 6 10:30-14:00 và 16:30-22:00; thứ 7, chủ nhật 10:30-22:00. Nhận khách cuối trước giờ đóng ca 60 phút.
- Mỗi lượt giữ 1 bàn cố định 120 phút. Website nhận tối đa 8 khách (đông hơn gọi hotline). Nhân viên đặt hộ nhập được tới 20 khách nhưng vì mỗi lượt chỉ giữ một bàn nên thực tế cũng tối đa 8 khách (bàn lớn nhất 8 chỗ); nhóm đông hơn cần tạo nhiều lượt đặt hoặc xử lý ngoài hệ thống.
- Khách chỉ được chọn bàn vừa số người (loại sức chứa nhỏ nhất đủ chỗ); chỉ khi hết bàn vừa ở khung giờ đó mới mở bàn lớn hơn. Bàn đã đặt hiện màu xám, bấm không được.
- Đặt xong tự động xác nhận. Khách tự hủy được khi nhân viên chưa bấm "Khách đã đến".
- Nhân viên: "Khách đã đến" mở từ 60 phút trước giờ hẹn đến hết giờ giữ bàn; "Không đến" chỉ khi đã qua giờ hẹn mà khách chưa đến; "Khách đã về" chỉ sau khi đã đến, có hộp xác nhận, bàn được mở lại cho khách khác sau 15 phút dọn.
- Khách hết 5 phút giữ bàn thì phải chọn lại bàn.

## Bot đặt bàn bằng câu chat (tính năng mở rộng)

Khách không cần điền form: chỉ nhắn một câu tự nhiên, bot tự hiểu và giữ bàn.

- **Hai nơi dùng chung một bộ não** (`src/services/botService.js`): khung chat nổi "Đặt bàn nhanh" trên website (`POST /api/bot/chat`, lượt đặt có kênh `website`) và tin nhắn fanpage Facebook (lượt đặt có kênh `fanpage`, bot trả lời trước kịch bản từ khóa).
- **Hiểu câu tiếng Việt, kể cả không dấu**: "đặt bàn 4 người 7h tối mai", "dat ban 6 nguoi thu 7 11h30", "2 khách 19:30 ngày 15/10". Tách được số khách, ngày (hôm nay, mai, ngày kia, thứ 2 đến chủ nhật, 15/10, ngày 15), giờ (19h, 7h tối, 19:30).
- **Hội thoại nhiều bước**: hỏi phần còn thiếu, tìm bàn nhỏ nhất đủ chỗ (đúng quy tắc chọn bàn), xin họ tên và số điện thoại, tóm tắt rồi chờ khách nhắn "ok". Khách có thể nhắn lại để đổi giờ, số khách giữa chừng, hoặc "hủy" để dừng.
- **Khi hết bàn**: bot gợi ý tối đa 3 giờ còn bàn gần nhất trong ngày. Giờ ngoài khung nhận khách, ngày quá xa, nhóm trên 8 khách đều có câu trả lời riêng.
- **An toàn**: lượt đặt đi qua đúng hàm tạo đặt bàn và ràng buộc chống trùng của hệ thống, nên không thể trùng bàn. Bàn bị người khác lấy mất đúng lúc chốt thì bot tự đổi bàn hoặc gợi ý giờ khác. Giới hạn 40 tin/phút mỗi IP cho khung chat web.
- **Tài khoản hệ thống**: vì cơ sở dữ liệu bắt buộc lượt đặt ngoài website phải có người tạo, bot dùng tài khoản `bot_fanpage` ("Bot đặt bàn (chatbot)"), tự tạo ở lần đặt đầu tiên và bị khóa, không đăng nhập được.
- **Trạng thái hội thoại** lưu trong bộ nhớ 20 phút (khởi động lại máy chủ thì khách nhắn "đặt bàn" lại từ đầu).
- **Cách trình diễn**: mở trang chủ, bấm "Đặt bàn nhanh" và nhắn thử; hoặc vào quản trị, màn "Tin nhắn Facebook", dùng khung mô phỏng để thử cùng luồng đó rồi xem lượt đặt hiện ở "Danh sách đặt bàn" với kênh Fanpage.

## 5. Kịch bản demo (khoảng 10 phút)

0. **Giới thiệu** (`/`, `/menu.html`, `/recruitment.html`): trang chủ, bảng giá 6 mức buffet (bấm thẻ mở đúng quyển thực đơn), lật trang thực đơn, bấm ảnh để phóng to, trang Tuyển dụng, đổi VI/EN; thu nhỏ cửa sổ hoặc mở bằng điện thoại để thấy giao diện tự co theo màn hình.
0b. **Bot đặt bàn**: bấm "Đặt bàn nhanh" ở góc phải, nhắn "đặt bàn 4 người 7h tối mai", làm theo bot đến khi nhận mã `GYU-xxxx` (xem mục "Bot đặt bàn bằng câu chat").
1. **Khách đặt bàn trên website** (`/book.html`): chọn ngày, 4 khách, giờ tối; cho thấy chỉ các bàn 4 chỗ được bấm, bàn khác mờ; chọn bàn, thanh đếm ngược 5 phút hiện ra; nhập tên, số điện thoại, đặt bàn; ghi lại mã `GYU-xxxx`.
2. **Chống trùng**: mở thêm một cửa sổ ẩn danh, cùng ngày giờ đó, bàn vừa đặt đã xám và không bấm được. Có thể nói thêm: dù hai người bấm cùng lúc, ràng buộc `EXCLUDE` trong PostgreSQL vẫn chặn được.
3. **Tra cứu và hủy** (`/lookup.html`): nhập số điện thoại và mã, xem thông tin, hủy; bàn lại trống.
4. **Nhân viên hotline** (đăng nhập `hotline` tại `/admin/`): "Tạo đặt bàn hộ" cho khách gọi điện (6 khách, ghi chú sinh nhật); thấy menu của hotline ít mục hơn owner.
5. **Sơ đồ bàn**: bàn vừa đặt hiện màu chờ khách, bấm vào xem thông tin khách; bấm "Khách đã đến" (đặt giờ gần hiện tại để nút bật), bàn chuyển xanh; bấm "Khách đã về", xác nhận, bàn sẽ mở lại sau 15 phút.
6. **Facebook** (đăng nhập `fanpage`): "Thử tin nhắn mô phỏng" với nội dung "cho mình đặt bàn 4 người 7h tối mai" (bot hỏi họ tên, số điện thoại và giữ bàn) và "mấy giờ mở cửa" (trả lời theo kịch bản từ khóa); nhân viên trả lời tay; "Đặt bàn cho khách này" tạo lượt đặt kênh fanpage gắn với cuộc trò chuyện.
7. **Quản lý** (đăng nhập `owner`): màn "Báo cáo" (theo kênh, giờ cao điểm, tỷ lệ không đến), "Nhân viên" (thêm, đổi vai trò, khóa), "Nhật ký" (lọc theo loại thao tác, thấy mọi thao tác vừa làm).
8. **Phân quyền**: đăng nhập `hotline`, gõ thẳng `/admin/#/reports`, bị đưa về màn đầu vì không có quyền.

## 6. Cấu trúc thư mục

```
db/                 schema.sql, seed.sql, migrations/
src/
  server.js         khởi động Express, ghép các nhóm API
  config.js         đọc biến môi trường
  db.js             kết nối PostgreSQL, hàm giao dịch
  settings.js       đọc bảng settings và giờ mở cửa
  errors.js         lỗi có mã HTTP
  middleware/       xác thực JWT, phân quyền, xử lý lỗi
  routes/           các nhóm API
  controllers/      nhận request, kiểm tra đầu vào
  services/         nghiệp vụ (tìm bàn, khóa mềm, đặt bàn, báo cáo, Facebook...)
public/             trang khách (index, about, menu, book, lookup, recruitment; css, img; js: sơ đồ bàn floorplan.js, thực đơn lật trang menu.js, chân trang và nút gọi footer.js, khung chat chatbot.js, song ngữ i18n.js, pagei18n.js)
admin/              trang quản trị (đường dẫn /admin/)
```

## 7. Bảo mật và hạn chế đã biết

Đã có: mật khẩu băm bcrypt; mọi câu lệnh SQL dùng tham số; dữ liệu hiển thị được thoát ký tự đặc biệt (chống XSS); kiểm tra đầu vào ở server; chữ ký HMAC cho webhook Facebook; quyền đọc lại từ CSDL mỗi request; nhật ký chỉ ghi thêm.

Hướng dẫn đưa web lên mạng (Render, từng bước): xem `docs/DEPLOY.md`.

Hạn chế cần biết khi triển khai thật:
- Token đăng nhập lưu ở `localStorage` (theo lựa chọn của đồ án); nếu trang có lỗ hổng XSS thì token có thể bị lấy.
- API công khai đặt bàn và tra cứu chưa có giới hạn tần suất (rate limit); riêng khung chat bot đã giới hạn 40 tin/phút mỗi IP. Nên thêm cho các API còn lại khi đưa lên mạng.
- Server chạy HTTP; triển khai thật cần đặt sau HTTPS (Nginx, Cloudflare...).
- Mã đặt bàn `GYU-` cộng 4 chữ số chỉ có 10.000 giá trị, đủ cho đồ án; dùng lâu dài cần mở rộng độ dài.
- Gửi tin Facebook thật chưa được thử với fanpage thật, chỉ thử bằng máy chủ Facebook giả.
- Mật khẩu mẫu `Gyu@2026` và `JWT_SECRET` trong `.env.example` phải đổi trước khi dùng thật.

## 8. Tài liệu API

### API đặt bàn (khách, không cần đăng nhập)
| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/availability?date=YYYY-MM-DD&party=4` | Các giờ trong ngày và số bàn còn chọn được |
| GET | `/api/tables/map?date&time=18:00&party&lockToken` | Sơ đồ bàn (selectable/reason) |
| POST | `/api/locks` | Giữ bàn 5 phút `{date,time,party,tableId,lockToken?}` |
| DELETE | `/api/locks/:token` | Bỏ giữ bàn |
| POST | `/api/reservations` | Đặt bàn `{name,phone,party,date,time,tableId,lockToken,note}` |
| POST | `/api/reservations/lookup` | Tra cứu `{phone,code}` |
| POST | `/api/reservations/cancel` | Hủy `{phone,code}` |

### API đặt bàn hộ (nhân viên, cần token)
- `GET /api/staff/slots?date=` (quyền `table.view`): các giờ nhận khách trong ngày
- `GET /api/staff/tables/map?date&time&party` (quyền `table.view`)
- `POST /api/staff/reservations` (quyền `reservation.create`), thêm `channel: hotline|fanpage` (nhân viên hotline/fanpage tự lấy theo vai trò)

### API danh sách và đổi trạng thái (nhân viên, cần token)
- `GET /api/staff/reservations?date=YYYY-MM-DD&status=&channel=&q=` (quyền `reservation.view`; mặc định hôm nay; `q` tìm theo tên, SĐT, mã). Mỗi lượt có `actions` cho biết nút nào bấm được.
- `GET /api/staff/reservations/:id`
- `POST /api/staff/reservations/:id/arrive | release | no-show | cancel` (quyền `reservation.update_status`)
  - `arrive`: sớm nhất 60 phút trước giờ hẹn (`arrive_early_minutes`), muộn nhất hết giờ giữ bàn.
  - `release` ("khách đã về"): chỉ khi đã `arrive`. Bàn mở lại cho khách mới sau 15 phút dọn (`cleanup_minutes`).
  - `no-show`: khách chưa đến và đã qua giờ hẹn. `cancel`: khách chưa đến.

### API quản lý nhân viên và nhật ký (cần token)
| Method | Đường dẫn | Quyền | Việc |
|---|---|---|---|
| GET | `/api/staff/roles` | `staff.view` | Vai trò được phép gán (admin chỉ thấy khi là owner) |
| GET | `/api/staff/members` | `staff.view` | Danh sách nhân viên |
| POST | `/api/staff/members` | `staff.create` | Tạo `{username,password,fullName,role}` |
| PATCH | `/api/staff/members/:id` | `staff.create` | Sửa `{fullName?,role?,isActive?}` (khóa = `isActive:false`) |
| POST | `/api/staff/members/:id/reset-password` | `staff.create` | Đặt lại mật khẩu `{newPassword}` |
| POST | `/api/auth/change-password` | đăng nhập | Tự đổi `{oldPassword,newPassword}` |
| GET | `/api/staff/audit-logs?from&to&action&staffId&q&limit&offset` | `audit.view` | Nhật ký thao tác (mới nhất trước, tối đa 100 dòng/trang) |

Quy tắc: không ai tạo hoặc sửa được owner; chỉ owner tạo, sửa, khóa admin; không tự khóa hoặc tự đổi vai trò của mình; khóa tài khoản có hiệu lực ngay; mật khẩu 8-72 ký tự gồm chữ và số.

### API báo cáo thống kê (quyền `report.view`: owner, admin, manager)
`GET /api/staff/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` (mặc định 30 ngày gần nhất, tối đa 92 ngày). Trả về:
- `summary`: tổng lượt, số lượt theo trạng thái, số khách dự kiến, số khách trung bình, tỷ lệ hủy, tỷ lệ không đến (tính trên các lượt không hủy), mức lấp đầy (phút-ghế đã đặt chia cho 92 ghế nhân số phút mở cửa)
- `byDay`, `byChannel` (luôn đủ website, hotline, fanpage), `byHour` + `peakHour` (không tính lượt hủy), `byTable` (số lượt, số phút giữ bàn, tỷ lệ sử dụng), `topNoShowCustomers`
Ngày tính theo giờ Việt Nam, theo giờ hẹn của lượt đặt.

### Facebook fanpage (webhook + chế độ mô phỏng)
**Webhook thật** (Facebook gọi vào, không cần token đăng nhập):
- `GET /api/facebook/webhook`: Facebook xác minh bằng `FB_VERIFY_TOKEN` trong `.env`.
- `POST /api/facebook/webhook`: bắt buộc đúng chữ ký `X-Hub-Signature-256` (HMAC-SHA256 với `FB_APP_SECRET`). Sai chữ ký trả 403 và ghi log từ chối. Tin Facebook gửi lại (cùng `mid`) chỉ xử lý một lần. Chưa điền `FB_APP_SECRET` thì từ chối hết.
- **Gửi tin lên Facebook thật**: điền `FB_PAGE_ACCESS_TOKEN` (Page Access Token của fanpage) vào `.env` rồi chạy lại server. Khi đó câu trả lời tự động và tin nhân viên trả lời cho khách thật được gửi qua Send API (`messaging_type: RESPONSE`). Facebook chỉ cho trả lời trong 24 giờ kể từ tin cuối của khách; nếu bị từ chối, nhân viên thấy thông báo lỗi rõ ràng và tin không được ghi là đã gửi. Để trống token thì hệ thống chỉ ghi lại (màn hình hiện cảnh báo "chưa nối Facebook"). Tin mô phỏng không bao giờ gọi Facebook.
- Cần cấu hình trên Meta for Developers: app có quyền `pages_messaging`, webhook trỏ về `https://<tên-miền>/api/facebook/webhook` (cần địa chỉ công khai, có thể dùng ngrok khi thử), đăng ký trường `messages`, điền `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN`.
- `GET /api/staff/facebook/status` cho biết đã nối Facebook chưa (`connected`).

**Dành cho nhân viên** (quyền `facebook.handle`: owner, admin, manager, fanpage):
| Method | Đường dẫn | Việc |
|---|---|---|
| POST | `/api/staff/facebook/demo` | Giả lập tin nhắn khách `{text, senderId?, senderName?}`, trả về câu trả lời tự động |
| GET | `/api/staff/facebook/conversations` | Danh sách cuộc trò chuyện |
| GET | `/api/staff/facebook/messages?senderId=` | Tin nhắn của một người |
| POST | `/api/staff/facebook/reply` | Nhân viên nhắn trả lời `{senderId, text}` |
| GET/POST | `/api/staff/facebook/auto-replies` | Xem, thêm kịch bản trả lời tự động |
| PATCH/DELETE | `/api/staff/facebook/auto-replies/:id` | Sửa, xóa kịch bản |

Từ khóa khớp không phân biệt hoa thường và dấu, theo từ nguyên vẹn; kịch bản có `sortOrder` nhỏ hơn được ưu tiên. Không khớp từ khóa nào thì trả lời mặc định kèm hotline.
Đặt bàn từ tin nhắn: gọi `POST /api/staff/reservations` với `channel: "fanpage"` và thêm `fbSenderId` để gắn lượt đặt vào cuộc trò chuyện.


### Trang khách
- `/book.html`: đặt bàn (chọn ngày, số khách, giờ, bàn trên sơ đồ, nhập thông tin, giữ bàn 5 phút, màn hình xác nhận). Song ngữ Việt/Anh bằng nút VI/EN góc phải.
- `/lookup.html`: tra cứu và hủy bằng số điện thoại + mã. `/`: trang chủ; `/about.html`: câu chuyện tên nhà hàng; `/menu.html`: thực đơn lật trang (mở thẳng một quyển bằng `?book=389K`, `?book=carte`, `?book=drinks`); `/recruitment.html`: tuyển dụng cho cơ sở 44 Trần Văn Trứ.
- Bộ đếm lượt đặt trong tháng ở trang chủ lấy từ `GET /api/stats/month`; khung chat gọi `POST /api/bot/chat`.
- Mã nguồn: `public/css/site.css` (nút 3D, đầu trang, chân trang, khung chat), `public/css/pages.css`, `public/css/menu.css`, `public/js/i18n.js` (từ điển song ngữ), `public/js/book.js`, `public/js/lookup.js`.

### Trang quản trị (/admin/)
- Menu bên trái chỉ hiện các mục mà vai trò của tài khoản được phép xem.
- **Tổng quan hôm nay**: số lượt đặt, khách dự kiến, lượt trễ; danh sách khách đang chờ; tự làm mới mỗi 30 giây.
- **Danh sách đặt bàn**: chọn ngày, lọc theo trạng thái/kênh, tìm theo tên, số điện thoại hoặc mã. Các nút *Khách đã đến*, *Khách đã về*, *Không đến*, *Hủy* chỉ hiện khi hợp lệ; thao tác quan trọng có hộp xác nhận.
- Có thể đổi mật khẩu ngay trong trang. Trên điện thoại, bảng chuyển thành dạng thẻ.
- **Tạo đặt bàn hộ**: chọn ngày, giờ, số khách, chọn bàn trên sơ đồ 2 tầng, nhập tên, số điện thoại, ghi chú. Quản lý trở lên chọn kênh hotline hoặc fanpage; nhân viên hotline/fanpage tự theo vai trò. Đặt xong hiện mã `GYU-xxxx` để đọc cho khách. Nếu bàn vừa bị người khác đặt thì báo lỗi và sơ đồ tự cập nhật.
- **Sơ đồ bàn**: xem từng giờ trong ngày, bàn trống / đã đặt chờ khách / đang dùng bàn; bấm bàn để xem khách và dùng các nút thao tác, hoặc bấm "Đặt bàn này" để sang màn tạo đặt bàn với bàn đã chọn sẵn.
- **Báo cáo** (owner, admin, manager): chọn nhanh 7/30/90 ngày hoặc tự chọn khoảng ngày (tối đa 92 ngày); thẻ tổng quan, theo kênh, giờ cao điểm, theo ngày, mức dùng từng bàn, khách hay không đến.
- **Nhân viên** (owner, admin): thêm tài khoản, sửa họ tên/vai trò, đặt lại mật khẩu, khóa/mở khóa (khóa có hiệu lực ngay). Không sửa được owner và chính mình; chỉ owner sửa được admin.
- **Tin nhắn Facebook** (owner, admin, manager, fanpage): danh sách cuộc trò chuyện, xem tin, nhân viên nhắn trả lời, nút "Thử tin nhắn mô phỏng", nút "Đặt bàn cho khách này" (mở màn tạo đặt bàn với mã người nhắn đã điền sẵn); thẻ "Kịch bản trả lời tự động" để thêm, sửa, bật/tắt, xóa từ khóa. Gửi lên Facebook thật khi đã điền `FB_PAGE_ACCESS_TOKEN`, nếu không thì chỉ lưu lại; đầu màn hình có dải thông báo cho biết đã nối chưa.
- **Nhật ký** (owner, admin): lọc theo ngày, loại thao tác (đặt bàn, nhân viên, Facebook), nhân viên, mã đối tượng; 50 dòng mỗi trang; chỉ xem, không sửa hoặc xóa được.
- Đủ 8 màn hình quản trị.
