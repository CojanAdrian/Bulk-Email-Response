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

function normalizeState(state) {
  return String(state || '').trim().toUpperCase();
}

function keyFor(city, state) {
  return `${normalizeCity(city)}|${normalizeState(state)}`;
}

function add(sums, key, entry) {
  const sum = sums.get(key) || { lat: 0, lng: 0, count: 0 };
  sum.lat += entry.latitude;
  sum.lng += entry.longitude;
  sum.count += 1;
  sums.set(key, sum);
}

function averages(sums) {
  const out = new Map();
  for (const [key, sum] of sums) {
    out.set(key, { lat: Math.round((sum.lat / sum.count) * 1e4) / 1e4, lng: Math.round((sum.lng / sum.count) * 1e4) / 1e4 });
  }
  return out;
}

// A city spans many zip codes; its position is their average. A state's
// position is the average of all its zip codes.
function buildIndex() {
  const cities = new Map();
  const states = new Map();
  for (const entry of Object.values(zipcodes.codes)) {
    if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') continue;
    add(cities, keyFor(entry.city, entry.state), entry);
    add(states, normalizeState(entry.state), entry);
  }
  return { cities: averages(cities), states: averages(states) };
}

let index = null;

function getIndex() {
  if (!index) index = buildIndex();
  return index;
}

// { lat, lng } for a US or Canadian city, from a list bundled with the
// app. No network, no database. Null when the city is not in the list.
function lookupCity(city, state) {
  if (!city || !state) return null;
  return getIndex().cities.get(keyFor(city, state)) || null;
}

// The rough middle of a state, e.g. for carriers tagged only by the
// states they run.
function lookupState(state) {
  if (!state) return null;
  return getIndex().states.get(normalizeState(state)) || null;
}

function hasCoords(lat, lng) {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined;
}

// Fills origin and destination coordinates on a row when it has none
// stored, so the map can draw its lane. prefix is '' for a load or lane
// history row, 'matched_load_' for an inquiry joined to its load.
function withCoords(row, prefix = '') {
  const field = (name) => `${prefix}${name}`;
  const origin = hasCoords(row[field('origin_lat')], row[field('origin_lng')]) ? null : lookupCity(row[field('origin_city')], row[field('origin_state')]);
  const dest = hasCoords(row[field('dest_lat')], row[field('dest_lng')]) ? null : lookupCity(row[field('dest_city')], row[field('dest_state')]);
  if (!origin && !dest) return row;
  return {
    ...row,
    ...(origin ? { [field('origin_lat')]: origin.lat, [field('origin_lng')]: origin.lng } : {}),
    ...(dest ? { [field('dest_lat')]: dest.lat, [field('dest_lng')]: dest.lng } : {}),
  };
}

module.exports = { lookupCity, lookupState, withCoords, normalizeCity };
