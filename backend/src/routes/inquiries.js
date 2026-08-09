const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

function createInquiriesRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM email_inquiries WHERE user_id = ? ORDER BY received_at DESC',
      [req.session.userId]
    );
    res.json(rows);
  }));

  return router;
}

module.exports = createInquiriesRouter;
