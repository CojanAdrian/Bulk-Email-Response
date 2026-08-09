function formatRoute(load) {
  const origin = [load.origin_city, load.origin_state].filter(Boolean).join(', ');
  const dest = [load.dest_city, load.dest_state].filter(Boolean).join(', ');
  if (!origin && !dest) return null;
  return `${origin} -> ${dest}`;
}

function composeReply(load) {
  const lines = [
    'Hi,',
    '',
    `Yes, load #${load.load_number} is still available:`,
    '',
  ];

  const route = formatRoute(load);
  if (route) {
    lines.push(`  ${route}`);
  }
  if (load.early_pu) {
    lines.push(`  Pickup: ${load.early_pu}`);
  }
  if (load.target_pay !== null && load.target_pay !== undefined) {
    lines.push(`  Rate: $${load.target_pay}`);
  }

  lines.push('', "Let me know if you'd like to book it.");

  return lines.join('\n');
}

module.exports = { composeReply };
