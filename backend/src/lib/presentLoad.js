const { withCoords } = require('./cityCoords');

// A load's pickup and delivery times are wall-clock times as written in
// McLeod, with no time zone. The database driver turns them into Dates in
// the server's zone; sent as JSON those become UTC instants, which a
// browser in another zone shows hours off. They are sent instead as
// "YYYY-MM-DDTHH:MM:SS" with no zone, which a browser reads as that same
// wall-clock time.
const TIME_FIELDS = ['early_pu', 'late_pu', 'early_del', 'late_del'];

const pad = (n) => String(n).padStart(2, '0');

function asWallClock(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

// A load row ready to send: wall-clock times and map coordinates. prefix is
// 'matched_load_' for an inquiry joined to its load.
function presentLoad(row, prefix = '') {
  if (!row) return row;
  const p = typeof prefix === 'string' ? prefix : '';
  const out = withCoords(row, p);
  const copy = out === row ? { ...row } : out;
  for (const field of TIME_FIELDS) {
    if (`${p}${field}` in copy) copy[`${p}${field}`] = asWallClock(copy[`${p}${field}`]);
  }
  return copy;
}

module.exports = { presentLoad, asWallClock };
