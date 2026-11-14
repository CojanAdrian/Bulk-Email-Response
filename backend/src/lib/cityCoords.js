const fs = require('fs');
const path = require('path');
const zipcodes = require('zipcodes');

// Two lists bundled with the app, so locating a city needs no network:
//   data/places.txt: every US incorporated and census-designated place
//     (Census Gazetteer) and Canadian populated places (GeoNames). See
//     scripts/build-places.js.
//   the zipcodes package: post-office city names, which add places the
//     Census does not name separately (e.g. "Bronx").
const PLACES_FILE = path.join(__dirname, '..', '..', 'data', 'places.txt');

// City names are written many ways in freight ("ST LOUIS", "Ft. Worth",
// "O'FALLON"); the lists spell them out. Both sides go through this.
const ABBREVIATIONS = { st: 'saint', ste: 'sainte', ft: 'fort', mt: 'mount', pt: 'point' };

function normalizeCity(city) {
  const words = String(city || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ');
  if (ABBREVIATIONS[words[0]]) words[0] = ABBREVIATIONS[words[0]];
  return words.join(' ');
}

function normalizeState(state) {
  return String(state || '').trim().toUpperCase();
}

function keyFor(city, state) {
  return `${normalizeCity(city)}|${normalizeState(state)}`;
}

const CANADA = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK', 'YT', 'NT', 'NU']);

// How prominent a place is, for ranking suggestions. A US city's size shows
// in how many zip codes it has (land area alone favours empty Alaska); a
// Canadian place's file weight is its population.
function prominence(state, fileWeight, zipCount) {
  if (CANADA.has(state)) return fileWeight * 2;
  return zipCount * 100000 + fileWeight / 1000;
}

function buildIndex() {
  // key -> { city, state, lat, lng, weight }
  const cities = new Map();
  const stateSums = new Map();
  const zipCounts = new Map();
  for (const zip of Object.values(zipcodes.codes)) {
    const key = keyFor(zip.city, zip.state);
    zipCounts.set(key, (zipCounts.get(key) || 0) + 1);
  }

  if (fs.existsSync(PLACES_FILE)) {
    for (const line of fs.readFileSync(PLACES_FILE, 'utf8').split('\n')) {
      const [city, state, lat, lng, weight] = line.split('|');
      if (!city || !state) continue;
      const key = keyFor(city, state);
      const entry = { city, state, lat: Number(lat), lng: Number(lng), weight: prominence(state, Number(weight) || 0, zipCounts.get(key) || 0) };
      const existing = cities.get(key);
      // Two places with one name in one state: keep the bigger one.
      if (!existing || entry.weight > existing.weight) cities.set(key, entry);
    }
  }

  // Post-office names fill the gaps; a city's position is the average of
  // its zip codes.
  const zipSums = new Map();
  for (const zip of Object.values(zipcodes.codes)) {
    if (typeof zip.latitude !== 'number' || typeof zip.longitude !== 'number') continue;
    const key = keyFor(zip.city, zip.state);
    const sum = zipSums.get(key) || { city: zip.city, state: zip.state, lat: 0, lng: 0, count: 0 };
    sum.lat += zip.latitude;
    sum.lng += zip.longitude;
    sum.count += 1;
    zipSums.set(key, sum);
    const stateSum = stateSums.get(normalizeState(zip.state)) || { lat: 0, lng: 0, count: 0 };
    stateSum.lat += zip.latitude;
    stateSum.lng += zip.longitude;
    stateSum.count += 1;
    stateSums.set(normalizeState(zip.state), stateSum);
  }
  for (const [key, sum] of zipSums) {
    if (cities.has(key)) continue;
    cities.set(key, { city: sum.city, state: sum.state, lat: sum.lat / sum.count, lng: sum.lng / sum.count, weight: prominence(sum.state, 0, sum.count) });
  }

  const states = new Map();
  for (const [state, sum] of stateSums) states.set(state, { lat: sum.lat / sum.count, lng: sum.lng / sum.count });

  // For suggestions: every entry, biggest first, with its searchable name.
  const searchable = [...cities.values()].map((entry) => ({ ...entry, name: normalizeCity(entry.city) })).sort((a, b) => b.weight - a.weight);

  return { cities, states, searchable };
}

let index = null;

function getIndex() {
  if (!index) index = buildIndex();
  return index;
}

const round = (n) => Math.round(n * 1e4) / 1e4;

// { lat, lng } for a US or Canadian city, or null when it is in neither list.
function lookupCity(city, state) {
  if (!city || !state) return null;
  const entry = getIndex().cities.get(keyFor(city, state));
  return entry ? { lat: round(entry.lat), lng: round(entry.lng) } : null;
}

// The rough middle of a state, e.g. for carriers tagged only by the
// states they run.
function lookupState(state) {
  if (!state) return null;
  const entry = getIndex().states.get(normalizeState(state));
  return entry ? { lat: round(entry.lat), lng: round(entry.lng) } : null;
}

// City suggestions as someone types: "chi", "chicago il", "chicago, il".
// Names starting with the text come first, larger places before smaller.
function searchCities(query, limit = 8) {
  const text = String(query || '').trim();
  const stateMatch = text.match(/^(.*?)[,\s]+([a-zA-Z]{2})$/);
  const { searchable } = getIndex();
  const tryOnce = (name, state) => {
    if (!name) return [];
    const starts = [];
    const contains = [];
    for (const entry of searchable) {
      if (state && entry.state !== state) continue;
      if (entry.name.startsWith(name)) starts.push(entry);
      else if (contains.length < limit && entry.name.includes(` ${name}`)) contains.push(entry);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  };
  let hits = stateMatch ? tryOnce(normalizeCity(stateMatch[1]), normalizeState(stateMatch[2])) : [];
  if (hits.length === 0) hits = tryOnce(normalizeCity(text), null);
  return hits.map((entry) => ({ city: entry.city, state: entry.state }));
}

function hasCoords(lat, lng) {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined;
}

// Fills origin and destination coordinates on a row when it has none
// stored, so the map can draw its lane. prefix is '' for a load or lane
// history row, 'matched_load_' for an inquiry joined to its load.
function withCoords(row, prefix = '') {
  // Ignores anything but a string, so rows.map(withCoords) (which passes the
  // index) still works.
  const p = typeof prefix === 'string' ? prefix : '';
  const field = (name) => `${p}${name}`;
  const origin = hasCoords(row[field('origin_lat')], row[field('origin_lng')]) ? null : lookupCity(row[field('origin_city')], row[field('origin_state')]);
  const dest = hasCoords(row[field('dest_lat')], row[field('dest_lng')]) ? null : lookupCity(row[field('dest_city')], row[field('dest_state')]);
  if (!origin && !dest) return row;
  return {
    ...row,
    ...(origin ? { [field('origin_lat')]: origin.lat, [field('origin_lng')]: origin.lng } : {}),
    ...(dest ? { [field('dest_lat')]: dest.lat, [field('dest_lng')]: dest.lng } : {}),
  };
}

module.exports = { lookupCity, lookupState, searchCities, withCoords, normalizeCity };
