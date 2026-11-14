const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { withDefaults, applyChange } = require('../lib/userSettings');

async function readSettings(pool, userId) {
  const [rows] = await pool.query('SELECT settings FROM user_settings WHERE user_id = ?', [userId]);
  const stored = rows[0] ? rows[0].settings : null;
  return typeof stored === 'string' ? JSON.parse(stored) : stored;
}

function createSettingsRouter(pool, wsHub) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(withDefaults(await readSettings(pool, req.session.userId)));
  }));

  // Changes only what is sent: { targets: { loadsPerDay: 9 } } leaves every
  // other setting as it was.
  router.patch('/', asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const next = applyChange(await readSettings(pool, userId), req.body);
    await pool.query(
      'INSERT INTO user_settings (user_id, settings) VALUES (?, ?) ON DUPLICATE KEY UPDATE settings = VALUES(settings)',
      [userId, JSON.stringify(next)]
    );
    if (wsHub) wsHub.emitToUser(userId, 'settings:changed', next);
    res.json(next);
  }));

  return router;
}

module.exports = createSettingsRouter;
