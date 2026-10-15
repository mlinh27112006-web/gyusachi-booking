-- =====================================================================
-- GYU SACHI YAKINIKU - Dữ liệu khởi tạo
-- Chạy sau schema.sql. Chạy lại nhiều lần sẽ bị lỗi trùng khóa (chạy 1 lần).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cấu hình chung
-- ---------------------------------------------------------------------
INSERT INTO settings (key, value, description) VALUES
 ('restaurant_name',            'Gyu Sachi Yakiniku',          'Tên nhà hàng'),
 ('restaurant_address',         '44 Trần Văn Trứ, Đà Nẵng',    'Địa chỉ cơ sở'),
 ('hotline',                    '0934971972',                  'Số hotline'),
 ('hold_minutes',               '120',                         'Thời gian giữ bàn mỗi lượt đặt (phút)'),
 ('slot_step_minutes',          '30',                          'Bước chọn giờ (phút)'),
 ('last_seating_before_close',  '60',                          'Nhận khách muộn nhất trước giờ đóng ca (phút)'),
 ('booking_window_days',        '7',                           'Cho đặt trước tối đa bao nhiêu ngày'),
 ('max_online_party_size',      '8',                           'Số khách tối đa khi đặt trên website'),
 ('soft_lock_ttl_seconds',      '300',                         'Thời gian giữ bàn tạm khi khách đang điền form (giây)'),
 ('cleanup_minutes',            '15',                          'Thời gian dọn bàn sau khi khách về, rồi mới mở cho khách mới (phút)'),
 ('arrive_early_minutes',       '60',                          'Cho bấm "khách đã đến" sớm nhất trước giờ hẹn bao nhiêu phút');

-- Giờ mở cửa: ISO 1 = thứ 2 ... 7 = chủ nhật
INSERT INTO opening_hours (day_of_week, open_time, close_time)
SELECT d, '10:30'::time, '14:00'::time FROM generate_series(1, 5) d
UNION ALL
SELECT d, '16:30'::time, '22:00'::time FROM generate_series(1, 5) d
UNION ALL
SELECT d, '10:30'::time, '22:00'::time FROM generate_series(6, 7) d;

-- ---------------------------------------------------------------------
-- 18 bàn theo mặt bằng thật (map_x, map_y = % trên bản vẽ từng tầng)
-- ---------------------------------------------------------------------
INSERT INTO dining_tables (code, floor, capacity, is_vip, map_x, map_y) VALUES
 -- Tầng 1
 ('a1',   1, 2, false, 36, 79),
 ('a2',   1, 4, false, 34, 65),
 ('a3',   1, 4, false, 34, 49),
 ('a4',   1, 4, false, 30, 37),
 ('a5',   1, 6, false, 25, 23),
 ('a6',   1, 6, false, 23,  9),
 ('a7',   1, 8, false, 77, 40),
 -- Tầng 2
 ('vip1', 2, 8, true,  26,  9),
 ('vip2', 2, 8, true,  83,  9),
 ('b1',   2, 6, false, 11, 82),
 ('b2',   2, 6, false, 15, 74),
 ('b3',   2, 6, false, 15, 60),
 ('b4',   2, 6, false, 14, 47),
 ('b5',   2, 6, false, 15, 24),
 ('b6',   2, 4, false, 85, 80),
 ('b7',   2, 4, false, 86, 66),
 ('b8',   2, 2, false, 83, 37),
 ('b9',   2, 2, false, 86, 24);

-- ---------------------------------------------------------------------
-- Vai trò, quyền hạn, ma trận phân quyền
-- ---------------------------------------------------------------------
INSERT INTO roles (code, name) VALUES
 ('owner',         'Chủ nhà hàng'),
 ('admin',         'Quản trị viên'),
 ('manager',       'Quản lý'),
 ('hotline_staff', 'Nhân viên hotline'),
 ('fanpage_staff', 'Nhân viên fanpage');

INSERT INTO permissions (code, description) VALUES
 ('table.view',            'Xem sơ đồ bàn'),
 ('reservation.view',      'Xem danh sách và chi tiết đặt bàn'),
 ('reservation.create',    'Tạo đặt bàn hộ khách'),
 ('reservation.update_status', 'Đổi trạng thái đặt bàn (đã đến, đã về, không đến, hủy)'),
 ('report.view',           'Xem báo cáo thống kê'),
 ('facebook.handle',       'Xử lý tin nhắn Facebook'),
 ('staff.view',            'Xem danh sách nhân viên'),
 ('staff.create',          'Tạo tài khoản nhân viên'),
 ('staff.create_admin',    'Tạo tài khoản quản trị viên'),
 ('audit.view',            'Xem nhật ký thao tác');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.perm
