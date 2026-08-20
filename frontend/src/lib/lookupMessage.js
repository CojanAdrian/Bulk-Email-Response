import { parseLookupCommodity, parseTemp } from './mcleodParser';
import { parseWeightNum, formatDateOnly, buildPUSched, buildDELSched } from './datExport';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDateRange(earliest, latest) {
  function parse(s) {
    const m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? { mo: +m[1], dy: +m[2] } : null;
  }
  const ep = parse(earliest);
  if (!ep) return earliest || '';
  const base = `${MONTH_NAMES[ep.mo - 1]} ${ep.dy}`;
  const lp = parse(latest);
  if (!lp || (lp.mo === ep.mo && lp.dy === ep.dy)) return base;
  if (lp.mo === ep.mo) return `${base}-${lp.dy}`;
  return `${base} – ${MONTH_NAMES[lp.mo - 1]} ${lp.dy}`;
}

export function extractSched(comment, side) {
  const segs = String(comment || '').split(/[|,;\n/]/);
  const sidePat = side === 'pu' ? /\b(pu|pickup|pick[\s-]?up)\b/i : /\b(del|delivery|deliver)\b/i;
  const otherPat = side === 'pu' ? /\b(del|delivery|deliver)\b/i : /\b(pu|pickup|pick[\s-]?up)\b/i;

  const specific = [];
  const general = [];
  segs.forEach((raw) => {
    const s = raw.trim();
    if (sidePat.test(s)) specific.push(s);
    else if (!otherPat.test(s)) general.push(s);
  });
  const pool = specific.length ? specific : side === 'pu' ? general : [];

  const result = [];
  const seen = {};
  pool.forEach((seg) => {
    if (/\bFCFS\b/i.test(seg) && !seen.fcfs) {
      result.push('FCFS');
      seen.fcfs = true;
    }
    const appt = seg.match(/\b(?:appt|appointment)\b[^\d]{0,8}(\d{1,2}:?\d{2}\s*(?:am|pm)?)/i);
    if (appt && !seen.appt) {
      result.push('Appt ' + appt[1].trim());
      seen.appt = true;
    }
    if (!seen.range) {
      const range = seg.match(/\b(\d{1,2}:?\d{2}\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}:?\d{2}\s*(?:am|pm)?)\b/i);
      if (range && !appt) {
        result.push(range[1].trim() + '-' + range[2].trim());
        seen.range = true;
      }
    }
    if (!seen.open && !seen.range && !seen.appt) {
      const open = seg.match(/\b(?:open|hours?|dock)\b[^\d]{0,8}(\d{3,4}|\d{1,2}:\d{2})/i);
      if (open) {
        result.push(open[1].trim());
        seen.open = true;
      }
    }
  });
  return result.join(', ');
}

export function detectMultiStop(load) {
  const c = load.comment || '';
  const stops = load.stops || 0;
  const isMultiPick = /\b(2nd?\s*(pu|pick(?:up)?)|multi.?pick|multiple\s*pick|add(?:itional|'?l)\s*pick|2\s*pu\b|\bpu\s*#\s*2\b)/i.test(c);
  const isMultiDrop = /\b(2nd?\s*(del(?:ivery)?|drop)|multi.?drop|multiple\s*del|add(?:itional|'?l)\s*del|2\s*del\b|\bdel\s*#\s*2\b)/i.test(c);
  if (isMultiPick && isMultiDrop) return 'MULTI-PICK & MULTI-DROP';
  if (isMultiPick) return 'MULTI-PICK';
  if (isMultiDrop) return 'MULTI-DROP';
  if (stops > 0) return 'MULTI-STOP';
  return null;
}

// Red until structured extra stops exist, then blue -- once real stops are
// entered, that's the definitive resolved state, regardless of whether the
// comment-text heuristic would also have triggered.
export function multiStopTagVariant(load) {
  const extraStops = Array.isArray(load.extra_stops) ? load.extra_stops : [];
  if (extraStops.length > 0) return 'info';
  if (detectMultiStop(load)) return 'error';
  return null;
}

export function buildLookupMessage(load, showRate) {
  const lines = [];
  const comment = load.comment || '';

  let puLine = `PU: ${load.origin_city}, ${load.origin_state}${load.origin_zip ? ' ' + load.origin_zip : ''}`;
  if (load.early_pu || load.late_pu) {
    const puSched = buildPUSched(load.early_pu, load.late_pu);
    if (puSched) puLine += ' – ' + puSched;
  } else {
    const puDate = formatShortDateRange(formatDateOnly(load.early_pu), formatDateOnly(load.late_pu));
    const puSchedAlt = extractSched(comment, 'pu');
    if (puDate) puLine += ' – ' + puDate;
    if (puSchedAlt) puLine += ' – ' + puSchedAlt;
  }
  lines.push(puLine);

  let delLine = `DEL: ${load.dest_city}, ${load.dest_state}${load.dest_zip ? ' ' + load.dest_zip : ''}`;
  if (load.early_del || load.late_del) {
    const delSched = buildDELSched(load.early_del, load.late_del);
    if (delSched) delLine += ' – ' + delSched;
  } else {
    const delSchedAlt = extractSched(comment, 'del');
    if (delSchedAlt) delLine += ' – ' + delSchedAlt;
  }
  lines.push(delLine);

  const commodity = load.commodity || parseLookupCommodity(comment);
  if (commodity) lines.push(`Commodity: ${commodity}`);

  const weightNum = parseWeightNum(load.weight);
  if (weightNum !== null && weightNum > 0) {
    lines.push(`Weight: ${weightNum.toLocaleString()} lbs`);
  }

  const temp = load.temperature || parseTemp(comment, load.equipment);
  if (temp) lines.push(`Temp: ${temp}`);

  const targetPayNum =
    load.target_pay === null || load.target_pay === undefined || load.target_pay === '' ? null : parseFloat(load.target_pay);
  if (showRate && targetPayNum !== null && targetPayNum > 0) {
    lines.push(`Rate: $${targetPayNum.toLocaleString()}`);
  } else {
    lines.push('How much would you need for this?');
  }

  return lines.join('\n');
}
