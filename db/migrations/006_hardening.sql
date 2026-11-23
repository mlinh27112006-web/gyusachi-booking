-- Chạy một lần (không bắt buộc: mã nguồn cũng tự tạo chỉ mục mid khi cần).
-- 1) Chống xử lý trùng tin nhắn Facebook ở tầng cơ sở dữ liệu.
CREATE UNIQUE INDEX IF NOT EXISTS channel_logs_in_mid_uq ON channel_logs ((raw_payload->>'mid'))
  WHERE channel = 'fanpage' AND direction = 'in' AND raw_payload->>'mid' IS NOT NULL;
-- 2) Danh sách chờ: tối đa 8 khách, khớp với bàn lớn nhất và bảng reservations.
--    NOT VALID: không kiểm tra dòng cũ, chỉ áp dụng cho dòng mới/sửa.
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_party_size_check;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_party_size_check CHECK (party_size BETWEEN 1 AND 8) NOT VALID;
