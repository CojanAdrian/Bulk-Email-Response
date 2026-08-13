import { describe, test, expect } from 'vitest';
import {
  DAT_HEADERS,
  orderCompare,
  parseWeightNum,
  formatDateOnly,
  buildPUSched,
  buildDELSched,
  computeLength,
  buildComment,
  detectCrossPosts,
  buildDatRow,
  processLoadsForExport,
  countAnomalies,
  buildDatCsv,
  buildDatExportFilename,
} from '../../src/lib/datExport';

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
    raw_equipment: 'V',
    weight: '42000',
    target_pay: 1500,
    early_pu: iso(2026, 8, 10, 8, 0),
    late_pu: iso(2026, 8, 10, 8, 0),
    late_del: null,
    stops: 0,
    comment: '',
    ...overrides,
  };
}

describe('orderCompare', () => {
  test('compares numerically when both sides parse as numbers', () => {
    expect(orderCompare('9', '10')).toBeLessThan(0);
    expect(orderCompare('10', '9')).toBeGreaterThan(0);
  });

  test('falls back to string comparison when not purely numeric', () => {
    expect(orderCompare('ABC', 'ABD')).toBeLessThan(0);
  });

  test('strips non-digit characters before comparing numerically', () => {
    expect(orderCompare('L-9', 'L-10')).toBeLessThan(0);
  });
});

describe('parseWeightNum', () => {
  test('strips commas and "lbs" suffix', () => {
    expect(parseWeightNum('42,000 lbs')).toBe(42000);
  });

  test('rounds a decimal weight', () => {
    expect(parseWeightNum('12845.6')).toBe(12846);
  });

  test('returns null for an empty or non-numeric string', () => {
    expect(parseWeightNum('')).toBeNull();
    expect(parseWeightNum('N/A')).toBeNull();
  });
});

describe('formatDateOnly', () => {
  test('formats an ISO datetime as MM/DD/YYYY', () => {
    const iso = new Date(2026, 7, 10, 8, 0, 0).toISOString();
    expect(formatDateOnly(iso)).toBe('08/10/2026');
  });

  test('returns an empty string for null/invalid input', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly('not-a-date')).toBe('');
  });
});

describe('buildPUSched', () => {
  test('renders "appt" when early and late are identical', () => {
    const iso = new Date(2026, 7, 10, 8, 0, 0).toISOString();
    expect(buildPUSched(iso, iso)).toBe('08/10/2026 8am appt');
  });

  test('renders a same-day FCFS range when times differ but the date matches', () => {
    const early = new Date(2026, 7, 10, 7, 0, 0).toISOString();
    const late = new Date(2026, 7, 10, 15, 0, 0).toISOString();
    expect(buildPUSched(early, late)).toBe('08/10/2026 7am - 3pm FCFS');
  });

  test('renders a cross-day FCFS range when dates differ', () => {
    const early = new Date(2026, 7, 10, 7, 0, 0).toISOString();
    const late = new Date(2026, 7, 12, 15, 0, 0).toISOString();
    expect(buildPUSched(early, late)).toBe('08/10/2026 7am – 08/12/2026 3pm FCFS');
  });

  test('falls back to whichever side is present when the other is missing', () => {
    const iso = new Date(2026, 7, 10, 8, 0, 0).toISOString();
    expect(buildPUSched(iso, null)).toBe('08/10/2026 8am appt');
    expect(buildPUSched(null, iso)).toBe('08/10/2026 8am appt');
  });

  test('returns an empty string when both sides are missing', () => {
    expect(buildPUSched(null, null)).toBe('');
  });

  test('formats non-zero minutes', () => {
    const early = new Date(2026, 7, 10, 7, 30, 0).toISOString();
    expect(buildPUSched(early, early)).toBe('08/10/2026 7:30am appt');
  });
});

