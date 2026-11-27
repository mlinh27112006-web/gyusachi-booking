-- Nâng cấp cho CSDL đã có: mã đặt bàn mới dạng GYU-4827-0909, trong đó 4 số cuối là 4 số cuối SĐT của khách.
-- Mã cũ dạng GYU-1234 vẫn hợp lệ và vẫn tra cứu được.
-- Chạy một lần: psql -U postgres -d gyusachi -f db/migrations/003_booking_code_phone.sql
BEGIN;

DROP VIEW IF EXISTS v_reservation_detail;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_booking_code_check;
ALTER TABLE reservations ALTER COLUMN booking_code TYPE varchar(13);
ALTER TABLE reservations ADD CONSTRAINT reservations_booking_code_check
    CHECK (booking_code ~ '^GYU-[0-9]{4}(-[0-9]{4})?$');

CREATE VIEW v_reservation_detail AS
SELECT r.id, r.booking_code, r.status, r.channel,
       r.start_time, r.end_time, r.party_size, r.note,
       r.arrived_at, r.released_at,
       c.full_name AS customer_name, c.phone AS customer_phone, c.no_show_count,
       t.code AS table_code, t.floor, t.capacity,
       s.full_name AS created_by_name
FROM reservations r
JOIN customers c     ON c.id = r.customer_id
JOIN dining_tables t ON t.id = r.table_id
LEFT JOIN staff s    ON s.id = r.created_by;

COMMIT;
