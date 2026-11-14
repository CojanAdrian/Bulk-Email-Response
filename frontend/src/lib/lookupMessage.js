import { composeLoadText, rateIsShown, formatRate } from './loadText';
import { stopBadge, stopCount, extraStopsOf } from './stopCount';

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

// The badge for a multi-stop load: "MULTI-DROP · 1P/2D", "MULTI-PICK", ...
// null for a plain one-pick one-drop load.
export function detectMultiStop(load) {
  return stopBadge(load);
}

// Blue once the stops are known exactly (entered on the load, or a count
// like 1p2d in the comment); red while we only know there is more than one.
export function multiStopTagVariant(load) {
  if (extraStopsOf(load).length > 0) return 'info';
  const count = stopCount(load);
  if (!count) return null;
  return count.exact ? 'info' : 'error';
}

export const RATE_QUESTION = 'How much would you need for this?';

// Copy and Blast: exactly the text the server emails back (loadText.js),
// with the rate shown or not. A blast with no rate asks the carrier for one.
export function buildLookupMessage(load, showRate, { askRate = true } = {}) {
  const text = composeLoadText({ ...load, include_rate: showRate ? 1 : 0 }) || '';
  const hasRate = showRate && formatRate(load.target_pay);
  if (!hasRate && askRate) return text ? `${text}\n${RATE_QUESTION}` : RATE_QUESTION;
  return text;
}

export { rateIsShown };
