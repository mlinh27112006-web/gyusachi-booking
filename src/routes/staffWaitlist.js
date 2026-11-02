const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { AppError } = require('../errors');
const rules = require('../services/bookingRules');
const waitlist = require('../services/waitlistService');
const { getSettings, getOpeningHours } = require('../settings');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('reservation.view'), async (req, res, next) => {
  try { res.json({ entries: await waitlist.list() }); } catch (e) { next(e); }
});

// Nhân viên ghi tên chờ hộ khách (hotline, fanpage).
router.post('/', requirePermission('reservation.create'), async (req, res, next) => {
  try {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
    const party = Number(b.party);
    if (!Number.isInteger(party) || party < 1 || party > 20) throw new AppError(400, 'Số khách phải từ 1 đến 20', 'INVALID_PARTY');
    const start = rules.validateSlot(b.date, b.time, settings, hours);
    const channel = ['hotline', 'fanpage'].includes(b.channel) ? b.channel : (req.user.role === 'fanpage_staff' ? 'fanpage' : 'hotline');
    const r = await waitlist.join({
      name: rules.validateName(b.name), phone: rules.normalizePhone(b.phone), party, start, channel,
      staffId: req.user.id, note: rules.validateNote(b.note),
    });
    res.status(r.existed ? 200 : 201).json(r);
  } catch (e) { next(e); }
});

router.post('/:id/:action', requirePermission('reservation.update_status'), async (req, res, next) => {
  try { res.json(await waitlist.staffAction(rules.validateId(req.params.id, 'lượt chờ'), req.params.action, req.user)); } catch (e) { next(e); }
});

module.exports = router;
