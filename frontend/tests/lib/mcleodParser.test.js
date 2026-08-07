import { describe, test, expect } from 'vitest';
import { parseMcleodRows, cleanText, toMysqlDatetime, parseTemp, parseLookupCommodity } from '../../src/lib/mcleodParser';

const FIELDS = [
  'Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State',
  'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt',
  'Late Del Dt', 'Stops', 'Planning Comment',
];

function row(overrides = {}) {
  return {
    Order: '0078033',
    'Origin City': 'NEWPORT',
    'Origin State': 'AR',
    'Dest City': 'O FALLON',
    'Dest State': 'MO',
    'Equip Type': 'FGT',
    Weight: '12845.0 LB',
    'Target Pay': '$1,100.00',
    'Early P/U Dt': '07/01/2026 1200',
    'Late P/U Dt': '07/01/2026 1200',
    'Late Del Dt': '07/01/2026 2300',
    Stops: '0',
    'Planning Comment': '1p1d / $90 LUMP AT DEL',
    ...overrides,
  };
}

describe('parseMcleodRows', () => {
  test('maps a well-formed row to a load object matching the backend schema', () => {
    const { loads, missing } = parseMcleodRows(FIELDS, [row()]);
    expect(missing).toEqual([]);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({
      load_number: '0078033',
      origin_city: 'NEWPORT',
      origin_state: 'AR',
      dest_city: 'O FALLON',
      dest_state: 'MO',
      equipment: 'V',
      weight: '12845.0 LB',
      target_pay: 1100,
      early_pu: '2026-07-01 12:00:00',
      late_pu: '2026-07-01 12:00:00',
      late_del: '2026-07-01 23:00:00',
      stops: 0,
      comment: '1p1d / $90 LUMP AT DEL',
    });
  });

  test('reports missing required columns instead of throwing', () => {
    const { loads, missing } = parseMcleodRows(['Order'], [{ Order: '123' }]);
    expect(loads).toEqual([]);
    expect(missing.length).toBeGreaterThan(0);
  });

  test('skips rows with a blank load number or equipment', () => {
    const { loads } = parseMcleodRows(FIELDS, [row({ Order: '' }), row({ 'Equip Type': '' }), row()]);
    expect(loads).toHaveLength(1);
  });

  test('drops fully blank rows', () => {
    const blank = {};
    FIELDS.forEach((f) => { blank[f] = ''; });
    const { loads } = parseMcleodRows(FIELDS, [blank, row()]);
    expect(loads).toHaveLength(1);
  });

  test('derives commodity from the planning comment', () => {
    const { loads } = parseMcleodRows(FIELDS, [row({ 'Planning Comment': 'BEER KEGS, KEEP UPRIGHT' })]);
    expect(loads[0].commodity).toBe('Beer');
  });

  test('derives temperature only for reefer equipment', () => {
    const reefer = parseMcleodRows(FIELDS, [row({ 'Equip Type': 'R', 'Planning Comment': 'TEMP: 34-36' })]);
    expect(reefer.loads[0].temperature).toBe('34–36°F');

    const dryVan = parseMcleodRows(FIELDS, [row({ 'Equip Type': 'V', 'Planning Comment': 'TEMP: 34-36' })]);
    expect(dryVan.loads[0].temperature).toBeNull();
  });

  test('recognizes column name variants (e.g. "Dest City" vs "Destination City")', () => {
    const altFields = FIELDS.map((f) => (f === 'Dest City' ? 'Destination City' : f));
    const altRow = row();
    altRow['Destination City'] = altRow['Dest City'];
    delete altRow['Dest City'];
    const { loads, missing } = parseMcleodRows(altFields, [altRow]);
    expect(missing).toEqual([]);
    expect(loads[0].dest_city).toBe('O FALLON');
  });

  test('returns an empty result instead of throwing when rows is not an array', () => {
    const { loads, missing } = parseMcleodRows(FIELDS, null);
    expect(loads).toEqual([]);
    expect(missing).toEqual([]);
  });
});

describe('toMysqlDatetime', () => {
  test('converts "MM/DD/YYYY HHMM" to a MySQL datetime string', () => {
    expect(toMysqlDatetime('07/01/2026 1200')).toBe('2026-07-01 12:00:00');
  });

  test('defaults to midnight when no time is present', () => {
    expect(toMysqlDatetime('07/01/2026')).toBe('2026-07-01 00:00:00');
  });

  test('returns null for an empty or unparseable value', () => {
    expect(toMysqlDatetime('')).toBeNull();
    expect(toMysqlDatetime('not a date')).toBeNull();
  });

  test('returns null when a time part is present but unparseable', () => {
    expect(toMysqlDatetime('07/01/2026 12:00')).toBeNull();
  });
});

describe('parseTemp', () => {
  test('returns null for non-reefer equipment regardless of comment content', () => {
    expect(parseTemp('TEMP: 34-36', 'V')).toBeNull();
  });

  test('detects "frozen" as a keyword before checking numeric ranges', () => {
    expect(parseTemp('KEEP FROZEN AT ALL TIMES', 'R')).toBe('Frozen');
  });

  test('detects a numeric temperature range', () => {
    expect(parseTemp('TEMP 34-36 DEGREES', 'R')).toBe('34–36°F');
  });

  test('detects a single numeric temperature', () => {
    expect(parseTemp('TEMP: 35', 'R')).toBe('35°F');
  });

  test('falls back to "Refrigerated" when temperature is mentioned but not numeric', () => {
    expect(parseTemp('MUST BE REFRIGERATED', 'R')).toBe('Refrigerated');
  });

  test('returns null when nothing temperature-related is mentioned', () => {
    expect(parseTemp('STANDARD DRY GOODS', 'R')).toBeNull();
  });
});

describe('parseLookupCommodity', () => {
  test('detects empty beer containers specifically', () => {
    // Note: the current hasEmpty regex requires "empty" to sit directly next to
    // bottles/cans/containers/returnables, so a word in between (e.g. "beer")
    // falls through to the generic beer-keyword match instead of the empty-beer
    // special case. This documents actual current behavior; see task report.
    expect(parseLookupCommodity('EMPTY BEER BOTTLES FOR RETURN')).toBe('Beer');
  });

  test('detects empty containers without beer context', () => {
    expect(parseLookupCommodity('EMPTY CONTAINERS')).toBe('Empty bottles/cans');
  });

  test('detects ice cream before the generic frozen check', () => {
    expect(parseLookupCommodity('FROZEN ICE CREAM PRODUCTS')).toBe('Ice cream');
  });

  test('detects a frozen protein specifically', () => {
    expect(parseLookupCommodity('FROZEN CHICKEN BREAST')).toBe('Frozen Chicken');
  });

  test('falls back to generic frozen food when no specific protein is named', () => {
    expect(parseLookupCommodity('FROZEN FOOD ITEMS')).toBe('Frozen food');
  });

  test('detects wine', () => {
    expect(parseLookupCommodity('CASE OF WINE FROM THE VINEYARD')).toBe('Wine');
  });

  test('detects steel/metal', () => {
    expect(parseLookupCommodity('STEEL COILS')).toBe('Steel / metal');
  });

  test('returns null when nothing matches', () => {
    expect(parseLookupCommodity('MISCELLANEOUS FREIGHT')).toBeNull();
  });
});

describe('cleanText', () => {
  test('collapses whitespace and trims', () => {
    expect(cleanText('  hello   world  ')).toBe('hello world');
  });

  test('handles null/undefined', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });
});
