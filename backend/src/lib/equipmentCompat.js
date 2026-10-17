// Equipment codes that mean "either of these trailers" -- a VR/RV load can
// go on a van or a reefer, so it overlaps with plain V and plain R.
const COMBO_CODES = { VR: ['V', 'R'], RV: ['V', 'R'] };

function expandEquipment(code) {
  const normalized = code === null || code === undefined ? '' : String(code).trim().toUpperCase();
  if (normalized === '') return new Set();
  return new Set(COMBO_CODES[normalized] || [normalized]);
}

// True when `code` shares at least one trailer type with any entry of
// `otherCodes`. Missing equipment on either side never rules a match out --
// it just means we don't know.
function isEquipmentCompatible(code, otherCodes) {
  const mine = expandEquipment(code);
  const theirs = new Set();
  for (const other of Array.isArray(otherCodes) ? otherCodes : []) {
    for (const c of expandEquipment(other)) theirs.add(c);
  }
  if (mine.size === 0 || theirs.size === 0) return true;
  for (const c of mine) if (theirs.has(c)) return true;
  return false;
}

module.exports = { expandEquipment, isEquipmentCompatible };
