const DAY_MS = 86400000;

function parseDay(value) {
  if (!value) return null;
  const text = String(value);
  // "YYYY-MM-DD" is a calendar day -- read it as local midnight, not UTC,
  // so it never shows as the previous day west of Greenwich.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "today", "yesterday", "5 days ago", "3 wk ago", then "Aug 2, 2025".
export function formatDayAgo(value, now = new Date()) {
  const date = parseDay(value);
  if (!date) return '—';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfToday - startOfDay) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDayFull(value) {
  const date = parseDay(value);
  return date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
