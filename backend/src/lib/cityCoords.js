const zipcodes = require('zipcodes');

// City names are written many ways in freight ("ST LOUIS", "Ft. Worth",
// "O'FALLON"); the bundled list spells them out ("Saint Louis", "Fort
// Worth", "O Fallon"). Both sides go through this before comparing.
const ABBREVIATIONS = { st: 'saint', ste: 'sainte', ft: 'fort', mt: 'mount', pt: 'point' };

function normalizeCity(city) {
  const words = String(city || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  if (ABBREVIATIONS[words[0]]) words[0] = ABBREVIATIONS[words[0]];
  return words.join(' ');
}

function keyFor(city, state) {
  return `${normalizeCity(city)}|${String(state || '').trim().toUpperCase()}`;
}

// A city spans many zip codes; its position is their average.
function buildIndex() {
  const sums = new Map();
  for (const entry of Object.values(zipcodes.codes)) {
    if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') continue;
    const key = keyFor(entry.city, entry.state);
    const sum = sums.get(key) || { lat: 0, lng: 0, count: 0 };
    sum.lat += entry.latitude;
    sum.lng += entry.longitude;
    sum.count += 1;
    sums.set(key, sum);
  }
  const index = new Map();
  for (const [key, sum] of sums) {
    index.set(key, { lat: Math.round((sum.lat / sum.count) * 1e4) / 1e4, lng: Math.round((sum.lng / sum.count) * 1e4) / 1e4 });
  }
  return index;
}

let index = null;

// { lat, lng } for a US or Canadian city, from a list bundled with the
// app. No network, no database. Null when the city is not in the list.
function lookupCity(city, state) {
  if (!city || !state) return null;
  if (!index) index = buildIndex();
  return index.get(keyFor(city, state)) || null;
}

// Fills origin_lat / origin_lng / dest_lat / dest_lng on a load row when it
// has none stored, so the board can draw its lane.
function withCoords(load) {
  const origin = load.origin_lat != null && load.origin_lng != null ? null : lookupCity(load.origin_city, load.origin_state);
  const dest = load.dest_lat != null && load.dest_lng != null ? null : lookupCity(load.dest_city, load.dest_state);
  if (!origin && !dest) return load;
  return {
    ...load,
    ...(origin ? { origin_lat: origin.lat, origin_lng: origin.lng } : {}),
    ...(dest ? { dest_lat: dest.lat, dest_lng: dest.lng } : {}),
  };
}

module.exports = { lookupCity, withCoords, normalizeCity };
