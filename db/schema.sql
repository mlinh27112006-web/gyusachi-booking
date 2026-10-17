-- =====================================================================
-- GYU SACHI YAKINIKU - Hệ thống đặt bàn đa kênh
-- Cơ sở dữ liệu PostgreSQL 14+ (đã thử trên 16)
-- Chạy: psql -d gyusachi -f schema.sql   rồi   psql -d gyusachi -f seed.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- cho phép EXCLUDE trộn "=" và "&&"
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt() cho dữ liệu mẫu

-- ---------------------------------------------------------------------
-- 0. CẤU HÌNH CHUNG
-- ---------------------------------------------------------------------
CREATE TABLE settings (
    key         text PRIMARY KEY,
    value       text NOT NULL,
    description text
);

-- Giờ mở cửa. day_of_week theo ISO: 1 = thứ 2 ... 7 = chủ nhật.
-- Một ngày có thể có nhiều ca (thứ 2-6 có ca trưa và ca tối).
CREATE TABLE opening_hours (
    id          serial PRIMARY KEY,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    open_time   time NOT NULL,
    close_time  time NOT NULL,
    CHECK (close_time > open_time),
    UNIQUE (day_of_week, open_time)
);

-- ---------------------------------------------------------------------
-- 1. BÀN VÀ KHÁCH HÀNG
-- ---------------------------------------------------------------------
CREATE TABLE dining_tables (
    id        serial PRIMARY KEY,
    code      varchar(10) NOT NULL UNIQUE,                 -- a1..a7, vip1, b1..b9
    floor     smallint NOT NULL CHECK (floor IN (1, 2)),
    capacity  smallint NOT NULL CHECK (capacity BETWEEN 1 AND 8),
    is_vip    boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    -- Vị trí vẽ trên sơ đồ, tính bằng % chiều rộng/cao của mặt bằng từng tầng.
    map_x     numeric(5,2) NOT NULL CHECK (map_x BETWEEN 0 AND 100),
    map_y     numeric(5,2) NOT NULL CHECK (map_y BETWEEN 0 AND 100)
);

CREATE TABLE customers (
    id           serial PRIMARY KEY,
    full_name    varchar(100) NOT NULL,
    phone        varchar(11) NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{9,11}$'),
    no_show_count integer NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. NHÂN VIÊN, VAI TRÒ, QUYỀN HẠN (RBAC)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id   serial PRIMARY KEY,
    code varchar(30) NOT NULL UNIQUE,   -- owner, admin, manager, hotline_staff, fanpage_staff
    name varchar(60) NOT NULL
);

