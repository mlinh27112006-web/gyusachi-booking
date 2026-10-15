const { AppError } = require('../errors');
const rules = require('../services/bookingRules');
const staffService = require('../services/staffService');

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};

const listMembers = wrap(async (req, res) => {
  res.json({ members: await staffService.listMembers() });
});

const listRoles = wrap(async (req, res) => {
  res.json({ roles: await staffService.listRoles(req.user) });
});

const createMember = wrap(async (req, res) => {
  res.status(201).json(await staffService.createMember(req.user, body(req)));
});

const updateMember = wrap(async (req, res) => {
  const id = rules.validateId(req.params.id, 'nhân viên');
  const b = body(req);
  res.json(await staffService.updateMember(req.user, id, { fullName: b.fullName, role: b.role, isActive: b.isActive }));
});

const resetPassword = wrap(async (req, res) => {
  const id = rules.validateId(req.params.id, 'nhân viên');
  await staffService.resetPassword(req.user, id, body(req).newPassword);
  res.json({ ok: true });
});

const changeOwnPassword = wrap(async (req, res) => {
  const b = body(req);
  await staffService.changeOwnPassword(req.user, b.oldPassword, b.newPassword);
  res.json({ ok: true });
});

const listAudit = wrap(async (req, res) => {
  const q = req.query;
  for (const key of ['from', 'to']) {
    if (q[key] && !rules.isValidDate(q[key])) throw new AppError(400, 'Ngày không hợp lệ (YYYY-MM-DD)', 'INVALID_DATE');
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const staffId = q.staffId ? rules.validateId(q.staffId, 'nhân viên') : null;
  const action = String(q.action || '').trim().slice(0, 40);
  if (action && !/^[a-z_.]+$/.test(action)) throw new AppError(400, 'Loại thao tác không hợp lệ', 'INVALID_ACTION');
  res.json(await staffService.listAudit({
    from: q.from || null, to: q.to || null, action: action || null, staffId,
    q: String(q.q || '').trim().slice(0, 50) || null, limit, offset,
  }));
});

module.exports = { listMembers, listRoles, createMember, updateMember, resetPassword, changeOwnPassword, listAudit };
