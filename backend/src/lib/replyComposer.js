function formatLocation(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ').toUpperCase() : null;
}

function formatDatePart(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatTimePart(d) {
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'pm' : 'am';
  hours %= 12;
  if (hours === 0) hours = 12;
  return minutes === 0 ? `${hours}${period}` : `${hours}:${String(minutes).padStart(2, '0')}${period}`;
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatDatePart(d)} ${formatTimePart(d)}`;
}

// Mirrors the frontend's DAT-export scheduling text (see buildPUSched in
// datExport.js) for both PU and DEL: when the early and late times land on
// the same minute, it's a fixed appointment ("appt") -- otherwise it's a
// pickup/delivery window and carriers need to know it's first-come-first-
// served ("FCFS"). A load with only one of the two set uses it for both
// ends (single known time = an appointment at that time).
function formatSchedRange(rawEarly, rawLate) {
  const e = rawEarly ? new Date(rawEarly) : null;
  const l = rawLate ? new Date(rawLate) : null;
  const eValid = e && !Number.isNaN(e.getTime()) ? e : null;
  const lValid = l && !Number.isNaN(l.getTime()) ? l : null;
  if (!eValid && !lValid) return null;
  const early = eValid || lValid;
  const late = lValid || eValid;
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
  if (Number.isNaN(amount)) return null;
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

// Extra stops are additional pickups/deliveries beyond the load's primary
// origin/destination, which is always "1st" implicitly (never labeled) --
// so the first extra stop of a given type is "2nd", not "1st".
function extraStopLabel(indexAmongSameType) {
  const n = indexAmongSameType + 2;
  return ORDINALS[n - 1] || `${n}th`;
}

function formatExtraStopLine(stop, indexAmongSameType) {
  const loc = formatLocation(stop.city, stop.state);
  if (!loc) return null;
  const typeLabel = stop.type === 'delivery' ? 'DEL' : 'PU';
  const label = `${extraStopLabel(indexAmongSameType)} ${typeLabel}`;
  const dateTime = formatDateTime(stop.datetime);
  return dateTime ? `${label}: ${loc} – ${dateTime}` : `${label}: ${loc}`;
}

// Format: "PU: CITY, ST – MM/DD/YYYY h:mma appt" (early/late PU match) or
// "PU: CITY, ST – MM/DD/YYYY h:mma-h:mma FCFS" (a window) / "2nd PU: ..."
// (extra pickups, entry order) / "DEL: ..." with the same appt/FCFS
// treatment for early/late DEL / "2nd DEL: ..." (extra deliveries, entry
// order) / "Weight: ..." / "Rate: $...", one field per line, in that order
// -- any field the load doesn't have is simply omitted, never shown as
// "null". The Rate line is additionally gated on include_rate (defaults to
// on -- only an explicit 0/false suppresses it), which never touches
// target_pay itself.
function composeReply(load) {
  const lines = [];
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];
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

  if (load.weight) {
    lines.push(`Weight: ${load.weight}`);
  }

  const includeRate = load.include_rate !== 0 && load.include_rate !== false;
  if (includeRate && load.target_pay !== null && load.target_pay !== undefined) {
    const rate = formatRate(load.target_pay);
    if (rate) lines.push(`Rate: ${rate}`);
  }

  // A load with none of PU/DEL/weight/rate filled in (e.g. added via the
  // quick-entry Add Load form, which only requires a load number) has
  // nothing to compose a reply from -- returning null rather than '' lets
  // callers tell "no data yet" apart from a deliberately blank line, instead
  // of silently queuing or auto-sending an empty email.
  return lines.length > 0 ? lines.join('\n') : null;
}

module.exports = { composeReply };
