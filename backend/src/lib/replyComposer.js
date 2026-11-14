const { stopLine } = require('./stopCount');

// The reply sent to a carrier who asks about a load, built only from the
// load's own fields:
//
//   PU: CITY, ST – MM/DD/YYYY h:mma appt        (or h:mma-h:mma FCFS for a window)
//   2nd PU: CITY, ST – MM/DD/YYYY h:mma         (extra pickups, in order)
//   DEL: CITY, ST – MM/DD/YYYY h:mma appt
//   2nd DEL: ...                                (extra deliveries, in order)
//   Stops: 1 pick, 2 drops (1P/2D)              (only when there is more than one of either)
//   Commodity: ...
//   Weight: 42,000 lbs
//   Temp: 34°F
//   Rate: $2,450                                (only when the load's rate is shown)
//
// A field the load does not have is left out, never shown as "null". The
// frontend builds the same text for Copy and Blast (src/lib/loadText.js);
// both are checked against shared/reply-fixtures.json.

function formatLocation(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ').toUpperCase() : null;
}

// A load's times are the wall-clock times written in McLeod, with no time
// zone. They are read here as exactly that: the digits of a
// "YYYY-MM-DD HH:MM" string, or the local fields of a Date the database
// driver made from one.
function wallClock(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), mo: value.getMonth() + 1, d: value.getDate(), h: value.getHours(), mi: value.getMinutes() };
  }
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (match && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return { y: Number(match[1]), mo: Number(match[2]), d: Number(match[3]), h: Number(match[4] || 0), mi: Number(match[5] || 0) };
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : wallClock(date);
}

const pad = (n) => String(n).padStart(2, '0');

function formatDatePart(t) {
  return `${pad(t.mo)}/${pad(t.d)}/${t.y}`;
}

function formatTimePart(t) {
  const period = t.h >= 12 ? 'pm' : 'am';
  const hour = t.h % 12 || 12;
  return t.mi === 0 ? `${hour}${period}` : `${hour}:${pad(t.mi)}${period}`;
}

function formatDateTime(value) {
  const t = wallClock(value);
  return t ? `${formatDatePart(t)} ${formatTimePart(t)}` : null;
}

// The same minute at both ends is an appointment ("appt"); a range is a
// window, first come first served ("FCFS"). Only one end set means an
// appointment at that time.
function formatSchedRange(rawEarly, rawLate) {
  const early = wallClock(rawEarly) || wallClock(rawLate);
  const late = wallClock(rawLate) || wallClock(rawEarly);
  if (!early) return null;
  const earlyDate = formatDatePart(early);
  const lateDate = formatDatePart(late);
  const earlyTime = formatTimePart(early);
  const lateTime = formatTimePart(late);
  if (earlyDate === lateDate) {
    if (earlyTime === lateTime) return `${earlyDate} ${earlyTime} appt`;
    return `${earlyDate} ${earlyTime}-${lateTime} FCFS`;
  }
  return `${earlyDate} ${earlyTime} – ${lateDate} ${lateTime} FCFS`;
}

function formatRate(targetPay) {
  const amount = Number(targetPay);
  if (targetPay === null || targetPay === undefined || targetPay === '' || Number.isNaN(amount) || amount <= 0) return null;
  // Whole dollars without cents; otherwise always two decimals ($1,150.50).
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// "12845.0 LB", "43,500 lbs", "42000" -> "12,845 lbs" / "43,500 lbs" / "42,000 lbs".
function formatWeight(weight) {
  const digits = String(weight ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!digits) return null;
  const pounds = Math.round(Number(digits[0]));
  return pounds > 0 ? `${pounds.toLocaleString('en-US')} lbs` : null;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

// The primary origin and destination are the 1st pickup and drop, so the
// first extra stop of a kind is "2nd".
function extraStopLabel(indexAmongSameType) {
  const n = indexAmongSameType + 2;
  return ORDINALS[n - 1] || `${n}th`;
}

function formatExtraStopLine(stop, indexAmongSameType) {
  const loc = formatLocation(stop.city, stop.state);
  if (!loc) return null;
  const label = `${extraStopLabel(indexAmongSameType)} ${stop.type === 'delivery' ? 'DEL' : 'PU'}`;
  const dateTime = formatDateTime(stop.datetime);
  return dateTime ? `${label}: ${loc} – ${dateTime}` : `${label}: ${loc}`;
}

function extraStopsOf(load) {
  if (Array.isArray(load.extra_stops)) return load.extra_stops;
  if (typeof load.extra_stops === 'string') {
    try {
      const parsed = JSON.parse(load.extra_stops);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rateIsShown(load) {
  return load.include_rate !== 0 && load.include_rate !== false && load.include_rate !== '0';
}

// Returns null when the load has nothing to say yet (no lane, weight or
// rate), so an empty email is never queued or sent.
function composeReply(load) {
  const lines = [];
  const extraStops = extraStopsOf(load);
  const extraPickups = extraStops.filter((s) => s && s.type === 'pickup');
  const extraDeliveries = extraStops.filter((s) => s && s.type === 'delivery');

  const originLoc = formatLocation(load.origin_city, load.origin_state);
  if (originLoc) {
    const puSched = formatSchedRange(load.early_pu, load.late_pu);
    lines.push(puSched ? `PU: ${originLoc} – ${puSched}` : `PU: ${originLoc}`);
  }
  extraPickups.forEach((stop, i) => {
    const line = formatExtraStopLine(stop, i);
    if (line) lines.push(line);
  });

  const destLoc = formatLocation(load.dest_city, load.dest_state);
  if (destLoc) {
    const delSched = formatSchedRange(load.early_del, load.late_del);
    lines.push(delSched ? `DEL: ${destLoc} – ${delSched}` : `DEL: ${destLoc}`);
  }
  extraDeliveries.forEach((stop, i) => {
    const line = formatExtraStopLine(stop, i);
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

// Adds the connected Gmail account's signature, blank-line separated, to
// every reply that goes out, however it was sent.
function appendSignature(body, signature) {
  const trimmedSignature = String(signature || '').trim();
  if (!trimmedSignature) return body;
  return `${body}\n\n${trimmedSignature}`;
}

module.exports = { composeReply, appendSignature, wallClock, formatWeight };
