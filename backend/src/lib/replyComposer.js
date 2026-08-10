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

// Format: "PU: CITY, ST – MM/DD/YYYY h:mma" / "DEL: CITY, ST – MM/DD/YYYY h:mma"
// / "Weight: ..." / "Rate: $...", one field per line, in that order -- any
// field the load doesn't have is simply omitted, never shown as "null".
function composeReply(load) {
  const lines = [];

  const originLoc = formatLocation(load.origin_city, load.origin_state);
  if (originLoc) {
    const puDateTime = formatDateTime(load.early_pu);
    lines.push(puDateTime ? `PU: ${originLoc} – ${puDateTime}` : `PU: ${originLoc}`);
  }

  const destLoc = formatLocation(load.dest_city, load.dest_state);
  if (destLoc) {
    const delDateTime = formatDateTime(load.late_del);
    lines.push(delDateTime ? `DEL: ${destLoc} – ${delDateTime}` : `DEL: ${destLoc}`);
  }

  if (load.weight) {
    lines.push(`Weight: ${load.weight}`);
  }

  if (load.target_pay !== null && load.target_pay !== undefined) {
    const rate = formatRate(load.target_pay);
    if (rate) lines.push(`Rate: ${rate}`);
  }

  return lines.join('\n');
}

module.exports = { composeReply };
