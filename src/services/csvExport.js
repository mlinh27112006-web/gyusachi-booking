// Xuất báo cáo ra CSV mở được bằng Excel (UTF-8 có BOM, xuống dòng CRLF).
const db = require('../db');
const reportService = require('./reportService');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const STATUS = { confirmed: 'Chờ khách', completed: 'Đã về', no_show: 'Không đến', cancelled: 'Đã hủy' };
const CHANNEL = { website: 'Website', hotline: 'Hotline', fanpage: 'Fanpage' };

// Ô bắt đầu bằng = + - @ (hoặc tab, xuống dòng) sẽ bị Excel hiểu là công thức: thêm dấu ' phía trước để vô hiệu hóa.
function cell(v) {
  if (v === null || v === undefined) return '""';
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v !== 'number' && /^[\t\r\n]|^[ \t\r\n]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
function toCsv(headers, rows) {
  return `﻿${[headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
// Excel làm mất số 0 đầu của số điện thoại: chèn một khoảng trắng để Excel giữ nguyên dạng chữ.
const phone = (p) => (p && p.length > 4 ? `${p.slice(0, 4)} ${p.slice(4)}` : p || '');

async function reservations(from, to) {
  const { rows } = await db.query(
    `SELECT r.booking_code, r.status, r.channel, r.party_size, r.note, t.code AS table_code, t.floor,
            c.full_name, c.phone, s.full_name AS created_by,
            to_char(r.start_time AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD') AS d,
            to_char(r.start_time AT TIME ZONE ${LOCAL}, 'HH24:MI') AS tm,
            to_char(r.arrived_at AT TIME ZONE ${LOCAL}, 'HH24:MI') AS arrived,
            to_char(r.released_at AT TIME ZONE ${LOCAL}, 'HH24:MI') AS released,
            to_char(r.created_at AT TIME ZONE ${LOCAL}, 'YYYY-MM-DD HH24:MI') AS created
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       JOIN dining_tables t ON t.id = r.table_id
       LEFT JOIN staff s ON s.id = r.created_by
      WHERE r.start_time >= ($1::date::timestamp AT TIME ZONE ${LOCAL})
        AND r.start_time < (($2::date + 1)::timestamp AT TIME ZONE ${LOCAL})
      ORDER BY r.start_time, t.code`, [from, to]);
  return toCsv(
    ['Mã đặt bàn', 'Ngày', 'Giờ hẹn', 'Khách', 'Số điện thoại', 'Số khách', 'Bàn', 'Tầng', 'Kênh', 'Trạng thái', 'Giờ đến', 'Giờ về', 'Ghi chú', 'Nhân viên tạo', 'Tạo lúc'],
    rows.map((r) => [r.booking_code, r.d, r.tm, r.full_name, phone(r.phone), r.party_size, r.table_code.toUpperCase(), r.floor,
      CHANNEL[r.channel] || r.channel, STATUS[r.status] || r.status, r.arrived || '', r.released || '', r.note || '', r.created_by || '', r.created]));
}

async function days(from, to) {
  const d = await reportService.build(from, to);
  return toCsv(['Ngày', 'Lượt đặt', 'Giữ được', 'Khách', 'Hủy', 'Không đến'],
    d.byDay.map((r) => [r.date, r.total, r.kept, r.guests, r.cancelled, r.noShow]));
}

module.exports = { toCsv, cell, reservations, days };
