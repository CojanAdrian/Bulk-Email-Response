const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

const LOAD_COLUMNS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment',
];

function createLoadsRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const query = status
      ? 'SELECT * FROM loads WHERE status = ? ORDER BY created_at DESC'
      : 'SELECT * FROM loads ORDER BY created_at DESC';
    const params = status ? [status] : [];
    const [rows] = await pool.query(query, params);
    res.json(rows);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(rows[0]);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const allowedFields = ['target_pay', 'status'];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.id);
    await pool.query(`UPDATE loads SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(rows[0]);
  }));

  return router;
}

module.exports = { createLoadsRouter, LOAD_COLUMNS };