CREATE TABLE permissions (
    code        varchar(40) PRIMARY KEY, -- ví dụ reservation.create
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_id         integer     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code varchar(40) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE staff (
    id            serial PRIMARY KEY,
    username      varchar(40) NOT NULL UNIQUE,
    password_hash text NOT NULL,                    -- bcrypt
    full_name     varchar(100) NOT NULL,
    role_id       integer NOT NULL REFERENCES roles(id),
    is_active     boolean NOT NULL DEFAULT true,   -- khóa tài khoản thay vì xóa
    created_by    integer REFERENCES staff(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. LƯỢT ĐẶT BÀN
-- ---------------------------------------------------------------------
CREATE TABLE reservations (
    id            serial PRIMARY KEY,
    booking_code  varchar(13) NOT NULL UNIQUE CHECK (booking_code ~ '^GYU-[0-9]{4}(-[0-9]{4})?$'), -- GYU-4827-0909: 4 số cuối của mã = 4 số cuối SĐT khách
    customer_id   integer NOT NULL REFERENCES customers(id),
    table_id      integer NOT NULL REFERENCES dining_tables(id),
    party_size    smallint NOT NULL CHECK (party_size BETWEEN 1 AND 8),
    start_time    timestamptz NOT NULL,
    -- end_time = giờ hẹn + 120 phút (đọc từ settings.hold_minutes).
    -- Khi nhân viên bấm "khách đã về" thì ứng dụng ghi end_time = giờ thực tế + thời gian dọn bàn
    -- (settings.cleanup_minutes) và status = 'completed'; bàn mở lại cho khách mới sau mốc đó.
    end_time      timestamptz NOT NULL,
    status        varchar(12) NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'completed', 'no_show', 'cancelled')),
    channel       varchar(10) NOT NULL CHECK (channel IN ('website', 'hotline', 'fanpage')),
    note          text,
    created_by    integer REFERENCES staff(id),     -- NULL khi khách tự đặt trên website
    arrived_at    timestamptz,                      -- nhân viên bấm "khách đã đến"
    released_at   timestamptz,                      -- nhân viên bấm "khách đã về"
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (end_time > start_time),
    CHECK (released_at IS NULL OR status = 'completed'),
    CHECK (created_by IS NOT NULL OR channel = 'website'),

    -- RÀNG BUỘC CỨNG CHỐNG TRÙNG: cùng một bàn không có hai lượt đang chiếm bàn
    -- (confirmed, hoặc đã về nhưng còn trong thời gian dọn) mà khoảng thời gian giao nhau. Vi phạm -> lỗi SQLSTATE 23P01 -> API trả 409.
    CONSTRAINT reservations_no_overlap
        EXCLUDE USING gist (
            table_id WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
        ) WHERE (status = 'confirmed' OR released_at IS NOT NULL)
);

CREATE INDEX idx_reservations_start  ON reservations (start_time);
CREATE INDEX idx_reservations_status ON reservations (status, start_time);
CREATE INDEX idx_reservations_cust   ON reservations (customer_id);

-- Số khách không được vượt sức chứa của bàn, bàn phải đang hoạt động.
CREATE FUNCTION trg_reservation_check_table() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_capacity integer;
    v_active   boolean;
BEGIN
    SELECT capacity, is_active INTO v_capacity, v_active
    FROM dining_tables WHERE id = NEW.table_id;

    IF NEW.party_size > v_capacity THEN
        RAISE EXCEPTION 'Bàn chỉ có % chỗ, không đủ cho % khách', v_capacity, NEW.party_size
            USING ERRCODE = '23514';
    END IF;
    IF NOT v_active AND (TG_OP = 'INSERT' OR NEW.table_id <> OLD.table_id) THEN
        RAISE EXCEPTION 'Bàn này đang ngừng sử dụng' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER reservation_check_table
    BEFORE INSERT OR UPDATE OF table_id, party_size ON reservations
    FOR EACH ROW EXECUTE FUNCTION trg_reservation_check_table();

-- Trạng thái cuối (completed, no_show, cancelled) không được đổi lại.
CREATE FUNCTION trg_reservation_status_flow() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'confirmed' AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Lượt đặt đã ở trạng thái % nên không đổi được nữa', OLD.status
            USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER reservation_status_flow
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION trg_reservation_status_flow();

-- Đánh dấu no_show thì tự tăng no_show_count của khách (mục 1.3.2).
CREATE FUNCTION trg_reservation_no_show() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE customers SET no_show_count = no_show_count + 1 WHERE id = NEW.customer_id;
    RETURN NEW;
END $$;

CREATE TRIGGER reservation_no_show
    AFTER UPDATE OF status ON reservations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'no_show')
    EXECUTE FUNCTION trg_reservation_no_show();

-- ---------------------------------------------------------------------
-- 4. KHÓA MỀM (SOFT LOCK) KHI KHÁCH ĐANG CHỌN BÀN
-- Khóa tự hết hạn theo expires_at. Lưu ý khi dùng: trong cùng transaction,
-- chạy  DELETE FROM table_locks WHERE expires_at <= now();  rồi mới INSERT,
-- để khóa đã hết hạn không chặn nhầm. Vi phạm EXCLUDE -> 23P01 -> 409.
-- ---------------------------------------------------------------------
CREATE TABLE table_locks (
    id         bigserial PRIMARY KEY,
    table_id   integer NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    during     tstzrange NOT NULL,
    lock_token uuid NOT NULL DEFAULT gen_random_uuid(),  -- trình duyệt của khách giữ token này
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT table_locks_no_overlap EXCLUDE USING gist (table_id WITH =, during WITH &&)
);

