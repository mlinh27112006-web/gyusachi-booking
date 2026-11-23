-- Cột ghi thời điểm đổi mật khẩu (dùng để thu hồi token đăng nhập cũ). Chạy một lần trong Neon SQL Editor.
-- Nếu không chạy, server cũng tự thêm cột này khi khởi động (IF NOT EXISTS nên không lỗi khi chạy cả hai).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
