const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { geocodeCityState } = require('../lib/geocoding');
const { findMatchesForLane } = require('../lib/carrierMatching');

// Selects every one of the user's carrier_lane_history rows joined with
// their carrier's name/equipment (what findMatchesForLane needs), plus
// every carrier with zero history rows but a non-empty operating_states
// tag (candidates for the regional-match path).
async function loadCandidates(pool, userId) {
  const [historyRows] = await pool.query(
    `SELECT h.id, h.carrier_id, c.company_name AS carrier_company_name, c.equipment_types AS carrier_equipment_types,
            h.origin_lat, h.origin_lng, h.dest_lat, h.dest_lng
     FROM carrier_lane_history h
     JOIN carriers c ON c.id = h.carrier_id
     WHERE h.user_id = ?`,
    [userId]
  );
  const [regionalCarriers] = await pool.query(
    `SELECT c.id, c.company_name, c.operating_states
     FROM carriers c
     WHERE c.user_id = ? AND JSON_LENGTH(c.operating_states) > 0
       AND NOT EXISTS (SELECT 1 FROM carrier_lane_history h WHERE h.carrier_id = c.id)`,
    [userId]
  );
  return { historyRows, regionalCarriers };
}

async function resolveQueryLane(pool, { originCity, originState, destCity, destState }) {
  const originGeo = await geocodeCityState(pool, originCity, originState);
  const destGeo = destCity && destState ? await geocodeCityState(pool, destCity, destState) : null;
  if (!originGeo) return null;
  return {
    queryOrigin: { lat: originGeo.lat, lng: originGeo.lng, state: originState },
    queryDest: destGeo ? { lat: destGeo.lat, lng: destGeo.lng, state: destState } : null,
  };
}

// Geocodes each regional match's tagged states (a state name geocodes to
// its rough centroid) and attaches the result, for the globe's points
// layer to plot -- see CarrierMapGlobe.jsx.
async function attachStateCentroids(pool, regionalMatches) {
  for (const match of regionalMatches) {
    const centroids = [];
    for (const state of match.taggedStates) {
      const centroid = await geocodeCityState(pool, state, state);
      if (centroid) centroids.push({ state, lat: centroid.lat, lng: centroid.lng });
    }
    match.stateCentroids = centroids;
  }
  return regionalMatches;
}

const CONTACT_FIELDS = ['mc_number', 'dispatcher_name', 'dispatcher_phone', 'dispatcher_email', 'equipment_types', 'operating_states', 'comment'];

// Merges the carrier's own contact/equipment fields into each match so the
// match list (and the detail sheet opened from it) can show everything
// needed to call the carrier without a second round-trip.
async function attachCarrierDetails(pool, userId, matches) {
  if (matches.length === 0) return matches;
  const ids = matches.map((m) => m.carrierId);
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT id, ${CONTACT_FIELDS.join(', ')} FROM carriers WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...ids]
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const match of matches) {
    const carrier = byId.get(match.carrierId);
    if (carrier) {
      for (const field of CONTACT_FIELDS) {
        match[field] = carrier[field];
      }
    }
  }
  return matches;
}

function createCarrierMatchesRouter(pool) {
  const router = express.Router();

  router.post('/', asyncHandler(async (req, res) => {
    const { originCity, originState, destCity, destState, equipment } = req.body;
    if (!originCity || !originState || !destCity || !destState) {
      return res.status(400).json({ error: 'originCity, originState, destCity, and destState are required' });
    }

    const lane = await resolveQueryLane(pool, { originCity, originState, destCity, destState });
    if (!lane) {
      return res.json({ laneMatches: [], regionalMatches: [] });
    }
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);
    const result = findMatchesForLane({ ...lane, equipment: equipment || null, historyRows, regionalCarriers });
    result.laneMatches = await attachCarrierDetails(pool, req.session.userId, result.laneMatches);
    result.regionalMatches = await attachCarrierDetails(pool, req.session.userId, result.regionalMatches);
    result.regionalMatches = await attachStateCentroids(pool, result.regionalMatches);
    res.json(result);
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { loadId } = req.query;
    if (!loadId) {
      return res.status(400).json({ error: 'loadId is required' });
    }
    const [loadRows] = await pool.query('SELECT * FROM loads WHERE id = ? AND user_id = ?', [loadId, req.session.userId]);
    if (loadRows.length === 0) {
      return res.status(404).json({ error: 'Load not found' });
    }
    const load = loadRows[0];
    const lane = await resolveQueryLane(pool, {
      originCity: load.origin_city, originState: load.origin_state,
      destCity: load.dest_city, destState: load.dest_state,
    });
    if (!lane) {
      return res.json({ laneMatches: [], regionalMatches: [] });
    }
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);
    const result = findMatchesForLane({ ...lane, equipment: load.equipment || null, historyRows, regionalCarriers });
    result.laneMatches = await attachCarrierDetails(pool, req.session.userId, result.laneMatches);
    result.regionalMatches = await attachCarrierDetails(pool, req.session.userId, result.regionalMatches);
    result.regionalMatches = await attachStateCentroids(pool, result.regionalMatches);
    res.json(result);
  }));

  router.post('/bulk', asyncHandler(async (req, res) => {
    const { loadIds } = req.body;
    if (!Array.isArray(loadIds) || loadIds.length === 0) {
      return res.status(400).json({ error: 'loadIds must be a non-empty array' });
    }
    const placeholders = loadIds.map(() => '?').join(', ');
    const [loads] = await pool.query(
      `SELECT * FROM loads WHERE id IN (${placeholders}) AND user_id = ?`,
      [...loadIds, req.session.userId]
    );
    const { historyRows, regionalCarriers } = await loadCandidates(pool, req.session.userId);

    const map = {};
    for (const load of loads) {
      const lane = await resolveQueryLane(pool, {
        originCity: load.origin_city, originState: load.origin_state,
        destCity: load.dest_city, destState: load.dest_state,
      });
      if (!lane) continue;
      const { laneMatches, regionalMatches } = findMatchesForLane({ ...lane, equipment: load.equipment || null, historyRows, regionalCarriers });
      if (laneMatches.length > 0) {
        map[load.id] = { tier: laneMatches[0].tier, count: laneMatches.length };
      } else if (regionalMatches.length > 0) {
        map[load.id] = { tier: regionalMatches[0].tier, count: regionalMatches.length };
      }
    }
    res.json(map);
  }));

  return router;
}

module.exports = createCarrierMatchesRouter;
