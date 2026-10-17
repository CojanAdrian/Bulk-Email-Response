const { isEquipmentCompatible } = require('./equipmentCompat');

function normPart(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Exact-lane identity: same origin city+state and dest city+state, ignoring
// case, spacing and punctuation ("St. Louis" === "ST LOUIS").
function laneKey(originCity, originState, destCity, destState) {
  const parts = [originCity, originState, destCity, destState].map(normPart);
  if (parts.some((p) => p === '')) return null;
  return parts.join('|');
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// Returns { [loadId]: [{ carrierId, carrierName, runs, lastRanAt, lastRate }] }
// for every load at least one carrier has run on the exact same lane with
// compatible equipment. Loads with no such carrier are omitted. A history
// row's equipment is its linked load's equipment when it has one, otherwise
// the carrier's own equipment_types.
function findProvenCarriers(loads, historyRows) {
  const byLane = new Map();
  for (const row of historyRows) {
    const key = laneKey(row.origin_city, row.origin_state, row.dest_city, row.dest_state);
    if (!key) continue;
    if (!byLane.has(key)) byLane.set(key, []);
    byLane.get(key).push(row);
  }

  const result = {};
  for (const load of loads) {
    const key = laneKey(load.origin_city, load.origin_state, load.dest_city, load.dest_state);
    const candidates = key ? byLane.get(key) : null;
    if (!candidates) continue;

    const perCarrier = new Map();
    for (const row of candidates) {
      const rowEquipment = row.load_equipment ? [row.load_equipment] : row.carrier_equipment_types;
      if (!isEquipmentCompatible(load.equipment, rowEquipment)) continue;
      const ranAt = toDateString(row.ran_at) || toDateString(row.created_at);
      const rate = row.rate === null || row.rate === undefined ? null : Number(row.rate);
      const entry = perCarrier.get(row.carrier_id) || {
        carrierId: row.carrier_id, carrierName: row.carrier_name, runs: 0, lastRanAt: null, lastRate: null,
      };
      entry.runs += 1;
      if (entry.lastRanAt === null || (ranAt && ranAt > entry.lastRanAt)) {
        entry.lastRanAt = ranAt;
        if (rate !== null) entry.lastRate = rate;
      }
      if (entry.lastRate === null && rate !== null) entry.lastRate = rate;
      perCarrier.set(row.carrier_id, entry);
    }
    if (perCarrier.size === 0) continue;
    result[load.id] = [...perCarrier.values()].sort(
      (a, b) => b.runs - a.runs || String(b.lastRanAt).localeCompare(String(a.lastRanAt))
    );
  }
  return result;
}

module.exports = { findProvenCarriers, laneKey };
