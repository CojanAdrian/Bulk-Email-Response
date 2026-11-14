// Pure helpers for the Loads board: filtering, sorting, and turning loads
// into what the row and the map need.

export const STATUSES = ['active', 'booked', 'covered'];
export const STATUS_LABELS = { active: 'Active', booked: 'Booked', covered: 'Covered' };

export const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'pu', label: 'Pickup time' },
  { value: 'target_pay', label: 'Rate, high to low' },
  { value: 'origin', label: 'Origin' },
  { value: 'destination', label: 'Destination' },
  { value: 'load_number', label: 'Load number' },
  { value: 'equipment', label: 'Equipment' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A load at least one of your starred carriers has already run.
export function hasStarRegular(regulars) {
  return Array.isArray(regulars) && regulars.some((regular) => regular.starred);
}

export function hasNoRate(load) {
  return load.target_pay === null || load.target_pay === undefined || load.target_pay === '';
}

export function countByStatus(loads) {
  const counts = { active: 0, booked: 0, covered: 0 };
  for (const load of loads) {
    if (counts[load.status] !== undefined) counts[load.status] += 1;
  }
  return counts;
}

function matchesSearch(load, query) {
  const haystack = [load.load_number, load.origin_city, load.origin_state, load.dest_city, load.dest_state, load.customer]
    .map((part) => part ?? '')
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function time(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
}

const COMPARERS = {
  // The server already returns newest first.
  newest: () => 0,
  // Loads with no pickup time sink to the bottom.
  pu: (a, b) => (time(a.early_pu ?? a.late_pu) ?? Infinity) - (time(b.early_pu ?? b.late_pu) ?? Infinity),
  target_pay: (a, b) => Number(b.target_pay ?? 0) - Number(a.target_pay ?? 0),
  // State first, then city, so a state's loads sit together.
  origin: (a, b) => `${a.origin_state ?? ''} ${a.origin_city ?? ''}`.localeCompare(`${b.origin_state ?? ''} ${b.origin_city ?? ''}`),
  destination: (a, b) => `${a.dest_state ?? ''} ${a.dest_city ?? ''}`.localeCompare(`${b.dest_state ?? ''} ${b.dest_city ?? ''}`),
  load_number: (a, b) => String(a.load_number ?? '').localeCompare(String(b.load_number ?? '')),
  equipment: (a, b) => String(a.equipment ?? '').localeCompare(String(b.equipment ?? '')),
};

// quick: 'all' | 'proven' | 'needs_rate'. proven: { [loadId]: carriers[] }.
export function visibleLoads({ loads, status, quick = 'all', query = '', sort = 'newest', proven = {} }) {
  const q = query.trim().toLowerCase();
  const rows = loads.filter((load) => {
    if (load.status !== status) return false;
    if (q && !matchesSearch(load, q)) return false;
    if (quick === 'proven' && !proven[load.id]?.length) return false;
    if (quick === 'starred' && !hasStarRegular(proven[load.id])) return false;
    if (quick === 'needs_rate' && !hasNoRate(load)) return false;
    return true;
  });
  const compare = COMPARERS[sort] || COMPARERS.newest;
  return [...rows].sort(compare);
}

function clock(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'pm' : 'am';
  const h12 = hours % 12 || 12;
  return minutes === 0 ? `${h12}${suffix}` : `${h12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

// A pickup or delivery window as short text. One time, or the same time
// twice, is an appointment; a range is first come, first served.
// Returns null when neither end is set.
export function schedule(rawEarly, rawLate) {
  const early = time(rawEarly) === null ? null : new Date(rawEarly);
  const late = time(rawLate) === null ? null : new Date(rawLate);
  const start = early || late;
  const end = late || early;
  if (!start) return null;
  const day = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay && clock(start) === clock(end)) return { day, hours: clock(start), kind: 'APPT' };
  const endText = sameDay ? clock(end) : `${MONTHS[end.getMonth()]} ${end.getDate()} ${clock(end)}`;
  return { day, hours: `${clock(start)}–${endText}`, kind: 'FCFS' };
}

export function place(city, state) {
  return [city, state].filter(Boolean).join(', ');
}

function coordinate(lng, lat) {
  if (lng === null || lng === undefined || lat === null || lat === undefined) return null;
  const pair = [Number(lng), Number(lat)];
  return pair.every(Number.isFinite) ? pair : null;
}

// Lanes for the map. A load missing a coordinate at either end has none.
export function lanesFor(loads, proven = {}) {
  const lanes = [];
  for (const load of loads) {
    const from = coordinate(load.origin_lng, load.origin_lat);
    const to = coordinate(load.dest_lng, load.dest_lat);
    if (!from || !to) continue;
    lanes.push({ id: load.id, from, to, fromLabel: load.origin_city, toLabel: load.dest_city, gold: Boolean(proven[load.id]?.length), star: hasStarRegular(proven[load.id]) });
  }
  return lanes;
}
