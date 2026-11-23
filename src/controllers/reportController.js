const { AppError } = require('../errors');
const db = require('../db');
const rules = require('../services/bookingRules');
const reportService = require('../services/reportService');
const csv = require('../services/csvExport');

function range(req) {
  const today = rules.vnNow().date;
  const to = req.query.to || today;
  const from = req.query.from || rules.addDays(to, -29);
  if (!rules.isValidDate(from) || !rules.isValidDate(to)) throw new AppError(400, 'Ngày không hợp lệ (YYYY-MM-DD)', 'INVALID_DATE');
  if (from > to) throw new AppError(400, 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc', 'INVALID_RANGE');
  if (rules.addDays(from, reportService.MAX_DAYS - 1) < to) {
    throw new AppError(400, `Chỉ xem được tối đa ${reportService.MAX_DAYS} ngày một lần`, 'RANGE_TOO_LONG');
  }
  return { from, to };
}

// GET /api/staff/reports?from=YYYY-MM-DD&to=YYYY-MM-DD  (mặc định 30 ngày gần nhất, tối đa 92 ngày)
async function report(req, res, next) {
  try { const { from, to } = range(req); res.json(await reportService.build(from, to)); } catch (err) { next(err); }
}

// GET /api/staff/reports/export?kind=reservations|days&from=&to=  -> file CSV (có số điện thoại khách nên ghi nhật ký)
async function exportCsv(req, res, next) {
  try {
    const { from, to } = range(req);
    const kind = req.query.kind;
    if (kind !== 'days' && kind !== 'reservations') throw new AppError(400, 'kind phải là reservations hoặc days', 'INVALID_KIND');
    const body = kind === 'days' ? await csv.days(from, to) : await csv.reservations(from, to);
    await db.query(
      `INSERT INTO audit_logs (staff_id, actor_label, action, entity_type, entity_id, detail)
       VALUES ($1, 'staff', 'report.export', 'report', $2, $3::jsonb)`,
      [req.user.id, kind, JSON.stringify({ from, to, kind })]);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.attachment(`gyusachi-${kind === 'days' ? 'theo-ngay' : 'luot-dat'}-${from}_${to}.csv`);
    res.send(body);
  } catch (err) { next(err); }
}

module.exports = { report, exportCsv };
