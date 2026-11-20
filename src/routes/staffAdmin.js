const express = require('express');
const c = require('../controllers/staffController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/roles', requirePermission('staff.view'), c.listRoles);
router.get('/members', requirePermission('staff.view'), c.listMembers);
router.post('/members', requirePermission('staff.create'), c.createMember);
router.patch('/members/:id', requirePermission('staff.create'), c.updateMember);
router.post('/members/:id/reset-password', requirePermission('staff.create'), c.resetPassword);
router.get('/reports', requirePermission('report.view'), require('../controllers/reportController').report);
router.get('/reports/export', requirePermission('report.view'), require('../controllers/reportController').exportCsv);
const maint = require('../services/maintenanceService');
const rules = require('../services/bookingRules');
const bodyOf = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
router.get('/tables', requirePermission('table.manage'), wrap(async (req, res) => res.json({ tables: await maint.listTables() })));
router.patch('/tables/:id', requirePermission('table.manage'), wrap(async (req, res) => {
  const b = bodyOf(req);
  res.json(await maint.setTableActive(req.user, rules.validateId(req.params.id, 'bàn'), b.isActive, b.note));
}));
router.get('/closures', requirePermission('table.manage'), wrap(async (req, res) => res.json({ closures: await maint.listClosures() })));
router.post('/closures', requirePermission('table.manage'), wrap(async (req, res) => res.status(201).json(await maint.createClosure(req.user, bodyOf(req)))));
router.delete('/closures/:id', requirePermission('table.manage'), wrap(async (req, res) => {
  await maint.deleteClosure(req.user, rules.validateId(req.params.id, 'lịch đóng cửa')); res.status(204).end();
}));
router.get('/audit-logs', requirePermission('audit.view'), c.listAudit);

module.exports = router;
