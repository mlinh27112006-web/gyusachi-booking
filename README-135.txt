ĐỔI THỜI GIAN GIỮ BÀN 135 PHÚT (2 giờ dùng bữa + 15 phút dọn bàn) VÀ BƯỚC CHỌN GIỜ 15 PHÚT
Cách giải thích logic: mỗi lượt đặt chiếm bàn từ giờ hẹn đến giờ hẹn + 2 giờ 15 phút, hết thời gian bàn tự mở cho khách khác.
1) Web đang chạy (Render): chạy một lần db/migrations/005_hold_135.sql trên database. Không cần sửa code, server đọc cấu hình mỗi lần.
2) Làm lại database từ đầu: dùng db/seed.sql mới (hold_minutes = 135).
3) Chép đè admin/js/screens-tables.js (đổi chữ "120 phút" thành "2 giờ 15 phút").
Lưu ý:
- Chỉ áp dụng cho lượt đặt MỚI; lượt cũ giữ nguyên.
- Nút "Khách đã về" vẫn dùng được: bàn mở lại sớm hơn (giờ thực tế + 15 phút dọn).
- Bước chọn giờ là 15 phút (10:30, 10:45, 11:00...): bàn đặt 16:30 giữ đến 18:45 và đặt lại được từ 18:45 (18:15 và 18:30 vẫn bị chặn).
- Nếu thử trên máy mà đặt 16:30 vẫn đặt lại được lúc 18:30 thì database chưa chạy file 005_hold_135.sql (cấu hình vẫn là 120 phút).
- Chữ trên web khách ("2 tiếng dùng bàn") vẫn đúng. Trong README/báo cáo, đổi "120 phút" thành "135 phút (120 + 15 dọn bàn)".
