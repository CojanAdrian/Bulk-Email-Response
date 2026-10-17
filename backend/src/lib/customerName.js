// McLeod exports customers as "<CODE> - <Name>" (e.g. "ALDIDOIL - ALDI, Inc",
// "SAXCFACA - Saxco International LLC"). The code is McLeod's internal id,
// not something a person reads, so only the name is kept.
const MCLEOD_CODE_PREFIX = /^[A-Z0-9]{3,15}\s+-\s+(?=\S)/;

function cleanCustomerName(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  if (trimmed === '') return null;
  const withoutCode = trimmed.replace(MCLEOD_CODE_PREFIX, '').trim();
  return withoutCode === '' ? trimmed : withoutCode;
}

module.exports = { cleanCustomerName, MCLEOD_CODE_PREFIX };
