const express = require('express');
const { login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Chặn dò mật khẩu qua nhiều tên đăng nhập từ cùng một địa chỉ (bộ khóa theo tên đăng nhập chỉ chặn từng tài khoản).
router.post('/login', rateLimit({ name: 'login', max: 20, windowMs: 10 * 60000, message: 'Bạn đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút' }), login);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, require('../controllers/staffController').changeOwnPassword);

module.exports = router;
