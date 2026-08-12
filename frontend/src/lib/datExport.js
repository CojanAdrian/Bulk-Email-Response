import Papa from 'papaparse';
import { EQUIPMENT_MAP } from './mcleodParser';

export const DAT_HEADERS = [
  'Pickup Earliest*', 'Pickup Latest', 'Length (ft)*', 'Weight (lbs)*', 'Full/Partial*',
  'Equipment*', 'Use Private Network*', 'Private Network Rate', 'Allow Private Network Booking',
  'Allow Private Network Bidding', 'Use DAT Loadboard*', 'DAT Loadboard Rate',
  'Allow DAT Loadboard Booking', 'Use Extended Network', 'Contact Method*',
  'Origin City*', 'Origin State*', 'Origin Postal Code', 'Destination City*', 'Destination State*',
  'Destination Postal Code', 'Comment', 'Commodity', 'Reference ID',
];

const CANADIAN_PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const FLATBED_OPEN_DECK = { FT: 1, F: 1, SD: 1, SP: 1, RGN: 1, RZ: 1, RM: 1, CN: 1 };
const STRAIGHT_BOX = { SB: 1, BR: 1, BZ: 1 };
const KNOWN_EQUIPMENT_VALUES = new Set(Object.values(EQUIPMENT_MAP));

