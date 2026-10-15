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
router.get('/audit-logs', requirePermission('audit.view'), c.listAudit);

module.exports = router;
