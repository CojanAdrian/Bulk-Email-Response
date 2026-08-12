import { describe, test, expect } from 'vitest';
import { searchLoads, extractSched, detectMultiStop, multiStopTagVariant, buildLookupMessage } from '../../src/lib/lookupMessage';

function iso(y, mo, d, h = 0, min = 0) {
  return new Date(y, mo - 1, d, h, min, 0).toISOString();
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

describe('searchLoads', () => {
  const loads = [
    load({ id: 1, load_number: '1001', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX' }),
    load({ id: 2, load_number: '2002', origin_city: 'Springfield', origin_state: 'IL', dest_city: 'Peoria', dest_state: 'IL' }),
    load({ id: 3, load_number: '3003', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Chicago', dest_state: 'IL' }),
  ];

  test('returns nothing for an empty query', () => {
    expect(searchLoads(loads, '')).toEqual([]);
    expect(searchLoads(loads, '   ')).toEqual([]);
  });

  test('matches by load number substring, ranked above city/state matches', () => {
    const result = searchLoads(loads, '1001');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('an exact origin-state match outranks an origin-city substring match', () => {
    const isolatedLoads = [
      load({ id: 10, origin_city: 'Peoria', origin_state: 'IL', dest_city: 'Reno', dest_state: 'NV' }),
      load({ id: 11, origin_city: 'Milford', origin_state: 'OH', dest_city: 'Reno', dest_state: 'NV' }),
    ];
    const result = searchLoads(isolatedLoads, 'il');
    expect(result.map((l) => l.id)).toEqual([10, 11]);
  });

  test('origin city substring match outranks dest city substring match', () => {
    // "chicago" is load 1's origin (35pts) and load 3's destination (8pts)
    const result = searchLoads(loads, 'chicago');
    expect(result.map((l) => l.id)).toEqual([1, 3]);
  });

  test('returns an empty array when nothing matches', () => {
    expect(searchLoads(loads, 'nonexistent')).toEqual([]);
  });
});

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

  test('detects both multi-pick and multi-drop together', () => {
    expect(detectMultiStop(load({ comment: '2nd pickup and 2nd delivery' }))).toBe('MULTI-PICK & MULTI-DROP');
  });

  test('falls back to a generic multi-stop warning when stops > 0 with no specific language', () => {
    expect(detectMultiStop(load({ comment: '', stops: 2 }))).toBe('MULTI-STOP');
  });

  test('returns null when there is nothing to warn about', () => {
    expect(detectMultiStop(load({ comment: 'standard load', stops: 0 }))).toBeNull();
  });
});

describe('multiStopTagVariant', () => {
  test('returns "error" (red) when multi-stop language is detected and there are no structured extra stops', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [] }))).toBe('error');
  });

  test('returns "info" (blue) when structured extra stops exist, regardless of comment language', () => {
    expect(multiStopTagVariant(load({ comment: 'standard load', extra_stops: [{ type: 'pickup', city: 'X', state: 'TX' }] }))).toBe('info');
  });

  test('returns "info" even when multi-stop language is also detected', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: [{ type: 'pickup', city: 'X', state: 'TX' }] }))).toBe('info');
  });

  test('returns null when nothing suggests extra stops', () => {
    expect(multiStopTagVariant(load({ comment: 'standard load', stops: 0, extra_stops: [] }))).toBeNull();
  });

  test('treats a missing extra_stops field as no structured stops', () => {
    expect(multiStopTagVariant(load({ comment: '2nd pickup required', extra_stops: undefined }))).toBe('error');
  });
});

describe('buildLookupMessage', () => {
  test('includes PU/DEL lines built from real datetime columns when present', () => {
    const msg = buildLookupMessage(load(), true);
    expect(msg).toContain('PU: Chicago, IL – 08/10/2026 8am appt');
  });

  test('includes the delivery schedule from late_del when present', () => {
    const msg = buildLookupMessage(load({ late_del: iso(2026, 8, 11, 23, 0) }), true);
    expect(msg).toContain('DEL: Dallas, TX – 08/11/2026 11pm');
  });

  test('falls back to comment-scanned delivery schedule when late_del is absent', () => {
    const msg = buildLookupMessage(load({ late_del: null, comment: 'del appt 1400' }), true);
    expect(msg).toContain('DEL: Dallas, TX – Appt 1400');
  });

  test('includes zip codes when present', () => {
    const msg = buildLookupMessage(load({ origin_zip: '60601', dest_zip: '75201' }), true);
    expect(msg).toContain('PU: Chicago, IL 60601');
    expect(msg).toContain('DEL: Dallas, TX 75201');
  });

  test('includes commodity when detected from the comment', () => {
    const msg = buildLookupMessage(load({ comment: 'beer load' }), true);
    expect(msg).toContain('Commodity: Beer');
  });

  test('prefers the persisted commodity field over re-parsing the comment', () => {
    const msg = buildLookupMessage(load({ commodity: 'Custom commodity', comment: 'beer load' }), true);
    expect(msg).toContain('Commodity: Custom commodity');
  });

  test('includes weight when present and positive', () => {
    const msg = buildLookupMessage(load({ weight: '42000' }), true);
    expect(msg).toContain('Weight: 42,000 lbs');
  });

  test('omits weight when zero or unparseable', () => {
    const msg = buildLookupMessage(load({ weight: '0' }), true);
    expect(msg).not.toContain('Weight:');
  });

  test('includes temperature for reefer equipment when detected', () => {
    const msg = buildLookupMessage(load({ equipment: 'R', comment: 'temp 34-36' }), true);
    expect(msg).toContain('Temp: 34–36°F');
  });

  test('shows the rate when showRate is true and a rate exists', () => {
    const msg = buildLookupMessage(load({ target_pay: 1500 }), true);
    expect(msg).toContain('Rate: $1,500');
  });

  test('shows a rate-request prompt when showRate is false', () => {
    const msg = buildLookupMessage(load({ target_pay: 1500 }), false);
    expect(msg).not.toContain('Rate: $1,500');
    expect(msg).toContain('How much would you need for this?');
  });

  test('shows a rate-request prompt when there is no rate even if showRate is true', () => {
    const msg = buildLookupMessage(load({ target_pay: null }), true);
    expect(msg).toContain('How much would you need for this?');
  });
});
