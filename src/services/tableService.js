const db = require('../db');
const { AppError } = require('../errors');

// Khoảng thời gian giữ bàn: bắt đầu từ $1, kéo dài $2 phút.
const RANGE = "tstzrange($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), '[)')";
const AVAILABLE_SQL =
  'available_tables($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), $3::smallint, $4::uuid)';

// Sơ đồ bàn cho một khung giờ. Mỗi bàn có selectable (chọn được hay không) và reason:
//   too_small   bàn nhỏ hơn số khách
//   taken       đã có người đặt hoặc đang bị khách khác giữ
//   not_offered còn trống nhưng chưa tới lượt (vẫn còn bàn vừa hơn). Chỉ có ở chế độ khách.
// staffMode = true: nhân viên được chọn mọi bàn còn trống và đủ chỗ.
async function getTableMap({ start, holdMinutes, party, lockToken = null, staffMode = false }) {
  const tablesRes = await db.query(
    `SELECT id, code, floor, capacity, is_vip, map_x, map_y
       FROM dining_tables WHERE is_active ORDER BY floor, code`
  );
  const takenRes = await db.query(
    `SELECT table_id FROM reservations
      WHERE (status = 'confirmed' OR released_at IS NOT NULL) AND tstzrange(start_time, end_time, '[)') && ${RANGE}
     UNION
     SELECT table_id FROM table_locks
      WHERE expires_at > now() AND during && ${RANGE}
        AND lock_token IS DISTINCT FROM $3::uuid`,
    [start, holdMinutes, lockToken]
  );
  const taken = new Set(takenRes.rows.map((r) => r.table_id));

  let offered;
  if (staffMode) {
    offered = new Set(
      tablesRes.rows.filter((t) => t.capacity >= party && !taken.has(t.id)).map((t) => t.id)
    );
  } else {
    const r = await db.query(`SELECT id FROM ${AVAILABLE_SQL}`, [start, holdMinutes, party, lockToken]);
    offered = new Set(r.rows.map((x) => x.id));
  }

  const tables = tablesRes.rows.map((t) => {
    let reason = null;
    if (!offered.has(t.id)) {
      if (t.capacity < party) reason = 'too_small';
      else if (taken.has(t.id)) reason = 'taken';
      else reason = 'not_offered';
    }
    return {
      id: t.id,
      code: t.code,
      floor: t.floor,
      capacity: t.capacity,
      isVip: t.is_vip,
      mapX: Number(t.map_x),
      mapY: Number(t.map_y),
      selectable: offered.has(t.id),
      reason,
    };
  });
  return { tables };
}

// Số bàn khách được chọn ở một khung giờ (dùng để hiện giờ nào còn chỗ).
async function countAvailable({ start, holdMinutes, party }) {
  const r = await db.query(`SELECT count(*)::int AS n FROM ${AVAILABLE_SQL}`, [start, holdMinutes, party, null]);
  return r.rows[0].n;
}

// Giữ bàn tạm cho khách đang điền form. Mỗi trình duyệt (token) chỉ giữ một bàn,
// đổi bàn thì khóa cũ được nhả. Trả về token và giờ hết hạn.
async function acquireLock({ tableId, start, holdMinutes, party, token = null, ttlSeconds }) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM table_locks WHERE expires_at <= now()');
    if (token) await client.query('DELETE FROM table_locks WHERE lock_token = $1::uuid', [token]);

    const ok = await client.query(
      `SELECT id FROM ${AVAILABLE_SQL} WHERE id = $5`,
      [start, holdMinutes, party, null, tableId]
    );
    if (ok.rowCount === 0) {
      throw new AppError(409, 'Bàn này không còn trống hoặc không phù hợp với số khách của bạn. Vui lòng chọn bàn khác', 'TABLE_UNAVAILABLE');
    }

    const lock = await client.query(
      `INSERT INTO table_locks (table_id, during, expires_at, lock_token)
       VALUES ($5, tstzrange($1::timestamptz, $1::timestamptz + make_interval(mins => $2::int), '[)'),
               now() + make_interval(secs => $3::int), COALESCE($4::uuid, gen_random_uuid()))
       RETURNING lock_token, expires_at`,
      [start, holdMinutes, ttlSeconds, token, tableId]
    );
    return { lockToken: lock.rows[0].lock_token, expiresAt: lock.rows[0].expires_at, ttlSeconds };
  });
}

async function releaseLock(token) {
  await db.query('DELETE FROM table_locks WHERE lock_token = $1::uuid', [token]);
}

module.exports = { getTableMap, countAvailable, acquireLock, releaseLock };
