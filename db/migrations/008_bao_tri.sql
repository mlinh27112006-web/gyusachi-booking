-- Cấp quyền "Bảo trì & đóng cửa" cho owner, admin, manager (chạy lại nhiều lần vẫn an toàn).
ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS maintenance_note varchar(200);
CREATE TABLE IF NOT EXISTS closures (
  id serial PRIMARY KEY, date_from date NOT NULL, date_to date NOT NULL,
  time_from time, time_to time, reason varchar(200) NOT NULL,
  created_by integer REFERENCES staff(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from), CHECK ((time_from IS NULL) = (time_to IS NULL)),
  CHECK (time_to IS NULL OR time_to > time_from));
INSERT INTO permissions (code, description) VALUES ('table.manage', 'Quản lý bàn và lịch đóng cửa, bảo trì')
  ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_code)
  SELECT id, 'table.manage' FROM roles WHERE code IN ('owner', 'admin', 'manager')
  ON CONFLICT DO NOTHING;
SELECT r.code AS vai_tro, rp.permission_code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.permission_code = 'table.manage';
