import { stopLine, extraStopsOf } from './stopCount';

// The text a carrier gets about a load: Copy, Blast, and the email reply the
// server writes (backend/src/lib/replyComposer.js) are the same text, line
// for line. Both are checked against shared/reply-fixtures.json.

function formatLocation(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ').toUpperCase() : null;
}

// A load's times are wall-clock times with no time zone, read as the digits
// of "YYYY-MM-DD HH:MM" so no zone can shift them.
function wallClock(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (match && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return { y: Number(match[1]), mo: Number(match[2]), d: Number(match[3]), h: Number(match[4] || 0), mi: Number(match[5] || 0) };
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), mi: date.getMinutes() };
}

const pad = (n) => String(n).padStart(2, '0');
const datePart = (t) => `${pad(t.mo)}/${pad(t.d)}/${t.y}`;
function timePart(t) {
  const period = t.h >= 12 ? 'pm' : 'am';
  const hour = t.h % 12 || 12;
  return t.mi === 0 ? `${hour}${period}` : `${hour}:${pad(t.mi)}${period}`;
}

function formatDateTime(value) {
  const t = wallClock(value);
  return t ? `${datePart(t)} ${timePart(t)}` : null;
}

export function formatSchedRange(rawEarly, rawLate) {
  const early = wallClock(rawEarly) || wallClock(rawLate);
  const late = wallClock(rawLate) || wallClock(rawEarly);
  if (!early) return null;
  if (datePart(early) === datePart(late)) {
    if (timePart(early) === timePart(late)) return `${datePart(early)} ${timePart(early)} appt`;
    return `${datePart(early)} ${timePart(early)}-${timePart(late)} FCFS`;
  }
  return `${datePart(early)} ${timePart(early)} – ${datePart(late)} ${timePart(late)} FCFS`;
}

export function formatRate(targetPay) {
  const amount = Number(targetPay);
  if (targetPay === null || targetPay === undefined || targetPay === '' || Number.isNaN(amount) || amount <= 0) return null;
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function formatWeight(weight) {
  const digits = String(weight ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!digits) return null;
  const pounds = Math.round(Number(digits[0]));
  return pounds > 0 ? `${pounds.toLocaleString('en-US')} lbs` : null;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

function extraStopLine(stop, index) {
  const loc = formatLocation(stop.city, stop.state);
  if (!loc) return null;
  const n = index + 2;
  const label = `${ORDINALS[n - 1] || `${n}th`} ${stop.type === 'delivery' ? 'DEL' : 'PU'}`;
  const when = formatDateTime(stop.datetime);
  return when ? `${label}: ${loc} – ${when}` : `${label}: ${loc}`;
}

export function rateIsShown(load) {
  return load.include_rate !== 0 && load.include_rate !== false && load.include_rate !== '0';
}

// Null when the load has nothing to say yet.
export function composeLoadText(load) {
  const lines = [];
  const extra = extraStopsOf(load);
  const pickups = extra.filter((s) => s && s.type === 'pickup');
  const deliveries = extra.filter((s) => s && s.type === 'delivery');

  const origin = formatLocation(load.origin_city, load.origin_state);
  if (origin) {
    const sched = formatSchedRange(load.early_pu, load.late_pu);
    lines.push(sched ? `PU: ${origin} – ${sched}` : `PU: ${origin}`);
  }
  pickups.forEach((stop, i) => {
    const line = extraStopLine(stop, i);
    if (line) lines.push(line);
  });
  const dest = formatLocation(load.dest_city, load.dest_state);
  if (dest) {
    const sched = formatSchedRange(load.early_del, load.late_del);
    lines.push(sched ? `DEL: ${dest} – ${sched}` : `DEL: ${dest}`);
  }
  deliveries.forEach((stop, i) => {
    const line = extraStopLine(stop, i);
    if (line) lines.push(line);
  });

  const stops = stopLine(load);
  if (stops) lines.push(stops);
  if (load.commodity) lines.push(`Commodity: ${String(load.commodity).trim()}`);
  const weight = formatWeight(load.weight);
  if (weight) lines.push(`Weight: ${weight}`);
  if (load.temperature) lines.push(`Temp: ${String(load.temperature).trim()}`);
  if (rateIsShown(load)) {
    const rate = formatRate(load.target_pay);
    if (rate) lines.push(`Rate: ${rate}`);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
