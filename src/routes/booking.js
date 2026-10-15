const express = require('express');
const c = require('../controllers/bookingController');

const router = express.Router();

router.get('/availability', c.availability);
router.get('/tables/map', c.tableMap);
router.post('/locks', c.createLock);
router.delete('/locks/:token', c.releaseLock);
router.post('/reservations', c.createPublic);
router.post('/reservations/lookup', c.lookup);
router.post('/reservations/cancel', c.cancel);

// Số lượt đặt bàn trong tháng (hiển thị công khai trên trang chủ).
router.get('/stats/month', async (req, res, next) => {
  try {
    const db = require('../db');
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM reservations
        WHERE status IN ('confirmed','completed')
          AND date_trunc('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
    res.json({ count: rows[0].n });
  } catch (e) { next(e); }
});

module.exports = router;
