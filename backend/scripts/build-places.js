// Builds data/places.txt, the city list the app locates cities with, from
// two public sources:
//   US: Census Bureau Gazetteer, every incorporated place and census-
//       designated place (2023_Gaz_place_national.txt), from
//       https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip
//   Canada: GeoNames populated places (CA.txt), from
//       https://download.geonames.org/export/dump/CA.zip
// Usage: node scripts/build-places.js <census txt> <geonames CA.txt>
// Each output line is: name|ST|lat|lng|weight, weight being how prominent
// the place is (land area or population), used to rank suggestions.
const fs = require('fs');
const path = require('path');

const [censusFile, canadaFile] = process.argv.slice(2);
if (!censusFile || !canadaFile) {
  console.error('Usage: node scripts/build-places.js <2023_Gaz_place_national.txt> <CA.txt>');
  process.exit(1);
}

// Case-sensitive on purpose: the type is lower case ("Oklahoma City city").
// "Holiday City village" -> "Holiday City"; "Nashville-Davidson metropolitan
// government (balance)" -> "Nashville-Davidson".
const PLACE_TYPE = /\s+(city and borough|consolidated government|metropolitan government|metro government|unified government|urban county|city|village|town|CDP|borough|municipality|township|plantation|comunidad|zona urbana|corporation)(\s+\(balance\))?$/;

const CANADA_PROVINCES = { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', 10: 'QC', 11: 'SK', 12: 'YT', 13: 'NT', 14: 'NU' };

const lines = [];

const census = fs.readFileSync(censusFile, 'utf8').split(/\r?\n/).slice(1);
for (const row of census) {
  const cols = row.split('\t');
  if (cols.length < 12) continue;
  const state = cols[0].trim();
  const name = cols[3].trim().replace(PLACE_TYPE, '');
  const lat = Number(cols[10]);
  const lng = Number(cols[11]);
  const landSqMi = Number(cols[8]) || 0;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  lines.push(`${name}|${state}|${lat.toFixed(4)}|${lng.toFixed(4)}|${Math.round(landSqMi * 1000)}`);
}

const canada = fs.readFileSync(canadaFile, 'utf8').split(/\r?\n/);
for (const row of canada) {
  const cols = row.split('\t');
  // Feature class P is a populated place; skip sections of other places.
  if (cols[6] !== 'P' || cols[7] === 'PPLX' || cols[7] === 'PPLH') continue;
  const province = CANADA_PROVINCES[cols[10]];
  const population = Number(cols[14]) || 0;
  if (!province) continue;
  lines.push(`${cols[1]}|${province}|${Number(cols[4]).toFixed(4)}|${Number(cols[5]).toFixed(4)}|${population}`);
}

const out = path.join(__dirname, '..', 'data', 'places.txt');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`Wrote ${lines.length} places to ${out}`);
