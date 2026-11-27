const { AppError } = require('../errors');
const rules = require('../services/bookingRules');
const reportService = require('../services/reportService');

// GET /api/staff/reports?from=YYYY-MM-DD&to=YYYY-MM-DD  (mặc định 30 ngày gần nhất, tối đa 92 ngày)
async function report(req, res, next) {
  try {
    const today = rules.vnNow().date;
    const to = req.query.to || today;
    const from = req.query.from || rules.addDays(to, -29);
    if (!rules.isValidDate(from) || !rules.isValidDate(to)) throw new AppError(400, 'Ngày không hợp lệ (YYYY-MM-DD)', 'INVALID_DATE');
    if (from > to) throw new AppError(400, 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc', 'INVALID_RANGE');
    if (rules.addDays(from, reportService.MAX_DAYS - 1) < to) {
      throw new AppError(400, `Chỉ xem được tối đa ${reportService.MAX_DAYS} ngày một lần`, 'RANGE_TOO_LONG');
    }
    res.json(await reportService.build(from, to));
  } catch (err) { next(err); }
}

module.exports = { report };