function pad2(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

export function orderCompare(a, b) {
  const na = parseInt(String(a).replace(/[^0-9]/g, ''), 10);
  const nb = parseInt(String(b).replace(/[^0-9]/g, ''), 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

export function parseWeightNum(s) {
  s = String(s || '').replace(/,/g, '').replace(/lbs?\.?/gi, '').replace(/[^0-9.]/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n);
}

// early_pu/late_pu/late_del come back from the API as ISO datetime strings (or null),
// built from a timezone-naive MySQL DATETIME using the backend server's local
// timezone. Using local (not UTC) Date getters here is the correct match for that
// round-trip, on the assumption the backend and its users share one timezone (this
// is a single-office internal tool) -- same assumption the original tool made
// implicitly by working entirely off wall-clock text with no timezone concept.
function formatDateOnlyFromDate(d) {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

export function formatDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return formatDateOnlyFromDate(d);
}

function fmtTime(d) {
  const h = d.getHours();
  const min = pad2(d.getMinutes());
  const p = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return min === '00' ? `${h12}${p}` : `${h12}:${min}${p}`;
}

export function buildPUSched(rawEarly, rawLate) {
  const e = rawEarly ? new Date(rawEarly) : null;
  const l = rawLate ? new Date(rawLate) : null;
  const eValid = e && !isNaN(e.getTime()) ? e : null;
  const lValid = l && !isNaN(l.getTime()) ? l : null;
  if (!eValid && !lValid) return '';
  const early = eValid || lValid;
  const late = lValid || eValid;
  const earlyDateStr = formatDateOnlyFromDate(early);
  const lateDateStr = formatDateOnlyFromDate(late);
  if (earlyDateStr === lateDateStr) {
    if (fmtTime(early) === fmtTime(late)) return `${earlyDateStr} ${fmtTime(early)} appt`;
    return `${earlyDateStr} ${fmtTime(early)} - ${fmtTime(late)} FCFS`;
  }
  return `${earlyDateStr} ${fmtTime(early)} – ${lateDateStr} ${fmtTime(late)} FCFS`;
}

export function buildDELSched(rawDel) {
  if (!rawDel) return '';
  const d = new Date(rawDel);
  if (isNaN(d.getTime())) return '';
  return `${formatDateOnlyFromDate(d)} ${fmtTime(d)}`;
}

function isStraightBox(equipment) {
  return STRAIGHT_BOX.hasOwnProperty(String(equipment || '').toUpperCase());
}

export function computeLength(equipment, rawComment) {
  if (isStraightBox(equipment)) return 26;
  const m = String(rawComment || '').match(/(\d{2})\s*(?:'|ft\b)\s*(?:dry\s*van|van|reefer|trailer|flatbed|vr\b|v\b|r\b)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 20 && n <= 60) return n;
  }
  return FLATBED_OPEN_DECK.hasOwnProperty(String(equipment || '').toUpperCase()) ? 48 : 53;
}

export function buildComment(rawComment, contactLine) {
  const comment = String(rawComment || '');
  let dropLabel = '';
  if (
    /24\s*-?\s*(hour|hr)\s*drop/i.test(comment) ||
    /drop\s*(at\s*)?both\s*sides/i.test(comment) ||
    /drop\s*shipper\s*and\s*receiver/i.test(comment)
  ) {
    dropLabel = '24HR DROP TRAILER - SHIPPER & RECEIVER';
  } else if (/drop\s*trailer/i.test(comment) || /hook\s*and\s*drop/i.test(comment)) {
    dropLabel = 'DROP TRAILER';
  }
  const parts = [];
  if (dropLabel) parts.push(dropLabel);
  if (contactLine) parts.push(contactLine);
  return parts.join(' | ');
}

export function detectCrossPosts(comment) {
  comment = String(comment || '');
  const codes = [];
  const flags = { ambiguousFT: false, vOrR: false };

  const cnTrigger = /(?<![a-z])cn\b/i.test(comment) || /conestoga/i.test(comment);
  const sdTrigger = /(?<![a-z])sd\b/i.test(comment);
  const rgnTrigger = /(?<![a-z])rgn\b/i.test(comment) || /removable\s+gooseneck/i.test(comment);
  const sbTrigger = /(?<![a-z])sb\b/i.test(comment);
  const rzTrigger = /(?<![a-z])rz\b/i.test(comment);
  const fTrigger = /\bf\s*(works|ok)\b/i.test(comment);

  const ftMeasurement = /\d[\d\s-]*ft\b/i.test(comment);
  const ftRawMatch = /(?<![a-z])ft\b/i.test(comment);
  const ftCommaList = /,\s*ft\b/i.test(comment) || /\bft\s*,/i.test(comment);
  const ftPaired = cnTrigger || sdTrigger || rgnTrigger;
  const ftTrigger = ftRawMatch && !ftMeasurement && (ftPaired || ftCommaList);
  if (ftRawMatch && !ftMeasurement && !ftTrigger) {
    flags.ambiguousFT = true;
  }

  const rOff =
    /\br\b[^a-z0-9]{0,15}\boff\b/i.test(comment) ||
    /\boff\b[^a-z0-9]{0,15}\br\b/i.test(comment) ||
    /\breefer\b[^a-z0-9]{0,15}\boff\b/i.test(comment) ||
    /\boff\b[^a-z0-9]{0,15}\breefer\b/i.test(comment);
  const rRaw = /\br\b/i.test(comment);
  const vOrR = /\bv\b[^a-z0-9]{0,6}\bor\b[^a-z0-9]{0,6}\br\b/i.test(comment) || /\bv\s*\/\s*r\b/i.test(comment);
  let rTrigger = false;
  if (!rOff) {
    if (vOrR) {
      rTrigger = true;
      flags.vOrR = true;
    } else if (rRaw) {
      rTrigger = true;
    }
  }

  if (cnTrigger) codes.push('CN');
  if (sdTrigger) codes.push('SD');
  if (rgnTrigger) codes.push('RGN');
  if (ftTrigger) codes.push('FT');
  if (fTrigger) codes.push('F');
  if (rTrigger) codes.push('R');
  if (sbTrigger) codes.push('SB');
  if (rzTrigger) codes.push('RZ');

  const seen = {};
  const uniqueCodes = codes.filter((c) => {
    if (seen[c]) return false;
    seen[c] = true;
    return true;
  });

  return { codes: uniqueCodes, ...flags };
}

export function buildDatRow(row, contactMethodChoice) {
  const contactMethod = isStraightBox(row.equipment) ? 'email' : contactMethodChoice === 'email' ? 'email' : 'primary phone';
  const o = {};
  o['Pickup Earliest*'] = row.pickupEarliest;
  o['Pickup Latest'] = row.pickupLatest;
  o['Length (ft)*'] = computeLength(row.equipment, row.rawComment);
  o['Weight (lbs)*'] = row.weightNum === null ? '' : row.weightNum;
  o['Full/Partial*'] = 'Full';
  o['Equipment*'] = row.equipment;
  o['Use Private Network*'] = 'no';
  o['Private Network Rate'] = '';
  o['Allow Private Network Booking'] = 'no';
  o['Allow Private Network Bidding'] = 'no';
  o['Use DAT Loadboard*'] = 'yes';
  o['DAT Loadboard Rate'] = row.includeRate && row.targetPayNum !== null && row.targetPayNum > 0 ? row.targetPayNum : '';
  o['Allow DAT Loadboard Booking'] = 'no';
  o['Use Extended Network'] = 'no';
  o['Contact Method*'] = contactMethod;
  o['Origin City*'] = row.origCity;
  o['Origin State*'] = row.origState;
  o['Origin Postal Code'] = '';
  o['Destination City*'] = row.destCity;
  o['Destination State*'] = row.destState;
  o['Destination Postal Code'] = '';
  o['Comment'] = row.isTeam ? 'TEAM' + (row.comment ? ' | ' + row.comment : '') : row.comment;
  o['Commodity'] = '';
  o['Reference ID'] = row.order;
  return o;
}

function makeEmptyAnomalies() {
  return {
    sameCity: [], blankEquipment: [], unknownEquipment: [], dedupDecisions: [],
    rateAnomalies: [], crossPostFlags: [], cityOverrideFlags: [], ambiguousCrossPost: [],
    vOrRFlags: [], locationFlags: [],
  };
}

export function countAnomalies(a) {
  return Object.values(a).reduce((sum, list) => sum + list.length, 0);
}

function buildExpandedRows(loads, options, anomalies) {
  const { commentContact } = options;
  const expandedRows = [];

  loads.forEach((load) => {
    const order = load.load_number || '';
    const origCity = load.origin_city || '';
    const origState = load.origin_state || '';
    const destCity = load.dest_city || '';
    const destState = load.dest_state || '';
    const equipment = load.equipment || '';
    const rawComment = load.comment || '';

    if (equipment === '') {
      anomalies.blankEquipment.push({ order });
      return;
    }

    if (origCity !== '' && destCity !== '' && origCity.toLowerCase() === destCity.toLowerCase()) {
      anomalies.sameCity.push({ order, route: `${origCity}, ${origState} -> ${destCity}, ${destState}` });
    }

    if (!KNOWN_EQUIPMENT_VALUES.has(equipment.toUpperCase())) {
      anomalies.unknownEquipment.push({ order, rawCode: equipment });
    }

    const weightNum = parseWeightNum(load.weight);
    const targetPayNum = load.target_pay === null || load.target_pay === undefined || load.target_pay === '' ? null : parseFloat(load.target_pay);

    if (targetPayNum !== null) {
      if (targetPayNum > 10000) {
        anomalies.rateAnomalies.push({ order, detail: `Rate $${targetPayNum.toLocaleString()} exceeds $10,000 — verify for misplaced decimal.` });
      } else if (targetPayNum === 0) {
        anomalies.rateAnomalies.push({ order, detail: 'Target Pay is $0 (zero-rate load).' });
      }
    }

    let finalOrigCity = origCity;
    let finalOrigState = origState;
    let finalDestCity = destCity;
    let finalDestState = destState;
    const postAsMatch = rawComment.match(/post\s+as\s+([a-z .'-]+?),\s*([a-z]{2})\s+to\s+([a-z .'-]+?),\s*([a-z]{2})/i);
    if (postAsMatch) {
      finalOrigCity = titleCase(postAsMatch[1].trim());
      finalOrigState = postAsMatch[2].toUpperCase();
      finalDestCity = titleCase(postAsMatch[3].trim());
      finalDestState = postAsMatch[4].toUpperCase();
    }
    if (/don'?t\s*post\s*actual\s*cities/i.test(rawComment)) {
      anomalies.cityOverrideFlags.push({
        order,
        route: `${origCity}, ${origState} -> ${destCity}, ${destState}`,
        note: "Comment says DON'T POST ACTUAL CITIES — manual city substitution required before uploading.",
      });
    }

    if (CANADIAN_PROVINCES.includes(origState.toUpperCase()) || CANADIAN_PROVINCES.includes(destState.toUpperCase())) {
      anomalies.locationFlags.push({ order, detail: `Canadian origin/destination: ${origCity}, ${origState} -> ${destCity}, ${destState}` });
    }
    if (origCity.toLowerCase() === 'birmingham' && origState.toUpperCase() === 'MO') {
      anomalies.locationFlags.push({ order, detail: 'Origin listed as Birmingham, MO — atypical city/state combination, verify.' });
    }
    if (destCity.toLowerCase() === 'birmingham' && destState.toUpperCase() === 'MO') {
      anomalies.locationFlags.push({ order, detail: 'Destination listed as Birmingham, MO — atypical city/state combination, verify.' });
    }

    const comment = buildComment(rawComment, commentContact);
    const pickupEarliest = formatDateOnly(load.early_pu);
    const pickupLatest = formatDateOnly(load.late_pu);

    const includeRate = Boolean(load.include_rate);

    const baseRow = {
      order,
      origCity: finalOrigCity, origState: finalOrigState, destCity: finalDestCity, destState: finalDestState,
      equipment,
      weightNum,
      targetPayNum,
      pickupEarliest, pickupLatest,
      rawComment,
      comment,
      isTeam: String(load.raw_equipment || '').toUpperCase() === 'POTM',
      includeRate,
      loadId: load.id,
    };

    expandedRows.push(baseRow);

    const { codes, ambiguousFT, vOrR } = detectCrossPosts(rawComment);
    if (ambiguousFT) {
      anomalies.ambiguousCrossPost.push({
        order,
        detail: "Comment mentions 'FT' standalone, not clearly paired with CN/SD/RGN or comma-listed — verify if Flatbed w/Tarps cross-post is needed.",
      });
    }
    if (vOrR) {
      anomalies.vOrRFlags.push({ order, detail: "Comment indicates 'V or R' — posting R cross-post; verify V option with dispatcher." });
    }
    codes.forEach((code) => {
      if (code === equipment) return;
      const clone = { ...baseRow, equipment: code };
      expandedRows.push(clone);
      anomalies.crossPostFlags.push({ order, route: `${finalOrigCity} -> ${finalDestCity}`, addedEquipment: code });
    });
  });

  return expandedRows;
}

function dedupExpandedRows(expandedRows, anomalies) {
  const groups = {};
  expandedRows.forEach((row) => {
    const key = `${row.origCity}|${row.destCity}|${row.equipment}|${row.pickupEarliest}`.toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  const finalRows = [];
  Object.keys(groups).forEach((key) => {
    const group = groups[key];
    if (group.length === 1) {
      finalRows.push(group[0]);
      return;
    }
    group.sort((a, b) => {
      const aw = a.weightNum === null ? -1 : a.weightNum;
      const bw = b.weightNum === null ? -1 : b.weightNum;
      if (bw !== aw) return bw - aw;
      const ap = a.targetPayNum === null ? -1 : a.targetPayNum;
      const bp = b.targetPayNum === null ? -1 : b.targetPayNum;
      if (bp !== ap) return bp - ap;
      return orderCompare(a.order, b.order);
    });
    const winner = group[0];
    finalRows.push(winner);
    for (let i = 1; i < group.length; i++) {
      let reason = 'Higher weight';
      if (group[i].weightNum === winner.weightNum) reason = 'Higher Target Pay (tie on weight)';
      if (group[i].weightNum === winner.weightNum && group[i].targetPayNum === winner.targetPayNum) {
        reason = 'Earlier order number (tie on weight and pay)';
      }
      anomalies.dedupDecisions.push({
        winner: winner.order, dropped: group[i].order,
        route: `${winner.origCity} -> ${winner.destCity}`, equipment: winner.equipment,
        reason,
      });
    }
  });

  return finalRows;
}

// options: { contactMethod: 'phone'|'email', commentContact: string }
// Each load's own include_rate switch (persisted on the load, not chosen
// per export) controls whether its DAT Loadboard Rate is populated.
export function processLoadsForExport(loads, options) {
  const { contactMethod = 'phone', commentContact = '' } = options || {};
  const anomalies = makeEmptyAnomalies();

  const expandedRows = buildExpandedRows(loads, { commentContact }, anomalies);
  const finalRows = dedupExpandedRows(expandedRows, anomalies);
  const exportRows = finalRows.map((row) => buildDatRow(row, contactMethod));

  return { finalRows, exportRows, anomalies };
}

export function buildDatCsv(exportRows) {
  return Papa.unparse({
    fields: DAT_HEADERS,
    data: exportRows.map((row) => DAT_HEADERS.map((h) => row[h])),
  });
}

export function buildDatExportFilename(date = new Date()) {
  return `DAT_Bulk_Upload_${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.csv`;
}
