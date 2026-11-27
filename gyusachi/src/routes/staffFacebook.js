const express = require('express');
const c = require('../controllers/facebookController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requirePermission('facebook.handle'));

router.get('/status', c.status);
router.post('/demo', c.demo);
router.get('/conversations', c.conversations);
router.get('/messages', c.messages);
router.post('/reply', c.reply);
router.get('/auto-replies', c.listRules);
router.post('/auto-replies', c.createRule);
router.patch('/auto-replies/:id', c.updateRule);
router.delete('/auto-replies/:id', c.deleteRule);

module.exports = router;
