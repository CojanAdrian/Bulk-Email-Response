const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { titleCaseCity, upperState } = require('../lib/normalizeLocation');
const { geocodeCityState } = require('../lib/geocoding');

const CARRIER_FIELDS = [
  'mc_number', 'company_name', 'dispatcher_name', 'dispatcher_phone',
  'equipment_types', 'equipment_notes', 'operating_states', 'operating_notes', 'comment',
];
const JSON_CARRIER_FIELDS = new Set(['equipment_types', 'operating_states']);

function createCarriersRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { q } = req.query;
    const params = [req.session.userId];
    let sql = 'SELECT * FROM carriers WHERE user_id = ?';
    if (q) {
      sql += ' AND (company_name LIKE ? OR mc_number LIKE ? OR dispatcher_name LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY company_name ASC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  }));

  // Finds an existing carrier for this user by MC number (if given),
  // falling back to a case-insensitive company name match, or creates a
  // new one -- so logging the same carrier from different places (the
  // standalone Carriers tab, the booking-flow hook) never creates
  // duplicate carrier identities. Any newly-provided fields are merged
  // into a matched carrier.
  async function findOrCreateCarrier(userId, body, companyName) {
    const mcNumber = body.mc_number ? String(body.mc_number).trim() : null;

    let existing = null;
    if (mcNumber) {
      const [rows] = await pool.query('SELECT * FROM carriers WHERE user_id = ? AND mc_number = ?', [userId, mcNumber]);
      existing = rows[0] || null;
    }
    if (!existing) {
      const [rows] = await pool.query('SELECT * FROM carriers WHERE user_id = ? AND LOWER(company_name) = LOWER(?)', [userId, companyName]);
      existing = rows[0] || null;
    }

    if (existing) {
      const updates = [];
      const values = [];
      for (const field of CARRIER_FIELDS) {
        if (body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
        }
      }
      if (updates.length > 0) {
        values.push(existing.id);
        await pool.query(`UPDATE carriers SET ${updates.join(', ')} WHERE id = ?`, values);
      }
      const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [existing.id]);
      return rows[0];
    }

    const columns = ['user_id', 'company_name'];
    const values = [userId, companyName];
    for (const field of CARRIER_FIELDS) {
      if (field === 'company_name') continue;
      if (body[field] !== undefined) {
        columns.push(field);
        values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
      }
    }
    const placeholders = columns.map(() => '?').join(', ');
    const [result] = await pool.query(`INSERT INTO carriers (${columns.join(', ')}) VALUES (${placeholders})`, values);
    const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  router.post('/', asyncHandler(async (req, res) => {
    const companyName = String(req.body.company_name || '').trim();
    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required' });
    }
    const carrier = await findOrCreateCarrier(req.session.userId, req.body, companyName);
    res.json(carrier);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    const updates = [];
    const values = [];
    for (const field of CARRIER_FIELDS) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(JSON_CARRIER_FIELDS.has(field) ? JSON.stringify(req.body[field]) : req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.id);
    await pool.query(`UPDATE carriers SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query('SELECT * FROM carriers WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    await pool.query('DELETE FROM carriers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));

  router.get('/:id/history', asyncHandler(async (req, res) => {
    const [carrierRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (carrierRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE carrier_id = ? ORDER BY ran_at DESC, created_at DESC', [req.params.id]);
    res.json(rows);
  }));

  router.post('/:id/history', asyncHandler(async (req, res) => {
    const [carrierRows] = await pool.query('SELECT id FROM carriers WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (carrierRows.length === 0) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    const originCity = titleCaseCity(req.body.origin_city);
    const originState = upperState(req.body.origin_state);
    const destCity = titleCaseCity(req.body.dest_city);
    const destState = upperState(req.body.dest_state);
    if (!originCity || !originState || !destCity || !destState) {
      return res.status(400).json({ error: 'origin_city, origin_state, dest_city, and dest_state are required' });
    }

    const origin = await geocodeCityState(pool, originCity, originState);
    const dest = await geocodeCityState(pool, destCity, destState);

    const [result] = await pool.query(
      `INSERT INTO carrier_lane_history
       (carrier_id, user_id, load_id, origin_city, origin_state, origin_lat, origin_lng,
        dest_city, dest_state, dest_lat, dest_lng, rate, driver_name, driver_phone, comment, ran_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.session.userId, req.body.load_id || null,
        originCity, originState, origin ? origin.lat : null, origin ? origin.lng : null,
        destCity, destState, dest ? dest.lat : null, dest ? dest.lng : null,
        req.body.rate ?? null, req.body.driver_name || null, req.body.driver_phone || null,
        req.body.comment || null, req.body.ran_at || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  }));

  router.patch('/history/:historyId', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ? AND user_id = ?', [req.params.historyId, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    const existing = rows[0];

    const updates = [];
    const values = [];

    if (req.body.origin_city !== undefined || req.body.origin_state !== undefined) {
      const originCity = req.body.origin_city !== undefined ? titleCaseCity(req.body.origin_city) : existing.origin_city;
      const originState = req.body.origin_state !== undefined ? upperState(req.body.origin_state) : existing.origin_state;
      const origin = await geocodeCityState(pool, originCity, originState);
      updates.push('origin_city = ?', 'origin_state = ?', 'origin_lat = ?', 'origin_lng = ?');
      values.push(originCity, originState, origin ? origin.lat : null, origin ? origin.lng : null);
    }
    if (req.body.dest_city !== undefined || req.body.dest_state !== undefined) {
      const destCity = req.body.dest_city !== undefined ? titleCaseCity(req.body.dest_city) : existing.dest_city;
      const destState = req.body.dest_state !== undefined ? upperState(req.body.dest_state) : existing.dest_state;
      const dest = await geocodeCityState(pool, destCity, destState);
      updates.push('dest_city = ?', 'dest_state = ?', 'dest_lat = ?', 'dest_lng = ?');
      values.push(destCity, destState, dest ? dest.lat : null, dest ? dest.lng : null);
    }
    for (const field of ['rate', 'driver_name', 'driver_phone', 'comment', 'ran_at']) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    values.push(req.params.historyId);
    await pool.query(`UPDATE carrier_lane_history SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM carrier_lane_history WHERE id = ?', [req.params.historyId]);
    res.json(updated[0]);
  }));

  router.delete('/history/:historyId', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT id FROM carrier_lane_history WHERE id = ? AND user_id = ?', [req.params.historyId, req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    await pool.query('DELETE FROM carrier_lane_history WHERE id = ?', [req.params.historyId]);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createCarriersRouter;
