-- Danh sách chờ: khách muốn một khung giờ đã hết bàn thì ghi tên chờ; có bàn trống thì bot nhắn hoặc nhân viên gọi.
-- Chạy một lần: npm run db:run -- db/migrations/004_waitlist.sql   (chạy lại nhiều lần vẫn an toàn)
CREATE TABLE IF NOT EXISTS waitlist (
    id                bigserial PRIMARY KEY,
    customer_name     varchar(100) NOT NULL,
    phone             varchar(11) NOT NULL CHECK (phone ~ '^[0-9]{9,11}$'),
    party_size        smallint NOT NULL CHECK (party_size BETWEEN 1 AND 20),
    start_time        timestamptz NOT NULL,                       -- giờ khách muốn đến
    channel           varchar(10) NOT NULL CHECK (channel IN ('website', 'hotline', 'fanpage')),
    external_user_id  varchar(80),                                -- mã người nhắn Messenger (nếu có) để bot báo lại
    status            varchar(10) NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
    note              varchar(500),
    created_by        integer REFERENCES staff(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    notified_at       timestamptz,
    notify_expires_at timestamptz,
    notify_result     varchar(200),
    booking_code      varchar(13)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_active ON waitlist (status, start_time);
CREATE INDEX IF NOT EXISTS idx_waitlist_sender ON waitlist (external_user_id) WHERE status = 'notified';
