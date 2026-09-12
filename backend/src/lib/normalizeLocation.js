// Normalizes manually-typed city/state text so replies and exports look
// uniform regardless of how the user capitalized it on entry (e.g.
// "chicago" / "CHICAGO" / "ChiCago" all become "Chicago").
function titleCaseCity(value) {
  if (value === null || value === undefined) return value;
  const trimmed = String(value).trim();
  if (trimmed === '') return trimmed;
  return trimmed.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function upperState(value) {
  if (value === null || value === undefined) return value;
  const trimmed = String(value).trim();
  return trimmed === '' ? trimmed : trimmed.toUpperCase();
}

module.exports = { titleCaseCity, upperState };
