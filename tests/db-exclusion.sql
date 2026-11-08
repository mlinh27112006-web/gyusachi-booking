-- Chứng minh chống trùng ở TẦNG CƠ SỞ DỮ LIỆU (độc lập với JavaScript và API).
-- Chạy:  psql "$DATABASE_URL" -f tests/db-exclusion.sql
-- Toàn bộ nằm trong một giao dịch và được ROLLBACK ở cuối, không để lại dữ liệu.
-- Mỗi câu lệnh có chữ "PHẢI LỖI" bắt buộc báo lỗi; lệnh trước đó phải thành công.
\set ON_ERROR_ROLLBACK on
BEGIN;

INSERT INTO customers (full_name, phone) VALUES ('Kiem Thu CSDL', '0900000099') ON CONFLICT (phone) DO NOTHING;

-- Lượt 1: bàn a2, 12:00-14:00 ngày 01/01/2031 (thành công)
INSERT INTO reservations (booking_code, customer_id, table_id, party_size, start_time, end_time, channel)
SELECT 'GYU-0101-0099', c.id, t.id, 2, '2031-01-01 12:00+07', '2031-01-01 14:00+07', 'website'
FROM customers c, dining_tables t WHERE c.phone = '0900000099' AND t.code = 'a2';

-- PHẢI LỖI 23P01: cùng bàn, khung giờ giao nhau (13:00-15:00)
INSERT INTO reservations (booking_code, customer_id, table_id, party_size, start_time, end_time, channel)
SELECT 'GYU-0101-0098', c.id, t.id, 2, '2031-01-01 13:00+07', '2031-01-01 15:00+07', 'website'
FROM customers c, dining_tables t WHERE c.phone = '0900000099' AND t.code = 'a2';

-- PHẢI LỖI 23505: trùng mã đặt bàn
INSERT INTO reservations (booking_code, customer_id, table_id, party_size, start_time, end_time, channel)
SELECT 'GYU-0101-0099', c.id, t.id, 2, '2031-01-02 12:00+07', '2031-01-02 14:00+07', 'website'
FROM customers c, dining_tables t WHERE c.phone = '0900000099' AND t.code = 'a3';

-- PHẢI LỖI 23514: số khách vượt sức chứa (bàn a1 có 2 chỗ, đặt 3 khách)
INSERT INTO reservations (booking_code, customer_id, table_id, party_size, start_time, end_time, channel)
SELECT 'GYU-0101-0097', c.id, t.id, 3, '2031-01-03 12:00+07', '2031-01-03 14:00+07', 'website'
FROM customers c, dining_tables t WHERE c.phone = '0900000099' AND t.code = 'a1';

-- Thành công: cùng bàn nhưng khung giờ liền kề, không giao nhau (14:00-16:00)
INSERT INTO reservations (booking_code, customer_id, table_id, party_size, start_time, end_time, channel)
SELECT 'GYU-0101-0096', c.id, t.id, 2, '2031-01-01 14:00+07', '2031-01-01 16:00+07', 'website'
FROM customers c, dining_tables t WHERE c.phone = '0900000099' AND t.code = 'a2';

-- Hoàn tất lượt 1 (thành công), sau đó PHẢI LỖI 23514 khi cố đổi lại về confirmed
UPDATE reservations SET status = 'completed', released_at = now() WHERE booking_code = 'GYU-0101-0099';
UPDATE reservations SET status = 'confirmed', released_at = NULL WHERE booking_code = 'GYU-0101-0099';

-- Nhật ký chỉ được thêm: PHẢI LỖI 42501 khi xóa
DELETE FROM audit_logs;

ROLLBACK;
