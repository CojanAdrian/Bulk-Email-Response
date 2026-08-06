export const REQUIRED_COLS = {
  order: ['order', 'order number', 'order #', 'ordernum'],
  originCity: ['origin city'],
  originState: ['origin state'],
  destCity: ['destination city', 'dest city', 'delivery city', 'drop city'],
  destState: ['destination state', 'dest state', 'delivery state', 'drop state'],
  equipment: ['equipment', 'equip type', 'equipment type', 'equip', 'trailer type'],
  weight: ['weight'],
  targetPay: ['target pay'],
  earlyPU: ['early p u dt', 'early pu dt', 'early pickup date', 'early p/u dt'],
  latePU: ['late p u dt', 'late pu dt', 'late pickup date', 'late p/u dt'],
  comment: ['planning comment'],
};

export const OPTIONAL_COLS = {
  lateDel: ['late del dt', 'late del', 'late delivery dt', 'delivery date', 'del dt'],
  stops: ['stops', 'stop count', 'num stops', 'number of stops'],
  origZip: ['origin zip', 'origin postal code', 'orig zip', 'orig zip code', 'pickup zip', 'pu zip', 'origin postal', 'origin zip code'],
  destZip: ['dest zip', 'destination zip', 'dest postal code', 'dest zip code', 'delivery zip', 'del zip', 'drop zip', 'destination postal', 'destination postal code', 'destination zip code'],
};

export const EQUIPMENT_MAP = {
  FGT: 'V', POTM: 'PO', POZ: 'PO', IGPO: 'PO',
  V: 'V', R: 'R', RV: 'RV', VR: 'VR', VM: 'VM', RR: 'RR', VZ: 'VZ', CN: 'CN', FT: 'FT', F: 'F',
  SD: 'SD', SP: 'SP', SB: 'SB', SB26: 'SB', SBR: 'BR', BR: 'BR', RZ: 'RZ', RGN: 'RGN', RM: 'RM', PO: 'PO',
};

const REEFER_EQUIPMENT = { R: 1, RV: 1, VR: 1, RR: 1, RZ: 1, RM: 1 };

