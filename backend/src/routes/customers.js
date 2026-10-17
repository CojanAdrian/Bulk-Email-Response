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
      `SELECT TRIM(customer) AS name, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS activity
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
      if (!byKey.has(key)) byKey.set(key, { name, loadCount: 0, carriers: new Set(), lastActivity: null });
      return byKey.get(key);
    }
    for (const row of loadRows) {
      const entry = entryFor(row.name);
      entry.loadCount += 1;
      entry.lastActivity = later(entry.lastActivity, row.activity);
    }
    for (const row of historyRows) {
      if (!row.name) continue;
      const entry = entryFor(row.name);
      entry.carriers.add(row.carrier_id);
      entry.lastActivity = later(entry.lastActivity, row.activity);
    }

    const list = [...byKey.values()]
      .map((e) => ({ name: e.name, loadCount: e.loadCount, carrierCount: e.carriers.size, lastActivity: e.lastActivity }))
      .sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')) || a.name.localeCompare(b.name));
    res.json(list);
  }));

  // Carriers who have hauled for one customer, on any lane.
  router.get('/carriers', asyncHandler(async (req, res) => {
    const name = String(req.query.name ?? '').trim();
    if (name === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const conditions = ['h.user_id = ?', `LOWER(${EFFECTIVE_CUSTOMER}) = LOWER(?)`];
    const values = [req.session.userId, name];
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

  return router;
}

module.exports = createCustomersRouter;
