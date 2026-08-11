const { matchInquiry, extractDate, mentionsExplicitReferenceNumber } = require('../../src/lib/matchingEngine');

const LOADS = [
  { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', early_pu: '2026-08-10 08:00:00' },
  { id: 2, load_number: '4522', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Miami', dest_state: 'FL', early_pu: '2026-08-11 08:00:00' },
  { id: 3, load_number: '4523', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Denver', dest_state: 'CO', early_pu: '2026-08-12 08:00:00' },
];

describe('matchInquiry', () => {
  test('matches on an exact load number mentioned anywhere in the email', () => {
    const result = matchInquiry('Hi, is load #4521 still available?', LOADS);
    expect(result.tier).toBe('load_number');
    expect(result.matchedLoad.id).toBe(1);
  });

  test('matches on a city+state pair only when BOTH origin and destination are confirmed', () => {
    const result = matchInquiry('Do you have the Dallas, TX to Chicago, IL load available?', LOADS);
    expect(result.tier).toBe('city_state');
    expect(result.matchedLoad.id).toBe(1);
  });

  test('falls back to the weaker "city" tier when only one end of the route is mentioned, even with a state', () => {
    // "Anything from Dallas, TX?" names only an origin -- there's no destination
    // in the text to confirm against, so this can't earn the higher-confidence
    // city_state tier even though a state is present.
    const result = matchInquiry('Do you have anything from Dallas, TX this week?', LOADS);
    expect(result.tier).toBe('city');
    expect(result.matchedLoad.id).toBe(1); // two Dallas,TX loads (1 and 3) -- tie-break picks earliest pickup
  });

  test('narrows a one-ended tie using a date mentioned in the email', () => {
    const result = matchInquiry('Looking for a Dallas, TX load picking up 8/12', LOADS);
    expect(result.tier).toBe('city');
    expect(result.matchedLoad.id).toBe(3);
  });

  test('does not confidently match on a coincidental one-ended overlap when the other end is a real, different place', () => {
    // Regression test for the real bug this fixes: a carrier replied quoting
    // a subject naming a load ("0084137") that doesn't exist in this user's
    // loads, with an origin ("Red Deer County, AB, Canada") that doesn't
    // belong to any load either -- but the destination "Billings, MT" happens
    // to match a completely different, unrelated load. That coincidental
    // overlap must not earn the high-confidence city_state tier. It also
    // cites a "PRO 632628" reference number that doesn't resolve to
    // anything, so it should be fully unmatched, not merely downgraded.
    const loadsWithBillingsDestination = [
      { id: 20, load_number: '9099', origin_city: 'Kennesaw', origin_state: 'GA', dest_city: 'Billings', dest_state: 'MT', early_pu: '2026-06-29 06:00:00' },
    ];
    const result = matchInquiry(
      'Re: 0084137 // Red Deer County, AB, Canada - Billings, MT 59106 // PRO 632628',
      loadsWithBillingsDestination
    );
    expect(result.tier).toBe('none');
    expect(result.matchedLoad).toBeNull();
  });

  test('does not confidently match a full-route overlap either when the email cites an unresolvable REF number', () => {
    // Regression test for the exact real-world case this fixes: the carrier's
    // email cites "REF 0084341" (a load that was never uploaded to this
    // user's system at all) but happens to name an origin/destination that
    // fully matches a DIFFERENT, unrelated (stale) load in the system. Even
    // though the route matches on both ends, the explicit unresolvable
    // reference number takes priority over the location match.
    const loadsWithSameLane = [
      { id: 30, load_number: '0078557', origin_city: 'Goodyear', origin_state: 'AZ', dest_city: 'Los Angeles', dest_state: 'CA', early_pu: '2026-06-29 15:00:00' },
    ];
    const result = matchInquiry('Goodyear, AZ Los Angeles, CA REF 0084341', loadsWithSameLane);
    expect(result.tier).toBe('none');
    expect(result.matchedLoad).toBeNull();
  });

  test('still matches by load number when the cited reference number does resolve to a real load', () => {
    const result = matchInquiry('Re: Ref 4521 - is this still available?', LOADS);
    expect(result.tier).toBe('load_number');
    expect(result.matchedLoad.id).toBe(1);
  });

  test('matches on city alone when state is not mentioned', () => {
    const result = matchInquiry('Anything out of Atlanta?', LOADS);
    expect(result.tier).toBe('city');
    expect(result.matchedLoad.id).toBe(2);
  });

  test('matches on state alone as the broadest tier', () => {
    const result = matchInquiry('Got anything in Texas this week?', LOADS);
    expect(result.tier).toBe('state');
    expect(result.matchedLoad.id).toBe(1); // two loads touch TX (1 and 3) -- tie-break picks earliest pickup
  });

  test('recognizes a full state name as well as its abbreviation', () => {
    const result = matchInquiry('Anything in Georgia?', LOADS);
    expect(result.tier).toBe('state');
    expect(result.matchedLoad.id).toBe(2);
  });

  test('returns no match when nothing in the email corresponds to any load', () => {
    const result = matchInquiry('Do you have any loads from Seattle to Portland?', LOADS);
    expect(result.tier).toBe('none');
    expect(result.matchedLoad).toBeNull();
  });

  test('returns no match when there are no loads to match against', () => {
    const result = matchInquiry('Is load #4521 available?', []);
    expect(result.tier).toBe('none');
    expect(result.matchedLoad).toBeNull();
  });

  test('load number match takes priority even when city/state text is also present', () => {
    const result = matchInquiry('Following up on load 4522 from Dallas, TX', LOADS);
    expect(result.tier).toBe('load_number');
    expect(result.matchedLoad.id).toBe(2);
  });

  test('does not treat common English words as state abbreviations when lowercase', () => {
    const loadsWithCollidingStates = [
      { id: 10, load_number: '9001', origin_city: 'Honolulu', origin_state: 'HI', dest_city: 'Portland', dest_state: 'OR', early_pu: '2026-08-10 08:00:00' },
      { id: 11, load_number: '9002', origin_city: 'Indianapolis', origin_state: 'IN', dest_city: 'Bangor', dest_state: 'ME', early_pu: '2026-08-11 08:00:00' },
    ];
    // "Hi," is a greeting (collides with Hawaii's abbreviation), "in" and "or" are
    // ordinary prepositions/conjunctions (collide with Indiana/Oregon) -- none of
    // this should match, since none of these abbreviations appear in uppercase and
    // none of the full state names ("Hawaii", "Oregon", "Indiana", "Maine") are mentioned.
    const result = matchInquiry('Hi, do you have anything in or around the area?', loadsWithCollidingStates);
    expect(result.tier).toBe('none');
    expect(result.matchedLoad).toBeNull();
  });

  test('still matches a state abbreviation that collides with a common word when written in caps', () => {
    const loadsWithCollidingStates = [
      { id: 10, load_number: '9001', origin_city: 'Honolulu', origin_state: 'HI', dest_city: 'Portland', dest_state: 'OR', early_pu: '2026-08-10 08:00:00' },
    ];
    const result = matchInquiry('Do you have anything in HI this week?', loadsWithCollidingStates);
    expect(result.tier).toBe('state');
    expect(result.matchedLoad.id).toBe(10);
  });
});

describe('mentionsExplicitReferenceNumber', () => {
  test.each([
    'REF 0084341',
    'Ref#0084341',
    'Ref: 0084341',
    'Reference 0084341',
    'Order #123456',
    'Load# 4521',
    'PRO 632628',
  ])('detects %s as an explicit reference number', (text) => {
    expect(mentionsExplicitReferenceNumber(text)).toBe(true);
  });

  test('returns false for ordinary text with no reference-style keyword', () => {
    expect(mentionsExplicitReferenceNumber('Do you have anything from Dallas, TX to Chicago, IL?')).toBe(false);
  });

  test('returns false for a bare number with no reference keyword', () => {
    expect(mentionsExplicitReferenceNumber('Call me at 5551234567')).toBe(false);
  });

  test('returns false for a short number even with a reference keyword (avoids false positives on small counts)', () => {
    expect(mentionsExplicitReferenceNumber('load #5')).toBe(false);
  });
});

describe('extractDate', () => {
  test('extracts an MM/DD date with no year', () => {
    expect(extractDate('picking up 8/12')).toEqual({ month: 8, day: 12, year: null });
  });

  test('extracts an MM/DD/YYYY date', () => {
    expect(extractDate('pickup on 8/12/2026')).toEqual({ month: 8, day: 12, year: 2026 });
  });

  test('returns null when no date is present', () => {
    expect(extractDate('no date mentioned here')).toBeNull();
  });
});