export function normHeader(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cleanText(s) {
  if (s === null || s === undefined) return '';
  s = String(s);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += s.charAt(i);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function findColumn(fields, synonyms) {
  const normFields = fields.map(normHeader);
  for (let i = 0; i < synonyms.length; i++) {
    const idx = normFields.indexOf(normHeader(synonyms[i]));
    if (idx !== -1) return fields[idx];
  }
  return null;
}

export function parseMoney(s) {
  s = cleanText(s).replace(/[$,]/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function toMysqlDatetime(raw) {
  raw = cleanText(raw);
  if (raw === '') return null;
  const [datePart, timePart] = raw.split(/\s+/);
  const dateMatch = datePart && datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) return null;
  const month = dateMatch[1].padStart(2, '0');
  const day = dateMatch[2].padStart(2, '0');
  const year = dateMatch[3];
  let hours = '00';
  let minutes = '00';
  if (timePart !== undefined) {
    if (!/^\d{3,4}$/.test(timePart)) return null;
    const padded = timePart.padStart(4, '0');
    hours = padded.slice(0, 2);
    minutes = padded.slice(2, 4);
  }
  return `${year}-${month}-${day} ${hours}:${minutes}:00`;
}

export function parseTemp(comment, equipment) {
  if (!REEFER_EQUIPMENT[equipment]) return null;
  if (/\b(keep\s+)?frozen\b/i.test(comment)) return 'Frozen';
  let m =
    comment.match(/\btemp(?:erature)?\s*:?\s*(-?\d+)\s*[-–\/to]+\s*(-?\d+)/i) ||
    comment.match(/(-?\d+)\s*[-–\/]\s*(-?\d+)\s*(?:degrees?|°\s*[fc]?|\bf\b)/i);
  if (m && m[1] && m[2]) return `${m[1]}–${m[2]}°F`;
  m = comment.match(/\btemp(?:erature)?\s*:?\s*(-?\d+)/i) || comment.match(/(-?\d+)\s*(?:degrees?|°\s*[fc]?)/i);
  if (m) return `${m[1]}°F`;
  if (/\brefrigerat/i.test(comment)) return 'Refrigerated';
  return null;
}

export function parseLookupCommodity(comment) {
  const hasEmpty = /empty\s*(bottles?|cans?|containers?|returnables?)/i.test(comment) || /\bempties\b|\breturnables?\b/i.test(comment);
  const hasBeerCtx = /\bbeer\b|\bbrewery\b|\bbrewing\b|\bale\b|\blager\b/i.test(comment);
  if (hasEmpty && hasBeerCtx) return 'Empty beer bottles/cans';
  if (hasEmpty) return 'Empty bottles/cans';
  if (/\bice\s*cream\b/i.test(comment)) return 'Ice cream';
  const frozenMatch =
    comment.match(/\bfrozen\s*(chicken|poultry|turkey|beef|pork|seafood|fish|meat)\b/i) ||
    (/\b(chicken|poultry|turkey|beef|pork|seafood|fish)\b/i.test(comment) && /\bfrozen\b/i.test(comment)
      ? comment.match(/\b(chicken|poultry|turkey|beef|pork|seafood|fish)\b/i)
      : null);
  if (frozenMatch) {
    const item = (frozenMatch[1] || frozenMatch[0]).toLowerCase();
    return 'Frozen ' + item.charAt(0).toUpperCase() + item.slice(1);
  }
  if (/\bfrozen\b/i.test(comment)) return 'Frozen food';
  if (/\bbeer\b|\bale\b|\blager\b|\bipa\b|\bstout\b|\bporter\b|\bbrewery\b|\bbrewing\b|\bcanned\s+beer\b/i.test(comment)) return 'Beer';
  if (/\bwine\b|\bwinery\b|\bvineyard\b|\bmerlot\b|\bchardonnay\b|\bcabernet\b/i.test(comment)) return 'Wine';
  if (/\bwhiske?y\b|\bbourbon\b|\bvodka\b|\brum\b|\bgin\b|\btequila\b|\bspirits?\b|\bliquor\b/i.test(comment)) return 'Spirits / liquor';
  if (/\bbeverage\b|\bdrinks?\b|\bsoda\b|\bpop\b|\bjuice\b/i.test(comment)) return 'Beverages';
  if (/\bauto\s*parts?\b|\bautomotive\b|\bcar\s*parts?\b/i.test(comment)) return 'Auto parts';
  if (/\bgrocery\b|\bgroceries\b|\bfood\s*grade\b|\bproduce\b/i.test(comment)) return 'Grocery / food';
  if (/palletized\s*paper|paper\s*products?|paper\s*goods?/i.test(comment)) return 'Paper products (palletized)';
  if (/\bpaper\b|\bpaperboard\b|\bpackaging\b|\bcorrugated\b/i.test(comment)) return 'Paper / packaging';
  if (/\belectronics?\b|\bcomputers?\b|\bappliances?\b/i.test(comment)) return 'Electronics';
  if (/\bfurniture\b|\bhome\s*goods?\b/i.test(comment)) return 'Furniture';
  if (/\bsteel\b|\bmetal\b|\bcoils?\b|\bscrap\b/i.test(comment)) return 'Steel / metal';
  if (/\blumber\b|\bwood\b|\btimber\b/i.test(comment)) return 'Lumber';
  if (/\bplastic\b|\bresin\b|\bpolymers?\b/i.test(comment)) return 'Plastics / resin';
  return null;
}

function resolveColumns(fields) {
  const colMap = {};
  const missing = [];
  Object.keys(REQUIRED_COLS).forEach((key) => {
    const col = findColumn(fields, REQUIRED_COLS[key]);
    if (col === null) missing.push(REQUIRED_COLS[key][0]);
    else colMap[key] = col;
  });
  if (missing.length) return { colMap: null, missing };

  Object.keys(OPTIONAL_COLS).forEach((key) => {
    const col = findColumn(fields, OPTIONAL_COLS[key]);
    if (col !== null) colMap[key] = col;
  });
  return { colMap, missing: [] };
}

function mapRowToLoad(row, colMap) {
  const rawEquip = cleanText(row[colMap.equipment]);
  const equipKey = rawEquip.toUpperCase();
  const equipment = EQUIPMENT_MAP[equipKey] || rawEquip;
  const rawComment = cleanText(row[colMap.comment]);

  return {
    load_number: cleanText(row[colMap.order]),
    origin_city: cleanText(row[colMap.originCity]),
    origin_state: cleanText(row[colMap.originState]),
    origin_zip: colMap.origZip ? cleanText(row[colMap.origZip]).replace(/\D/g, '').slice(0, 5) : '',
    dest_city: cleanText(row[colMap.destCity]),
    dest_state: cleanText(row[colMap.destState]),
    dest_zip: colMap.destZip ? cleanText(row[colMap.destZip]).replace(/\D/g, '').slice(0, 5) : '',
    equipment,
    weight: cleanText(row[colMap.weight]),
    target_pay: parseMoney(row[colMap.targetPay]),
    early_pu: toMysqlDatetime(row[colMap.earlyPU]),
    late_pu: toMysqlDatetime(row[colMap.latePU]),
    late_del: colMap.lateDel ? toMysqlDatetime(row[colMap.lateDel]) : null,
    stops: colMap.stops ? parseInt(cleanText(row[colMap.stops]), 10) || 0 : 0,
    commodity: parseLookupCommodity(rawComment),
    temperature: parseTemp(rawComment, equipment),
    comment: rawComment,
  };
}

export function parseMcleodRows(fields, rows) {
  const { colMap, missing } = resolveColumns(fields);
  if (missing.length) return { loads: [], missing };
  if (!Array.isArray(rows)) return { loads: [], missing: [] };

  const cleanRows = rows.filter((r) => Object.keys(r).some((k) => cleanText(r[k]) !== ''));
  const loads = cleanRows
    .map((row) => mapRowToLoad(row, colMap))
    .filter((load) => load.load_number !== '' && load.equipment !== '');
  return { loads, missing: [] };
}