describe('buildDELSched', () => {
  test('renders "appt" when early and late are identical', () => {
    const iso = new Date(2026, 7, 10, 23, 0, 0).toISOString();
    expect(buildDELSched(iso, iso)).toBe('08/10/2026 11pm appt');
  });

  test('renders a same-day FCFS range when times differ but the date matches', () => {
    const early = new Date(2026, 7, 10, 9, 0, 0).toISOString();
    const late = new Date(2026, 7, 10, 17, 0, 0).toISOString();
    expect(buildDELSched(early, late)).toBe('08/10/2026 9am - 5pm FCFS');
  });

  test('falls back to whichever side is present when the other is missing', () => {
    const iso = new Date(2026, 7, 10, 23, 0, 0).toISOString();
    expect(buildDELSched(iso, null)).toBe('08/10/2026 11pm appt');
    expect(buildDELSched(null, iso)).toBe('08/10/2026 11pm appt');
  });

  test('returns an empty string when both sides are missing', () => {
    expect(buildDELSched(null, null)).toBe('');
  });
});

describe('computeLength', () => {
  test('straight-box equipment (SB/BR/BZ) is always 26ft regardless of comment', () => {
    expect(computeLength('SB', '')).toBe(26);
    expect(computeLength('BR', '48ft van')).toBe(26);
  });

  test('reads an explicit length from the comment when present and plausible', () => {
    expect(computeLength('V', 'need a 28ft van for this')).toBe(28);
  });

  test('ignores an out-of-range explicit length and falls back to the default', () => {
    expect(computeLength('V', 'need a 15ft van for this')).toBe(53);
  });

  test('defaults flatbed/open-deck equipment to 48ft with no comment match', () => {
    expect(computeLength('FT', '')).toBe(48);
    expect(computeLength('CN', 'no length mentioned')).toBe(48);
  });

  test('defaults van/reefer/everything else to 53ft with no comment match', () => {
    expect(computeLength('V', '')).toBe(53);
    expect(computeLength('R', '')).toBe(53);
  });
});

describe('buildComment', () => {
  test('detects 24hr drop-both-sides language and prioritizes it over generic drop trailer', () => {
    expect(buildComment('24hr drop shipper and receiver', '')).toBe('24HR DROP TRAILER - SHIPPER & RECEIVER');
    expect(buildComment('drop at both sides', '')).toBe('24HR DROP TRAILER - SHIPPER & RECEIVER');
  });

  test('detects generic drop trailer language', () => {
    expect(buildComment('drop trailer at shipper', '')).toBe('DROP TRAILER');
    expect(buildComment('hook and drop', '')).toBe('DROP TRAILER');
  });

  test('appends the contact line after any drop label', () => {
    expect(buildComment('drop trailer', 'Call John 555-1234')).toBe('DROP TRAILER | Call John 555-1234');
  });

  test('returns just the contact line when there is no drop-trailer language', () => {
    expect(buildComment('no special instructions', 'Call John 555-1234')).toBe('Call John 555-1234');
  });

  test('returns an empty string when there is neither a drop label nor a contact line', () => {
    expect(buildComment('no special instructions', '')).toBe('');
  });
});

