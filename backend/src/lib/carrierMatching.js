const EARTH_RADIUS_MILES = 3958.8;
const STRONG_RADIUS_MILES = 150;
const WEAK_RADIUS_MILES = 300;
const TIER_RANK = { perfect: 3, strong: 2, weak: 1 };

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two lat/lng points, in miles.
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// Classifies one carrier_lane_history row against a query lane's
// coordinates. Returns null when it's not a match at all (no cached
// coordinates yet, or farther than the weak radius from the origin). See
// the design spec's "Matching algorithm" section for the tier definitions.
function classifyLaneMatch(queryOrigin, queryDest, historyRow) {
  if (historyRow.origin_lat === null || historyRow.origin_lng === null) return null;
  const originDistanceMiles = haversineMiles(queryOrigin.lat, queryOrigin.lng, Number(historyRow.origin_lat), Number(historyRow.origin_lng));
  if (originDistanceMiles > WEAK_RADIUS_MILES) return null;

  let tier = originDistanceMiles <= STRONG_RADIUS_MILES ? 'strong' : 'weak';
  let destDistanceMiles = null;
  if (tier === 'strong' && queryDest && historyRow.dest_lat !== null && historyRow.dest_lng !== null) {
    destDistanceMiles = haversineMiles(queryDest.lat, queryDest.lng, Number(historyRow.dest_lat), Number(historyRow.dest_lng));
    if (destDistanceMiles <= STRONG_RADIUS_MILES) tier = 'perfect';
  }
  return { tier, originDistanceMiles, destDistanceMiles };
}

// Ranks a user's carrier lane history against a queried lane (an existing
// load's origin/dest, or a manually-typed one), grouping by carrier -- each
// carrier's single best-tier/closest entry represents them, with a count of
// how many lanes they have on file. Carriers with zero lane history but a
// tagged operating_states match on the query's origin (and optionally
// destination) state are returned separately as regionalMatches, never
// double-counted against a carrier that also has real lane history.
function findMatchesForLane({ queryOrigin, queryDest, equipment, historyRows, regionalCarriers }) {
  const bestByCarrier = new Map();
  for (const row of historyRows) {
    const classified = classifyLaneMatch(queryOrigin, queryDest, row);
    if (!classified) continue;

    const carrierEquipment = Array.isArray(row.carrier_equipment_types) ? row.carrier_equipment_types : [];
    const equipmentMismatch = Boolean(equipment && carrierEquipment.length > 0 && !carrierEquipment.includes(equipment));

    const existing = bestByCarrier.get(row.carrier_id);
    const isBetter =
      !existing ||
      TIER_RANK[classified.tier] > TIER_RANK[existing.tier] ||
      (TIER_RANK[classified.tier] === TIER_RANK[existing.tier] && classified.originDistanceMiles < existing.originDistanceMiles);

    if (isBetter) {
      bestByCarrier.set(row.carrier_id, {
        carrierId: row.carrier_id,
        carrierName: row.carrier_company_name,
        historyId: row.id,
        tier: classified.tier,
        originDistanceMiles: classified.originDistanceMiles,
        destDistanceMiles: classified.destDistanceMiles,
        originLat: Number(row.origin_lat),
        originLng: Number(row.origin_lng),
        destLat: row.dest_lat !== null && row.dest_lat !== undefined ? Number(row.dest_lat) : null,
        destLng: row.dest_lng !== null && row.dest_lng !== undefined ? Number(row.dest_lng) : null,
        equipmentMismatch,
        laneCount: (existing ? existing.laneCount : 0) + 1,
      });
    } else {
      existing.laneCount += 1;
    }
  }

  const laneMatches = [...bestByCarrier.values()].sort((a, b) => {
    if (TIER_RANK[b.tier] !== TIER_RANK[a.tier]) return TIER_RANK[b.tier] - TIER_RANK[a.tier];
    return a.originDistanceMiles - b.originDistanceMiles;
  });

  const matchedCarrierIds = new Set(laneMatches.map((m) => m.carrierId));
  const regionalMatches = regionalCarriers
    .filter((carrier) => !matchedCarrierIds.has(carrier.id))
    .map((carrier) => {
      const states = Array.isArray(carrier.operating_states) ? carrier.operating_states : [];
      const originTagged = states.includes(queryOrigin.state);
      if (!originTagged) return null;
      const destTagged = Boolean(queryDest && states.includes(queryDest.state));
      return {
        carrierId: carrier.id,
        carrierName: carrier.company_name,
        tier: destTagged ? 'regional_perfect' : 'regional',
        taggedStates: states,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'regional_perfect' ? -1 : 1));

  return { laneMatches, regionalMatches };
}

module.exports = { haversineMiles, classifyLaneMatch, findMatchesForLane };