CREATE INDEX idx_table_locks_expires ON table_locks (expires_at);

-- ---------------------------------------------------------------------
-- 5. HÀM TÌM BÀN: quy tắc "chỉ hiện bàn vừa, hết mới nâng lên"
-- Trả về các bàn còn trống thuộc nhóm sức chứa nhỏ nhất mà vẫn đủ chỗ
-- và còn ít nhất một bàn trống trong khoảng [p_start, p_end).
-- Bàn đang bị khóa mềm bởi người khác được tính là không trống.
-- ---------------------------------------------------------------------
CREATE FUNCTION available_tables(
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

-- ---------------------------------------------------------------------
-- 6. NHẬT KÝ VÀ LOG KÊNH
-- ---------------------------------------------------------------------
CREATE TABLE channel_logs (
    id               bigserial PRIMARY KEY,
    reservation_id   integer REFERENCES reservations(id) ON DELETE SET NULL,
    channel          varchar(10) NOT NULL CHECK (channel IN ('website', 'hotline', 'fanpage')),
    direction        varchar(3)  NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),
    external_user_id text,             -- PSID của người nhắn trên Facebook
    message_text     text,
    raw_payload      jsonb,            -- request gốc nhận được
    signature_valid  boolean,          -- kết quả kiểm tra chữ ký HMAC (NULL nếu không áp dụng)
    is_demo          boolean NOT NULL DEFAULT false,  -- gửi từ chế độ demo nội bộ
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_channel_logs_res ON channel_logs (reservation_id);

CREATE TABLE audit_logs (
    id          bigserial PRIMARY KEY,
    staff_id    integer REFERENCES staff(id),     -- NULL khi khách tự thao tác hoặc hệ thống
    actor_label text NOT NULL DEFAULT 'staff',    -- staff | customer | system
    action      varchar(40) NOT NULL,             -- reservation.create, reservation.status, staff.create
    entity_type varchar(30) NOT NULL,
    entity_id   text NOT NULL,
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);

-- Nhật ký chỉ được thêm, không sửa, không xóa, kể cả quản trị viên (mục 5.1.4).
CREATE FUNCTION trg_audit_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs chỉ cho phép thêm mới, không được sửa hoặc xóa'
        USING ERRCODE = '42501';
END $$;

CREATE TRIGGER audit_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trg_audit_append_only();

CREATE TRIGGER audit_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION trg_audit_append_only();

-- ---------------------------------------------------------------------
-- 7. THỰC ĐƠN VÀ TRẢ LỜI TỰ ĐỘNG (dữ liệu tĩnh, song ngữ Việt/Anh)
-- ---------------------------------------------------------------------
CREATE TABLE buffet_packages (
    id             serial PRIMARY KEY,
    code           varchar(20) NOT NULL UNIQUE,
    name_vi        varchar(100) NOT NULL,
    name_en        varchar(100) NOT NULL,
    price          integer NOT NULL CHECK (price >= 0),     -- đồng, mỗi khách
    description_vi text,
    description_en text,
    sort_order     smallint NOT NULL DEFAULT 0,
    is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE menu_categories (
    id         serial PRIMARY KEY,
    code       varchar(30) NOT NULL UNIQUE,
    name_vi    varchar(100) NOT NULL,
    name_en    varchar(100) NOT NULL,
    sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
    id             serial PRIMARY KEY,
    category_id    integer NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name_vi        varchar(150) NOT NULL,
    name_en        varchar(150) NOT NULL,
    description_vi text,
    description_en text,
    price          integer CHECK (price >= 0),
    image_url      text,
    is_available   boolean NOT NULL DEFAULT true,
    sort_order     smallint NOT NULL DEFAULT 0
);

CREATE TABLE fb_auto_replies (
    id         serial PRIMARY KEY,
    keyword    varchar(60) NOT NULL,          -- so khớp không phân biệt hoa thường
    reply_text text NOT NULL,
    sort_order smallint NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
-- 8. VIEW CHO MÀN HÌNH DANH SÁCH ĐẶT BÀN (mục 1.4.3)
-- ---------------------------------------------------------------------
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
