const db = require('../db');
const { getOpeningHours } = require('../settings');
const rules = require('./bookingRules');

const LOCAL = "'Asia/Ho_Chi_Minh'";
const MAX_DAYS = 92;

// Mọi số liệu tính theo ngày của giờ hẹn (giờ Việt Nam), trong khoảng from..to gồm cả hai đầu.
const RANGE_SQL = `r.start_time >= ($1::date::timestamp AT TIME ZONE ${LOCAL})
                   AND r.start_time < (($2::date + 1)::timestamp AT TIME ZONE ${LOCAL})`;

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

async function build(from, to) {
  const p = [from, to];

  const status = await db.query(
    `SELECT r.status, count(*)::int AS n, COALESCE(sum(r.party_size), 0)::int AS guests
       FROM reservations r WHERE ${RANGE_SQL} GROUP BY r.status`, p);
  const byStatus = { confirmed: 0, completed: 0, no_show: 0, cancelled: 0 };
  const guestsByStatus = { confirmed: 0, completed: 0, no_show: 0, cancelled: 0 };
  for (const r of status.rows) { byStatus[r.status] = r.n; guestsByStatus[r.status] = r.guests; }
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const day = await db.query(
    `SELECT to_char((r.start_time AT TIME ZONE ${LOCAL})::date, 'YYYY-MM-DD') AS d,
            count(*)::int AS total,
            count(*) FILTER (WHERE r.status IN ('confirmed','completed'))::int AS kept,
            COALESCE(sum(r.party_size) FILTER (WHERE r.status IN ('confirmed','completed')), 0)::int AS guests,
            count(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE r.status = 'no_show')::int AS no_show
       FROM reservations r WHERE ${RANGE_SQL} GROUP BY 1 ORDER BY 1`, p);

  const channel = await db.query(
    `SELECT r.channel, count(*)::int AS total,
            count(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE r.status = 'no_show')::int AS no_show
       FROM reservations r WHERE ${RANGE_SQL} GROUP BY r.channel`, p);

  // Giờ cao điểm: theo giờ hẹn, không tính lượt đã hủy.
  const hour = await db.query(
    `SELECT extract(hour FROM r.start_time AT TIME ZONE ${LOCAL})::int AS h,
            count(*)::int AS n, COALESCE(sum(r.party_size), 0)::int AS guests
       FROM reservations r WHERE ${RANGE_SQL} AND r.status <> 'cancelled' GROUP BY 1 ORDER BY 1`, p);

  // Thời gian bàn thực sự được giữ: lượt đã về thì tính đến giờ về, lượt khác tính hết giờ giữ bàn.
  // Không tính lượt hủy và lượt không đến (bàn đó được trả lại).
  const tables = await db.query(
    `SELECT t.code, t.floor, t.capacity, count(r.id)::int AS n,
            COALESCE(sum(extract(epoch FROM (LEAST(r.end_time, COALESCE(r.released_at, r.end_time)) - r.start_time)) / 60), 0)::int AS booked_min
       FROM dining_tables t
       LEFT JOIN reservations r ON r.table_id = t.id AND ${RANGE_SQL} AND r.status IN ('confirmed','completed')
      WHERE t.is_active GROUP BY t.id ORDER BY t.floor, t.code`, p);

  const seatMin = await db.query(
    `SELECT COALESCE(sum(r.party_size * extract(epoch FROM (LEAST(r.end_time, COALESCE(r.released_at, r.end_time)) - r.start_time)) / 60), 0)::bigint AS sm
       FROM reservations r WHERE ${RANGE_SQL} AND r.status IN ('confirmed','completed')`, p);
  const seats = (await db.query('SELECT COALESCE(sum(capacity), 0)::int AS s FROM dining_tables WHERE is_active')).rows[0].s;

  // Số phút mở cửa trong khoảng ngày (theo bảng opening_hours).
  const hours = await getOpeningHours();
  let openMinutes = 0;
  for (let d = from; d <= to; d = rules.addDays(d, 1)) {
    for (const h of hours.filter((x) => x.day_of_week === rules.isoDayOfWeek(d))) {
      openMinutes += rules.parseTime(h.close_time) - rules.parseTime(h.open_time);
    }
  }

  const noShowCustomers = await db.query(
    `SELECT full_name, phone, no_show_count FROM customers WHERE no_show_count > 0
      ORDER BY no_show_count DESC, full_name LIMIT 5`);

  const kept = byStatus.confirmed + byStatus.completed;
  return {
    from, to,
    summary: {
      total,
      byStatus,
      guestsExpected: guestsByStatus.confirmed + guestsByStatus.completed,
      avgPartySize: kept > 0 ? Math.round(((guestsByStatus.confirmed + guestsByStatus.completed) / kept) * 10) / 10 : 0,
      cancelRate: pct(byStatus.cancelled, total),
      // Tỷ lệ không đến tính trên các lượt không hủy (khách đã được giữ bàn).
      noShowRate: pct(byStatus.no_show, total - byStatus.cancelled),
      occupancyRate: pct(Number(seatMin.rows[0].sm), seats * openMinutes),
    },
    byDay: day.rows.map((r) => ({ date: r.d, total: r.total, kept: r.kept, guests: r.guests, cancelled: r.cancelled, noShow: r.no_show })),
    byChannel: CHANNELS_ORDER.map((c) => {
      const r = channel.rows.find((x) => x.channel === c) || { total: 0, cancelled: 0, no_show: 0 };
      return { channel: c, total: r.total, share: pct(r.total, total), cancelled: r.cancelled, noShow: r.no_show };
    }),
    byHour: hour.rows.map((r) => ({ hour: r.h, label: `${String(r.h).padStart(2, '0')}:00`, reservations: r.n, guests: r.guests })),
    peakHour: hour.rows.length ? hour.rows.reduce((a, b) => (b.n > a.n ? b : a)).h : null,
    byTable: tables.rows.map((r) => ({
      code: r.code, floor: r.floor, capacity: r.capacity, reservations: r.n,
      bookedMinutes: r.booked_min, usageRate: pct(r.booked_min, openMinutes),
    })),
    topNoShowCustomers: noShowCustomers.rows.map((r) => ({ name: r.full_name, phone: r.phone, noShowCount: r.no_show_count })),
  };
}

const CHANNELS_ORDER = ['website', 'hotline', 'fanpage'];

module.exports = { build, MAX_DAYS };