describe('detectCrossPosts', () => {
  test('detects CN via the standalone code or "conestoga"', () => {
    expect(detectCrossPosts('needs CN').codes).toContain('CN');
    expect(detectCrossPosts('conestoga preferred').codes).toContain('CN');
  });

  test('detects SD, RGN (or "removable gooseneck"), SB, RZ as standalone codes', () => {
    expect(detectCrossPosts('SD ok').codes).toContain('SD');
    expect(detectCrossPosts('RGN needed').codes).toContain('RGN');
    expect(detectCrossPosts('removable gooseneck required').codes).toContain('RGN');
    expect(detectCrossPosts('SB works').codes).toContain('SB');
    expect(detectCrossPosts('RZ ok').codes).toContain('RZ');
  });

  test('detects F only when phrased as "f works" or "f ok"', () => {
    expect(detectCrossPosts('f works').codes).toContain('F');
    expect(detectCrossPosts('f ok').codes).toContain('F');
    expect(detectCrossPosts('flatbed needed')).not.toEqual(expect.objectContaining({ codes: expect.arrayContaining(['F']) }));
  });

  test('FT triggers only when comma-listed or paired with CN/SD/RGN, not as a bare measurement', () => {
    expect(detectCrossPosts('CN, FT ok').codes).toContain('FT');
    expect(detectCrossPosts('need FT, or van').codes).toContain('FT');
    expect(detectCrossPosts('48ft van needed').codes).not.toContain('FT');
  });

  test('flags an ambiguous standalone "FT" mention that is not paired or comma-listed', () => {
    const result = detectCrossPosts('maybe FT works for this');
    expect(result.codes).not.toContain('FT');
    expect(result.ambiguousFT).toBe(true);
  });

  test('does not flag FT ambiguity when it is a plain length measurement', () => {
    const result = detectCrossPosts('53ft trailer needed');
    expect(result.ambiguousFT).toBe(false);
  });

  test('R triggers on a standalone "r" mention', () => {
    expect(detectCrossPosts('r ok for this').codes).toContain('R');
  });

  test('R does not trigger when the comment says the reefer is off', () => {
    expect(detectCrossPosts('reefer off, dry only').codes).not.toContain('R');
    expect(detectCrossPosts('r off').codes).not.toContain('R');
  });

  test('"V or R" / "V/R" phrasing triggers R and raises a manual-verification flag', () => {
    const result = detectCrossPosts('v or r ok');
    expect(result.codes).toContain('R');
    expect(result.vOrR).toBe(true);

    const result2 = detectCrossPosts('v/r accepted');
    expect(result2.codes).toContain('R');
    expect(result2.vOrR).toBe(true);
  });

  test('deduplicates codes triggered by multiple phrases in the same comment', () => {
    const result = detectCrossPosts('CN or conestoga preferred');
    expect(result.codes.filter((c) => c === 'CN')).toHaveLength(1);
  });

  test('returns no codes and no flags for an unremarkable comment', () => {
    const result = detectCrossPosts('standard dry van load');
    expect(result.codes).toEqual([]);
    expect(result.ambiguousFT).toBe(false);
    expect(result.vOrR).toBe(false);
  });
});

describe('buildDatRow', () => {
  const baseRow = {
    order: '1001', origCity: 'Chicago', origState: 'IL', destCity: 'Dallas', destState: 'TX',
    equipment: 'V', weightNum: 42000, targetPayNum: 1500, pickupEarliest: '08/10/2026', pickupLatest: '08/10/2026',
    rawComment: '', comment: '', isTeam: false, includeRate: true,
  };

  test('maps every DAT_HEADERS column for a straightforward van load', () => {
    const row = buildDatRow(baseRow, 'phone');
    expect(Object.keys(row)).toEqual(DAT_HEADERS);
    expect(row['Pickup Earliest*']).toBe('08/10/2026');
    expect(row['Length (ft)*']).toBe(53);
    expect(row['Weight (lbs)*']).toBe(42000);
    expect(row['Equipment*']).toBe('V');
    expect(row['DAT Loadboard Rate']).toBe(1500);
    expect(row['Contact Method*']).toBe('primary phone');
    expect(row['Origin City*']).toBe('Chicago');
    expect(row['Origin Postal Code']).toBe('');
    expect(row['Destination Postal Code']).toBe('');
    expect(row['Reference ID']).toBe('1001');
  });

  test('straight-box equipment always uses email contact method, overriding the global choice', () => {
    const row = buildDatRow({ ...baseRow, equipment: 'SB' }, 'phone');
    expect(row['Contact Method*']).toBe('email');
  });

  test('uses email contact method when the global choice is email', () => {
    const row = buildDatRow(baseRow, 'email');
    expect(row['Contact Method*']).toBe('email');
  });

  test('omits the rate when includeRate is false', () => {
    const row = buildDatRow({ ...baseRow, includeRate: false }, 'phone');
    expect(row['DAT Loadboard Rate']).toBe('');
  });

  test('omits the rate when the target pay is zero or null even if includeRate is true', () => {
    expect(buildDatRow({ ...baseRow, targetPayNum: 0 }, 'phone')['DAT Loadboard Rate']).toBe('');
    expect(buildDatRow({ ...baseRow, targetPayNum: null }, 'phone')['DAT Loadboard Rate']).toBe('');
  });

  test('prefixes the comment with TEAM for team loads', () => {
    const row = buildDatRow({ ...baseRow, isTeam: true, comment: 'DROP TRAILER' }, 'phone');
    expect(row.Comment).toBe('TEAM | DROP TRAILER');
  });

  test('team loads with no other comment just say TEAM', () => {
    const row = buildDatRow({ ...baseRow, isTeam: true, comment: '' }, 'phone');
    expect(row.Comment).toBe('TEAM');
  });

  test('leaves Weight blank when weightNum is null', () => {
    const row = buildDatRow({ ...baseRow, weightNum: null }, 'phone');
    expect(row['Weight (lbs)*']).toBe('');
  });
});

