const express = require('express');
const c = require('../controllers/facebookController');

// Địa chỉ Facebook gọi vào (đặt trong cấu hình webhook của ứng dụng Facebook).
const router = express.Router();
router.get('/webhook', c.verify);
router.post('/webhook', c.receive);

module.exports = router;
