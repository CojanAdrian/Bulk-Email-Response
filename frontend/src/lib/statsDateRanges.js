// Formats using local calendar fields directly (never .toISOString(), which
// converts through UTC first and can silently roll the date back or forward
// a day depending on the viewer's timezone offset).
function toIsoDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgo(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() - n);
  return d;
}

export const STATS_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last3', label: 'Last 3 days' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'all', label: 'All time' },
];

// Every preset besides "all" is an N-day trailing window ending today
// (inclusive) -- "last 3 days" means today + the 2 days before it, not the
// 3 days strictly before today, since that reads more naturally as "how
// have the last few days gone" when you're checking mid-week.
export function rangeForPreset(key, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'today':
      return { from: toIsoDate(today), to: toIsoDate(today) };
    case 'yesterday': {
      const y = daysAgo(today, 1);
      return { from: toIsoDate(y), to: toIsoDate(y) };
    }
    case 'last3':
      return { from: toIsoDate(daysAgo(today, 2)), to: toIsoDate(today) };
    case 'lastWeek':
      return { from: toIsoDate(daysAgo(today, 6)), to: toIsoDate(today) };
    case 'lastMonth':
      return { from: toIsoDate(daysAgo(today, 29)), to: toIsoDate(today) };
    case 'all':
    default:
      return { from: null, to: null };
  }
}
