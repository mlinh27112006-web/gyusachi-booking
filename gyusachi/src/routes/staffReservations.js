const express = require('express');
const c = require('../controllers/bookingController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/slots', requirePermission('table.view'), c.staffSlots);
router.get('/tables/map', requirePermission('table.view'), c.staffTableMap);
router.post('/reservations', requirePermission('reservation.create'), c.staffCreate);
router.get('/reservations', requirePermission('reservation.view'), c.staffList);
router.get('/reservations/:id', requirePermission('reservation.view'), c.staffGet);
router.post('/reservations/:id/:action', requirePermission('reservation.update_status'), c.staffAction);

module.exports = router;
