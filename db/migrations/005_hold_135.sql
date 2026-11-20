-- Mỗi lượt đặt giữ bàn cố định 135 phút = 120 phút dùng bữa + 15 phút dọn bàn, hết thời gian thì bàn tự mở cho khách khác.
-- Bước chọn giờ đổi từ 30 xuống 15 phút để các mốc nối tiếp đẹp (vd 16:30 -> 18:45 -> đặt tiếp được lúc 18:45).
-- Chỉ áp dụng cho lượt đặt MỚI. Lượt cũ giữ nguyên giờ kết thúc (kéo dài sẽ đụng lượt đặt liền sau trên cùng bàn).
UPDATE settings SET value = '135', description = 'Thời gian giữ bàn mỗi lượt đặt (phút): 120 phút dùng bữa + 15 phút dọn bàn' WHERE key = 'hold_minutes';
UPDATE settings SET value = '15' WHERE key = 'slot_step_minutes';
