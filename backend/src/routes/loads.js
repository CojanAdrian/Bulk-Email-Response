const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

const LOAD_COLUMNS = [
  'load_number', 'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'raw_equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment',
];

// Deliberately excludes load_number (the upload/matching key -- editing it here
// could desync a load from future CSV re-uploads keyed on the original number),
// raw_equipment (an internal parsing artifact from CSV upload, not something a
// person types), and of course id/user_id/created_at/updated_at.
const EDITABLE_FIELDS = [
  'origin_city', 'origin_state', 'origin_zip',
  'dest_city', 'dest_state', 'dest_zip', 'equipment', 'weight',
  'target_pay', 'early_pu', 'late_pu', 'late_del', 'stops',
  'commodity', 'temperature', 'comment', 'status',
];

function createLoadsRouter(pool, wsHub) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const isAdmin = req.session.role === 'admin';
    const conditions = [];
    const params = [];
    if (!isAdmin) {
      conditions.push('user_id = ?');
      params.push(req.session.userId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`SELECT * FROM loads ${whereClause} ORDER BY created_at DESC`, params);
    res.json(rows);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM loads WHERE id = ?', [req.params.id]);
    const load = rows[0];
    const isAdmin = req.session.role === 'admin';
    if (!load || (!isAdmin && load.user_id !== req.session.userId)) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(load);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id, user_id FROM loads WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    const isAdmin = req.session.role === 'admin';
    if (!existing || (!isAdmin && existing.user_id !== req.session.userId)) {
      return res.status(404).json({ error: 'Load not found' });
    }

    const updates = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
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
    if (wsHub) wsHub.emitToUser(req.session.userId, 'load:changed', { loadId: rows[0].id });
    res.json(rows[0]);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const [existingRows] = await pool.query('SELECT id, user_id FROM loads WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    const isAdmin = req.session.role === 'admin';
    if (!existing || (!isAdmin && existing.user_id !== req.session.userId)) {
      return res.status(404).json({ error: 'Load not found' });
    }

    await pool.query('DELETE FROM loads WHERE id = ?', [req.params.id]);
    if (wsHub) wsHub.emitToUser(req.session.userId, 'load:changed', { loadId: existing.id, deleted: true });
    res.json({ ok: true });
  }));

  router.post('/upload', asyncHandler(async (req, res) => {
    const { loads } = req.body;
    if (!Array.isArray(loads)) {
      return res.status(400).json({ error: 'loads must be an array' });
    }

    const userId = req.session.userId;
    let inserted = 0;
    let updated = 0;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Determine which load_numbers already exist up front, rather than
      // inferring insert-vs-update from MySQL's affectedRows. MySQL reports
      // affectedRows === 1 both for a genuine new-row insert AND for an
      // ON DUPLICATE KEY UPDATE that matches an existing row but changes no
      // column values (a no-op re-upload of unchanged data) — only an
      // actual value change reports 2. Relying on affectedRows alone would
      // misclassify unchanged re-uploads as "inserted". Scoped to the
      // current user, since load_number is only unique per-user.
      const loadNumbers = loads.map((load) => load.load_number).filter((n) => n !== undefined && n !== null);
      const existing = new Set();
      if (loadNumbers.length) {
        const placeholders = loadNumbers.map(() => '?').join(', ');
        const [existingRows] = await connection.query(
          `SELECT load_number FROM loads WHERE user_id = ? AND load_number IN (${placeholders})`,
          [userId, ...loadNumbers]
        );
        existingRows.forEach((row) => existing.add(row.load_number));
      }

      for (const load of loads) {
        const columns = [...LOAD_COLUMNS.filter((col) => load[col] !== undefined), 'user_id'];
        const placeholders = columns.map(() => '?').join(', ');
        const values = [...LOAD_COLUMNS.filter((col) => load[col] !== undefined).map((col) => load[col]), userId];
        // Deliberately excludes both load_number (identifies the row) and
        // user_id (must never change on a re-upload — ownership can't be
        // transferred by someone else uploading the same load_number, since
        // load_number is only unique per-user anyway).
        // If the load has no fields besides load_number, there's nothing to
        // update on a re-upload -- fall back to a harmless no-op assignment
        // instead of emitting an empty (invalid) UPDATE clause.
        const updateColumns = columns.filter((col) => col !== 'load_number' && col !== 'user_id');
        const updateClause = updateColumns.length
          ? updateColumns.map((col) => `${col} = VALUES(${col})`).join(', ')
          : 'load_number = VALUES(load_number)';

        await connection.query(
          `INSERT INTO loads (${columns.join(', ')}) VALUES (${placeholders})
           ON DUPLICATE KEY UPDATE ${updateClause}`,
          values
        );
        if (existing.has(load.load_number)) {
          updated += 1;
        } else {
          inserted += 1;
          existing.add(load.load_number);
        }
      }

      // A re-upload represents the current full board -- any of this user's
      // loads that were 'active' before but aren't in THIS upload are no
      // longer posted, so they're retired automatically. 'booked'/'covered'/
      // already-'expired' loads are left alone: those record a real outcome
      // the user set deliberately, not something a re-upload should silently
      // overwrite just because the load number wasn't in today's file.
      // Guarded on a non-empty loadNumbers set so an empty/malformed upload
      // can't wipe out the entire active board.
      let expired = 0;
      if (loadNumbers.length) {
        const placeholders = loadNumbers.map(() => '?').join(', ');
        const [expireResult] = await connection.query(
          `UPDATE loads SET status = 'expired'
           WHERE user_id = ? AND status = 'active' AND load_number NOT IN (${placeholders})`,
          [userId, ...loadNumbers]
        );
        expired = expireResult.affectedRows;
      }

      await connection.commit();
      if (wsHub) wsHub.emitToUser(userId, 'load:changed', {});
      res.json({ inserted, updated, expired });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }));

  return router;
}

module.exports = { createLoadsRouter, LOAD_COLUMNS };