describe('processLoadsForExport', () => {
  test('excludes loads with blank equipment and flags them', () => {
    const { finalRows, anomalies } = processLoadsForExport([load({ equipment: '' })], {});
    expect(finalRows).toHaveLength(0);
    expect(anomalies.blankEquipment).toEqual([{ order: '1001' }]);
  });

  test('flags same-city loads but still includes them in the export', () => {
    const { finalRows, anomalies } = processLoadsForExport(
      [load({ origin_city: 'Chicago', dest_city: 'chicago' })],
      {}
    );
    expect(finalRows).toHaveLength(1);
    expect(anomalies.sameCity).toHaveLength(1);
  });

  test('flags equipment that is not a known EQUIPMENT_MAP value', () => {
    const { anomalies } = processLoadsForExport([load({ equipment: 'ZZZ' })], {});
    expect(anomalies.unknownEquipment).toEqual([{ order: '1001', rawCode: 'ZZZ' }]);
  });

  test('flags a rate over $10,000 and a $0 rate as rate anomalies', () => {
    const { anomalies } = processLoadsForExport(
      [load({ id: 1, load_number: 'A', target_pay: 25000 }), load({ id: 2, load_number: 'B', target_pay: 0 })],
      {}
    );
    expect(anomalies.rateAnomalies).toHaveLength(2);
  });

  test('substitutes cities from a "post as X, ST to Y, ST" comment override', () => {
    const { finalRows } = processLoadsForExport(
      [load({ comment: 'post as Springfield, IL to Peoria, IL' })],
      {}
    );
    expect(finalRows[0].origCity).toBe('Springfield');
    expect(finalRows[0].origState).toBe('IL');
    expect(finalRows[0].destCity).toBe('Peoria');
  });

  test('flags a "don\'t post actual cities" comment for manual handling', () => {
    const { anomalies } = processLoadsForExport([load({ comment: "don't post actual cities" })], {});
    expect(anomalies.cityOverrideFlags).toHaveLength(1);
  });

  test('flags Canadian province origin/destination', () => {
    const { anomalies } = processLoadsForExport([load({ dest_state: 'ON' })], {});
    expect(anomalies.locationFlags).toHaveLength(1);
  });

  test('flags the Birmingham/MO atypical combination on either end', () => {
    const { anomalies } = processLoadsForExport(
      [load({ id: 1, load_number: 'A', origin_city: 'Birmingham', origin_state: 'MO' })],
      {}
    );
    expect(anomalies.locationFlags).toHaveLength(1);
  });

  test('expands a load into an additional cross-posted row and flags it', () => {
    const { finalRows, anomalies } = processLoadsForExport([load({ comment: 'CN needed' })], {});
    expect(finalRows).toHaveLength(2);
    expect(finalRows.map((r) => r.equipment).sort()).toEqual(['CN', 'V']);
    expect(anomalies.crossPostFlags).toHaveLength(1);
  });

  test('does not duplicate a cross-post that matches the load\'s own equipment', () => {
    const { finalRows } = processLoadsForExport([load({ equipment: 'CN', raw_equipment: 'CN', comment: 'CN needed' })], {});
    expect(finalRows).toHaveLength(1);
  });

  test('dedups two loads on the same lane/equipment/pickup date, keeping the higher weight', () => {
    const { finalRows, anomalies } = processLoadsForExport(
      [
        load({ id: 1, load_number: 'LIGHT', weight: '10000' }),
        load({ id: 2, load_number: 'HEAVY', weight: '40000' }),
      ],
      {}
    );
    expect(finalRows).toHaveLength(1);
    expect(finalRows[0].order).toBe('HEAVY');
    expect(anomalies.dedupDecisions).toEqual([
      { winner: 'HEAVY', dropped: 'LIGHT', route: 'Chicago -> Dallas', equipment: 'V', reason: 'Higher weight' },
    ]);
  });

  test('breaks a weight tie by higher target pay', () => {
    const { finalRows } = processLoadsForExport(
      [
        load({ id: 1, load_number: 'LOWPAY', weight: '40000', target_pay: 1000 }),
        load({ id: 2, load_number: 'HIGHPAY', weight: '40000', target_pay: 2000 }),
      ],
      {}
    );
    expect(finalRows[0].order).toBe('HIGHPAY');
  });

  test('breaks a weight+pay tie by earlier order number', () => {
    const { finalRows } = processLoadsForExport(
      [
        load({ id: 1, load_number: '2002', weight: '40000', target_pay: 1000 }),
        load({ id: 2, load_number: '2001', weight: '40000', target_pay: 1000 }),
      ],
      {}
    );
    expect(finalRows[0].order).toBe('2001');
  });

  test('does not dedup the same lane/equipment on a different pickup date', () => {
    const { finalRows } = processLoadsForExport(
      [
        load({ id: 1, load_number: 'A', early_pu: iso(2026, 8, 10, 8, 0) }),
        load({ id: 2, load_number: 'B', early_pu: iso(2026, 8, 11, 8, 0) }),
      ],
      {}
    );
    expect(finalRows).toHaveLength(2);
  });

  test('detects a team load from raw_equipment (POTM) even though equipment is already mapped to PO', () => {
    const { finalRows } = processLoadsForExport([load({ equipment: 'PO', raw_equipment: 'POTM' })], {});
    expect(finalRows[0].isTeam).toBe(true);
  });

  test('includes the rate when the load\'s include_rate switch is on', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500, include_rate: 1 })], {});
    expect(exportRows[0]['DAT Loadboard Rate']).toBe(1500);
  });

  test('omits the rate when the load\'s include_rate switch is off', () => {
    const { exportRows } = processLoadsForExport([load({ target_pay: 1500, include_rate: 0 })], {});
    expect(exportRows[0]['DAT Loadboard Rate']).toBe('');
  });

  test('appends the comment-contact line to every exported comment', () => {
    const { exportRows } = processLoadsForExport([load({ comment: '' })], { commentContact: 'Call dispatch 555-1234' });
    expect(exportRows[0].Comment).toBe('Call dispatch 555-1234');
  });
});

describe('countAnomalies', () => {
  test('sums every anomaly category', () => {
    const { anomalies } = processLoadsForExport(
      [load({ id: 1, load_number: 'A', equipment: '' }), load({ id: 2, load_number: 'B', target_pay: 0 })],
      {}
    );
    expect(countAnomalies(anomalies)).toBe(2);
  });
});

describe('buildDatCsv', () => {
  test('produces a CSV with the DAT_HEADERS as the header row', () => {
    const { exportRows } = processLoadsForExport([load()], {});
    const csv = buildDatCsv(exportRows);
    expect(csv.split('\r\n')[0]).toBe(DAT_HEADERS.map((h) => (h.includes(',') ? `"${h}"` : h)).join(','));
    expect(csv).toContain('Chicago');
    expect(csv).toContain('Dallas');
  });
});

describe('buildDatExportFilename', () => {
  test('formats a date as DAT_Bulk_Upload_YYYY-MM-DD.csv', () => {
    expect(buildDatExportFilename(new Date(2026, 7, 9))).toBe('DAT_Bulk_Upload_2026-08-09.csv');
  });
});