FROM roles r
JOIN (VALUES
 ('owner','table.view'), ('owner','reservation.view'), ('owner','reservation.create'),
 ('owner','reservation.update_status'), ('owner','report.view'), ('owner','facebook.handle'),
 ('owner','staff.view'), ('owner','staff.create'), ('owner','staff.create_admin'), ('owner','audit.view'),

 ('admin','table.view'), ('admin','reservation.view'), ('admin','reservation.create'),
 ('admin','reservation.update_status'), ('admin','report.view'), ('admin','facebook.handle'),
 ('admin','staff.view'), ('admin','staff.create'), ('admin','audit.view'),

 ('manager','table.view'), ('manager','reservation.view'), ('manager','reservation.create'),
 ('manager','reservation.update_status'), ('manager','report.view'), ('manager','facebook.handle'),

 ('hotline_staff','table.view'), ('hotline_staff','reservation.view'),
 ('hotline_staff','reservation.create'), ('hotline_staff','reservation.update_status'),

 ('fanpage_staff','table.view'), ('fanpage_staff','reservation.view'),
 ('fanpage_staff','reservation.create'), ('fanpage_staff','reservation.update_status'),
 ('fanpage_staff','facebook.handle')
) AS p(role_code, perm) ON p.role_code = r.code;

-- ---------------------------------------------------------------------
-- Tài khoản mẫu để thử phân quyền. CHỈ DÙNG KHI PHÁT TRIỂN, đổi mật khẩu khi nộp.
-- Mật khẩu chung: Gyu@2026 (bcrypt, tương thích thư viện bcrypt/bcryptjs của Node)
-- ---------------------------------------------------------------------
INSERT INTO staff (username, password_hash, full_name, role_id)
SELECT u.username, crypt('Gyu@2026', gen_salt('bf', 10)), u.full_name, r.id
FROM (VALUES
 ('owner',   'Chủ nhà hàng (mẫu)',        'owner'),
 ('admin',   'Quản trị viên (mẫu)',       'admin'),
 ('manager', 'Quản lý (mẫu)',             'manager'),
 ('hotline', 'Nhân viên hotline (mẫu)',   'hotline_staff'),
 ('fanpage', 'Nhân viên fanpage (mẫu)',   'fanpage_staff')
) AS u(username, full_name, role_code)
JOIN roles r ON r.code = u.role_code;

-- ---------------------------------------------------------------------
-- Thực đơn: các mức buffet và nhóm món (món cụ thể nhập sau khi có ảnh menu)
-- ---------------------------------------------------------------------
INSERT INTO buffet_packages (code, name_vi, name_en, price, sort_order) VALUES
 ('buffet-269', 'Buffet 269K', 'Buffet 269K', 269000, 1),
 ('buffet-299', 'Buffet 299K', 'Buffet 299K', 299000, 2),
 ('buffet-369', 'Buffet 369K', 'Buffet 369K', 369000, 3),
 ('buffet-399', 'Buffet 399K', 'Buffet 399K', 399000, 4);

-- Nhóm món suy ra từ tên file ảnh menu À la carte trên website, cần đối chiếu lại.
INSERT INTO menu_categories (code, name_vi, name_en, sort_order) VALUES
 ('appetizer',  'Khai vị và salad',        'Appetizers and salads',  1),
 ('beef',       'Thịt bò nướng',           'Grilled beef',           2),
 ('pork',       'Thịt heo nướng',          'Grilled pork',           3),
 ('seafood',    'Hải sản',                 'Seafood',                4),
 ('sushi',      'Sushi và sashimi',        'Sushi and sashimi',      5),
 ('rice-hotpot','Cơm và lẩu',              'Rice and hotpot',        6),
 ('side',       'Món ăn thêm và mỳ',       'Sides and noodles',      7),
 ('soup-skewer','Súp, kim chi và xiên',    'Soup, kimchi and skewers', 8),
 ('combo',      'Combo',                   'Combos',                 9);

-- ---------------------------------------------------------------------
-- Kịch bản trả lời tự động cho fanpage (rule-based)
-- ---------------------------------------------------------------------
INSERT INTO fb_auto_replies (keyword, reply_text, sort_order) VALUES
 ('đặt bàn',  'Dạ Gyu Sachi xin chào anh/chị! Anh/chị cho em xin họ tên, số điện thoại, số khách và ngày giờ muốn đến để em giữ bàn nhé.', 1),
 ('giờ',      'Dạ Gyu Sachi mở cửa thứ 2 đến thứ 6: 10:30-14:00 và 16:30-22:00. Thứ 7, chủ nhật: 10:30-22:00 ạ.', 2),
 ('địa chỉ',  'Dạ nhà hàng ở 44 Trần Văn Trứ, Đà Nẵng. Hotline: 0934971972 ạ.', 3),
 ('menu',     'Dạ anh/chị xem thực đơn buffet và à la carte trên website của nhà hàng ạ.', 4);
