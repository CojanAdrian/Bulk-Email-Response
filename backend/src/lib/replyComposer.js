function formatLocation(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ').toUpperCase() : null;
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'pm' : 'am';
  hours %= 12;
  if (hours === 0) hours = 12;
  const time = minutes === 0 ? `${hours}${period}` : `${hours}:${String(minutes).padStart(2, '0')}${period}`;
  return `${mm}/${dd}/${yyyy} ${time}`;
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

// Format: "PU: CITY, ST – MM/DD/YYYY h:mma" / "2nd PU: ..." (extra pickups,
// entry order) / "DEL: CITY, ST – MM/DD/YYYY h:mma" / "2nd DEL: ..." (extra
// deliveries, entry order) / "Weight: ..." / "Rate: $...", one field per
// line, in that order -- any field the load doesn't have is simply
// omitted, never shown as "null". The Rate line is additionally gated on
// include_rate (defaults to on -- only an explicit 0/false suppresses it),
// which never touches target_pay itself.
function composeReply(load) {
  const lines = [];
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];
  const extraPickups = extraStops.filter((s) => s && s.type === 'pickup');
  const extraDeliveries = extraStops.filter((s) => s && s.type === 'delivery');

  const originLoc = formatLocation(load.origin_city, load.origin_state);
  if (originLoc) {
    const puDateTime = formatDateTime(load.early_pu);
    lines.push(puDateTime ? `PU: ${originLoc} – ${puDateTime}` : `PU: ${originLoc}`);
  }
  extraPickups.forEach((stop, i) => {
    const line = formatExtraStopLine(stop, i);
    if (line) lines.push(line);
  });

  const destLoc = formatLocation(load.dest_city, load.dest_state);
  if (destLoc) {
    const delDateTime = formatDateTime(load.late_del);
    lines.push(delDateTime ? `DEL: ${destLoc} – ${delDateTime}` : `DEL: ${destLoc}`);
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
