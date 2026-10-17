const EMPTY = '—';

// "$1,980" for whole dollars, "$1,980.50" otherwise, and an em dash for
// anything missing -- never "$NaN", "null" or a blank cell.
export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return EMPTY;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(number)) return EMPTY;
  const hasCents = Math.round(number * 100) % 100 !== 0;
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function orDash(value) {
  if (value === null || value === undefined) return EMPTY;
  const text = String(value).trim();
  return text === '' || text === 'null' ? EMPTY : text;
}
