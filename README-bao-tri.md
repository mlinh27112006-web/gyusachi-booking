# Bản vá: quản lý bàn + đóng cửa/bảo trì (6 file mã nguồn)
Giải nén đè lên thư mục dự án (đường dẫn tương đối từ thư mục gốc), rồi `npm.cmd start`.
Không cần chạy migration: bảng `closures`, cột `maintenance_note` và quyền `table.manage` tự tạo ở lần chạy đầu.
Quyền mới `table.manage` được gán cho owner, admin, manager. Đăng nhập lại để thấy mục "Bảo trì & đóng cửa".
- Tạm ngưng/mở lại bàn (có lý do, chặn nếu bàn còn lượt đặt chưa xử lý).
- Lịch đóng cửa theo ngày hoặc khung giờ: chặn cả website, hotline và chatbot (qua bookingRules.slotsForDate).
- Nhật ký có tên cho thao tác danh sách chờ, bàn, đóng cửa. admin/index.html có noindex.
