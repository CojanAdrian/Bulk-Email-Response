const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { isEquipmentCompatible } = require('../lib/equipmentCompat');

const RANGE_DAYS = { 30: 30, 90: 90 };

// A lane-history row's customer is its linked load's customer when there is
// one, otherwise whatever was typed on the history row itself.
const EFFECTIVE_CUSTOMER = "COALESCE(NULLIF(TRIM(l.customer), ''), NULLIF(TRIM(h.customer), ''))";

function later(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(a) > String(b) ? a : b;
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

function createCustomersRouter(pool) {
  const router = express.Router();

  // Every customer the user has loads or carrier runs for, grouped
  // case-insensitively ("ALDI, Inc" and "aldi, inc" are one customer).
  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.session.userId;
    const [loadRows] = await pool.query(
      `SELECT TRIM(customer) AS name, load_type, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS activity
       FROM loads WHERE user_id = ? AND customer IS NOT NULL AND TRIM(customer) <> ''`,
      [userId]
    );
    const [historyRows] = await pool.query(
      `SELECT ${EFFECTIVE_CUSTOMER} AS name, h.carrier_id,
              DATE_FORMAT(COALESCE(h.ran_at, h.created_at), '%Y-%m-%dT%H:%i:%s') AS activity
       FROM carrier_lane_history h LEFT JOIN loads l ON l.id = h.load_id
       WHERE h.user_id = ?`,
      [userId]
    );

    const byKey = new Map();
    function entryFor(name) {
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name, loadCount: 0, contractLoads: 0, spotLoads: 0, carriers: new Set(), lastActivity: null });
      return byKey.get(key);
    }
    for (const row of loadRows) {
      const entry = entryFor(row.name);
      entry.loadCount += 1;
      if (row.load_type === 'contract') entry.contractLoads += 1;
      if (row.load_type === 'spot') entry.spotLoads += 1;
      entry.lastActivity = later(entry.lastActivity, row.activity);
    }
    for (const row of historyRows) {
      if (!row.name) continue;
      const entry = entryFor(row.name);
      entry.carriers.add(row.carrier_id);
      entry.lastActivity = later(entry.lastActivity, row.activity);
    }

    const list = [...byKey.values()]
      .map((e) => ({
        name: e.name,
        loadCount: e.loadCount,
        contractLoads: e.contractLoads,
        spotLoads: e.spotLoads,
        // How this customer mostly ships with us.
        loadType: e.contractLoads && e.spotLoads ? 'mixed' : e.contractLoads ? 'contract' : e.spotLoads ? 'spot' : null,
        carrierCount: e.carriers.size,
        lastActivity: e.lastActivity,
      }))
      .sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')) || a.name.localeCompare(b.name));
    res.json(list);
  }));

  // Every load for one customer -- what's still available and what's been
  // done -- with the carrier who hauled each done load (the most recent
  // lane-history entry tied to it). Same range / equipment / load-type
  // filters as the carriers view.
  router.get('/loads', asyncHandler(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    if (name === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const conditions = ['l.user_id = ?', 'LOWER(TRIM(l.customer)) = LOWER(?)'];
    const values = [req.session.userId, name];
    if (req.query.loadType === 'contract' || req.query.loadType === 'spot') {
      conditions.push('l.load_type = ?');
      values.push(req.query.loadType);
    }
    const days = RANGE_DAYS[req.query.range];
    if (days) {
      // An available load always shows; a done one only if it was booked
      // (or last touched) inside the range.
      conditions.push("(l.status = 'active' OR COALESCE(l.booked_at, l.updated_at) >= (NOW() - INTERVAL ? DAY))");
      values.push(days);
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.load_number, l.status, l.load_type, l.equipment, l.weight,
              l.origin_city, l.origin_state, l.dest_city, l.dest_state, l.target_pay,
              DATE_FORMAT(l.early_pu, '%Y-%m-%dT%H:%i:%s') AS early_pu,
              DATE_FORMAT(l.late_pu, '%Y-%m-%dT%H:%i:%s') AS late_pu,
              DATE_FORMAT(COALESCE(l.booked_at, h.created_at, l.updated_at), '%Y-%m-%dT%H:%i:%s') AS done_at,
              h.carrier_id, c.company_name AS carrier_name, h.rate, h.gp
       FROM loads l
       LEFT JOIN (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY load_id ORDER BY created_at DESC) AS rn
         FROM carrier_lane_history
         WHERE load_id IS NOT NULL
       ) h ON h.load_id = l.id AND h.rn = 1
       LEFT JOIN carriers c ON c.id = h.carrier_id
       WHERE ${conditions.join(' AND ')}`,
      values
    );

    const equipment = req.query.equipment ? String(req.query.equipment).trim().toUpperCase() : null;
    const filtered = equipment ? rows.filter((row) => isEquipmentCompatible(equipment, row.equipment ? [row.equipment] : [])) : rows;

    const available = filtered
      .filter((row) => row.status === 'active')
      .sort((a, b) => String(a.early_pu ?? '9999').localeCompare(String(b.early_pu ?? '9999')));
    const done = filtered
      .filter((row) => row.status !== 'active')
      .sort((a, b) => String(b.done_at ?? '').localeCompare(String(a.done_at ?? '')));
    res.json({ available, done });
  }));

  // Carriers who have hauled for one customer, on any lane.
  router.get('/carriers', asyncHandler(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    if (name === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const conditions = ['h.user_id = ?', `LOWER(${EFFECTIVE_CUSTOMER}) = LOWER(?)`];
    const values = [req.session.userId, name];
    if (req.query.loadType === 'contract' || req.query.loadType === 'spot') {
      conditions.push('l.load_type = ?');
      values.push(req.query.loadType);
    }
    const days = RANGE_DAYS[req.query.range];
    if (days) {
      conditions.push('COALESCE(h.ran_at, DATE(h.created_at)) >= (CURDATE() - INTERVAL ? DAY)');
      values.push(days);
    }
    const [rows] = await pool.query(
      `SELECT h.carrier_id, c.company_name, c.mc_number, c.equipment_types, l.equipment AS load_equipment,
              h.origin_city, h.origin_state, h.dest_city, h.dest_state, h.rate, h.gp,
              DATE_FORMAT(COALESCE(h.ran_at, DATE(h.created_at)), '%Y-%m-%d') AS ran_at
       FROM carrier_lane_history h
       JOIN carriers c ON c.id = h.carrier_id
       LEFT JOIN loads l ON l.id = h.load_id
       WHERE ${conditions.join(' AND ')}`,
      values
    );

    const equipment = req.query.equipment ? String(req.query.equipment).trim().toUpperCase() : null;
    const byCarrier = new Map();
    for (const row of rows) {
      const rowEquipment = row.load_equipment ? [row.load_equipment] : row.equipment_types;
      if (equipment && !isEquipmentCompatible(equipment, rowEquipment)) continue;
      const carrier = byCarrier.get(row.carrier_id) || {
        carrierId: row.carrier_id, carrierName: row.company_name, mcNumber: row.mc_number,
        runs: 0, lastRanAt: null, rates: [], gps: [], lanes: new Map(),
      };
      carrier.runs += 1;
      carrier.lastRanAt = later(carrier.lastRanAt, row.ran_at);
      if (row.rate !== null) carrier.rates.push(Number(row.rate));
      if (row.gp !== null) carrier.gps.push(Number(row.gp));
      const lane = `${row.origin_city}, ${row.origin_state} → ${row.dest_city}, ${row.dest_state}`;
      carrier.lanes.set(lane, (carrier.lanes.get(lane) || 0) + 1);
      byCarrier.set(row.carrier_id, carrier);
    }

    const result = [...byCarrier.values()]
      .map((c) => ({
        carrierId: c.carrierId,
        carrierName: c.carrierName,
        mcNumber: c.mcNumber,
        runs: c.runs,
        lastRanAt: c.lastRanAt,
        avgRate: average(c.rates),
        avgGp: average(c.gps),
        lanes: [...c.lanes.entries()].map(([lane, runs]) => ({ lane, runs })).sort((a, b) => b.runs - a.runs),
      }))
      .sort((a, b) => b.runs - a.runs || String(b.lastRanAt ?? '').localeCompare(String(a.lastRanAt ?? '')));
    res.json(result);
  }));

  // "Delete" a customer: clears that customer name from every load and
  // lane-history entry. The loads and carrier runs themselves are kept --
  // nothing a broker needs is lost, the customer just disappears from the
  // Customers list (until a later CSV upload names it again).
  router.delete('/', asyncHandler(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    if (name === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const userId = req.session.userId;
    const [loadResult] = await pool.query(
      'UPDATE loads SET customer = NULL WHERE user_id = ? AND LOWER(TRIM(customer)) = LOWER(?)',
      [userId, name]
    );
    const [historyResult] = await pool.query(
      'UPDATE carrier_lane_history SET customer = NULL WHERE user_id = ? AND LOWER(TRIM(customer)) = LOWER(?)',
      [userId, name]
    );
    res.json({ loadsCleared: loadResult.affectedRows, historyCleared: historyResult.affectedRows });
  }));

  return router;
}

module.exports = createCustomersRouter;
