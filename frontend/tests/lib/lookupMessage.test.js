import { describe, test, expect } from 'vitest';
import { extractSched, detectMultiStop, multiStopTagVariant, buildLookupMessage } from '../../src/lib/lookupMessage';

function iso(y, mo, d, h = 0, min = 0) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(min)}:00`;
}

function load(overrides = {}) {
  return {
    id: 1,
    load_number: '1001',
    origin_city: 'Chicago',
    origin_state: 'IL',
    origin_zip: '',
    dest_city: 'Dallas',
    dest_state: 'TX',
    dest_zip: '',
    equipment: 'V',
    weight: '42000',
    target_pay: 1500,
    early_pu: iso(2026, 8, 10, 8, 0),
    late_pu: iso(2026, 8, 10, 8, 0),
    late_del: null,
    stops: 0,
    commodity: null,
    temperature: null,
    comment: '',
    ...overrides,
  };
}

describe('extractSched', () => {
  test('extracts FCFS from a pickup-tagged segment', () => {
    expect(extractSched('PU FCFS, DEL appt 1400', 'pu')).toBe('FCFS');
  });

  test('extracts an appointment time', () => {
    expect(extractSched('DEL appt 1400', 'del')).toBe('Appt 1400');
  });

  test('extracts a time range when not an appointment', () => {
    expect(extractSched('PU 0700-1500', 'pu')).toBe('0700-1500');
  });

  test('extracts open/hours/dock text as a fallback', () => {
    expect(extractSched('PU open 0700', 'pu')).toBe('0700');
  });

  test('falls back to general (untagged) segments only for pickup, not delivery', () => {
    expect(extractSched('FCFS all day', 'pu')).toBe('FCFS');
    expect(extractSched('FCFS all day', 'del')).toBe('');
  });

  test('returns an empty string when nothing matches', () => {
    expect(extractSched('no schedule info here', 'pu')).toBe('');
  });
});

describe('detectMultiStop', () => {
  test('detects multi-pick language', () => {
    expect(detectMultiStop(load({ comment: '2nd pickup required' }))).toBe('MULTI-PICK');
  });

  test('detects multi-drop language', () => {
    expect(detectMultiStop(load({ comment: 'multi-drop load' }))).toBe('MULTI-DROP');
  });

  test('detects both together', () => {
    expect(detectMultiStop(load({ comment: '2nd pickup and 2nd delivery' }))).toBe('MULTI-PICK/DROP');
  });

  test('reads a written count like 1p2d', () => {
    expect(detectMultiStop(load({ comment: '1p2d / lumper at del' }))).toBe('MULTI-DROP · 1P/2D');
  });

  test('falls back to a generic multi-stop when McLeod has extra stops', () => {
    expect(detectMultiStop(load({ comment: '', stops: 1 }))).toBe('MULTI-STOP');
  });

  test('returns null for a plain load', () => {
    expect(detectMultiStop(load({ comment: '1p1d / standard load', stops: 0 }))).toBeNull();
  });
});

describe('multiStopTagVariant', () => {
  test('red while only words say there is more than one stop', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [] }))).toBe('error');
  });

  test('blue when the count is known from the comment', () => {
    expect(multiStopTagVariant(load({ comment: '2p1d' }))).toBe('info');
  });

  test('blue when extra stops are entered', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [{ type: 'pickup', city: 'X', state: 'TX' }] }))).toBe('info');
  });

  test('null when nothing suggests extra stops', () => {
    expect(multiStopTagVariant(load({ comment: 'standard load', stops: 0, extra_stops: [] }))).toBeNull();
  });
});

describe('buildLookupMessage', () => {
  test('leaves out a side with no city instead of printing undefined', () => {
    const msg = buildLookupMessage(load({ origin_city: '', origin_state: '', dest_city: '', dest_state: '' }), true);
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('PU:');
    expect(msg).not.toContain('DEL:');
  });

  test('uses the load times exactly as written', () => {
    expect(buildLookupMessage(load(), true)).toContain('PU: CHICAGO, IL – 08/10/2026 8am appt');
  });

  test('one delivery time is an appointment', () => {
    expect(buildLookupMessage(load({ late_del: iso(2026, 8, 11, 23, 0) }), true)).toContain('DEL: DALLAS, TX – 08/11/2026 11pm appt');
  });

  test('a delivery window is FCFS', () => {
    const msg = buildLookupMessage(load({ early_del: iso(2026, 8, 11, 9, 0), late_del: iso(2026, 8, 11, 17, 0) }), true);
    expect(msg).toContain('DEL: DALLAS, TX – 08/11/2026 9am-5pm FCFS');
  });

  test('writes the stop count', () => {
    expect(buildLookupMessage(load({ comment: '1p2d' }), true)).toContain('Stops: 1 pick, 2 drops (1P/2D)');
  });

  test('uses the saved commodity, weight and temp', () => {
    const msg = buildLookupMessage(load({ commodity: 'Beer', weight: '42000', temperature: '34°F' }), true);
    expect(msg).toContain('Commodity: Beer');
    expect(msg).toContain('Weight: 42,000 lbs');
    expect(msg).toContain('Temp: 34°F');
  });

  test('omits a zero weight', () => {
    expect(buildLookupMessage(load({ weight: '0' }), true)).not.toContain('Weight:');
  });

  test('shows the rate when asked', () => {
    expect(buildLookupMessage(load({ target_pay: 1500 }), true)).toContain('Rate: $1,500');
  });

  test('asks the carrier for a rate when the rate is hidden', () => {
    const msg = buildLookupMessage(load({ target_pay: 1500 }), false);
    expect(msg).not.toContain('Rate:');
    expect(msg).toContain('How much would you need for this?');
  });

  test('asks for a rate when there is none', () => {
    expect(buildLookupMessage(load({ target_pay: null }), true)).toContain('How much would you need for this?');
  });

  test('Copy can leave the question out', () => {
    expect(buildLookupMessage(load({ target_pay: 1500 }), false, { askRate: false })).not.toContain('How much');
  });
});
