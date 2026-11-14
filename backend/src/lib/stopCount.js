// How many pickups and deliveries a load has, from the best source there is:
//   1. extra stops entered on the load (exact),
//   2. a count written in the planning comment: "1p2d", "2P/1D", "1 pick 3 drops",
//      "2pu 1del", "1 PU / 2 DEL",
//   3. words in the comment ("multi drop", "2nd pick") or McLeod's stop count,
//      which say there is more than one stop but not exactly how many.
// The frontend has the same rules in src/lib/stopCount.js; both are checked
// against shared/reply-fixtures.json.

const PICK = '(?:p|pu|pus|pick|picks|pickup|pickups)';
const DROP = '(?:d|del|dels|drop|drops|delivery|deliveries)';
const COUNT_PATTERN = new RegExp(`(?:^|[^a-z0-9])(\\d{1,2})\\s*${PICK}\\s*[/,&+-]?\\s*(?:and\\s*)?(\\d{1,2})\\s*${DROP}(?![a-z])`, 'i');
const MULTI_PICK = /\b(2nd?\s*(pu|pick(?:up)?)|multi.?pick|multiple\s*pick|add(?:itional|'?l)\s*pick|\bpu\s*#\s*2\b)/i;
const MULTI_DROP = /\b(2nd?\s*(del(?:ivery)?|drop)|multi.?drop|multiple\s*del|add(?:itional|'?l)\s*del|\bdel\s*#\s*2\b)/i;

function extraStopsOf(load) {
  if (Array.isArray(load.extra_stops)) return load.extra_stops;
  if (typeof load.extra_stops === 'string') {
    try {
      const parsed = JSON.parse(load.extra_stops);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// { picks, drops, exact } when the counts are known, { multiPick, multiDrop }
// when only "more than one" is known, or null for a plain one-pick
// one-drop load.
function stopCount(load) {
  const extra = extraStopsOf(load).filter((stop) => stop && (stop.type === 'pickup' || stop.type === 'delivery'));
  if (extra.length > 0) {
    const picks = 1 + extra.filter((stop) => stop.type === 'pickup').length;
    const drops = 1 + extra.filter((stop) => stop.type === 'delivery').length;
    return picks > 1 || drops > 1 ? { picks, drops, exact: true } : null;
  }
  const comment = String(load.comment || '');
  const written = comment.match(COUNT_PATTERN);
  if (written) {
    const picks = Number(written[1]);
    const drops = Number(written[2]);
    if (picks >= 1 && drops >= 1 && (picks > 1 || drops > 1)) return { picks, drops, exact: true };
    if (picks === 1 && drops === 1) return null;
  }
  const multiPick = MULTI_PICK.test(comment);
  const multiDrop = MULTI_DROP.test(comment);
  if (multiPick || multiDrop) return { multiPick, multiDrop };
  // McLeod's Stops column counts the extra stops, so a 1p2d load has 1.
  if (Number(load.stops) > 0) return { multiPick: false, multiDrop: false, stops: Number(load.stops) + 2 };
  return null;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// "1P/2D", or "MULTI-PICK", "MULTI-DROP", "MULTI-STOP"; null for 1p1d.
function stopCode(load) {
  const count = stopCount(load);
  if (!count) return null;
  if (count.exact) return `${count.picks}P/${count.drops}D`;
  if (count.multiPick && count.multiDrop) return 'MULTI-PICK/DROP';
  if (count.multiPick) return 'MULTI-PICK';
  if (count.multiDrop) return 'MULTI-DROP';
  return 'MULTI-STOP';
}

// The line for a reply: "Stops: 1 pick, 2 drops (1P/2D)".
function stopLine(load) {
  const count = stopCount(load);
  if (!count) return null;
  if (count.exact) return `Stops: ${plural(count.picks, 'pick')}, ${plural(count.drops, 'drop')} (${count.picks}P/${count.drops}D)`;
  if (count.multiPick && count.multiDrop) return 'Stops: multiple picks and drops';
  if (count.multiPick) return 'Stops: multiple picks';
  if (count.multiDrop) return 'Stops: multiple drops';
  return `Stops: ${count.stops} stops`;
}

module.exports = { stopCount, stopCode, stopLine };
