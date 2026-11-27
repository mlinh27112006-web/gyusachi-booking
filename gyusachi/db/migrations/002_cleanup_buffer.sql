-- Nâng cấp cho CSDL đã có: thêm thời gian dọn bàn 15 phút sau khi khách về.
-- Chạy một lần: psql -U postgres -d gyusachi -f db/migrations/002_cleanup_buffer.sql
BEGIN;

ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap;
ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (
        table_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    ) WHERE (status = 'confirmed' OR released_at IS NOT NULL);

CREATE OR REPLACE FUNCTION available_tables(
    p_start timestamptz,
    p_end   timestamptz,
    p_party smallint,
    p_lock_token uuid DEFAULT NULL
) RETURNS TABLE (id integer, code varchar, floor smallint, capacity smallint,
                 is_vip boolean, map_x numeric, map_y numeric)
LANGUAGE sql STABLE AS $$
    WITH free AS (
        SELECT t.*
        FROM dining_tables t
        WHERE t.is_active
          AND t.capacity >= p_party
          AND NOT EXISTS (
              SELECT 1 FROM reservations r
              WHERE r.table_id = t.id AND (r.status = 'confirmed' OR r.released_at IS NOT NULL)
                AND tstzrange(r.start_time, r.end_time, '[)') && tstzrange(p_start, p_end, '[)'))
          AND NOT EXISTS (
              SELECT 1 FROM table_locks l
              WHERE l.table_id = t.id AND l.expires_at > now()
                AND l.during && tstzrange(p_start, p_end, '[)')
                AND l.lock_token IS DISTINCT FROM p_lock_token)
    )
    SELECT f.id, f.code, f.floor, f.capacity, f.is_vip, f.map_x, f.map_y
    FROM free f
    WHERE f.capacity = (SELECT min(capacity) FROM free)
    ORDER BY f.floor, f.code;
$$;

INSERT INTO settings (key, value, description) VALUES
 ('cleanup_minutes',      '15', 'Thời gian dọn bàn sau khi khách về, rồi mới mở cho khách mới (phút)'),
 ('arrive_early_minutes', '60', 'Cho bấm "khách đã đến" sớm nhất trước giờ hẹn bao nhiêu phút')
ON CONFLICT (key) DO NOTHING;

COMMIT;
