const { composeReply } = require('../../src/lib/replyComposer');

describe('composeReply', () => {
  test('renders the full PU/DEL/Weight/Rate format when every field is present', () => {
    const load = {
      load_number: 'TEST-001',
      origin_city: 'Saint Louis', origin_state: 'MO',
      dest_city: 'Sheboygan', dest_state: 'WI',
      early_pu: '2026-08-11 18:00:00',
      late_del: '2026-08-12 08:00:00',
      weight: '43,500 lbs',
      target_pay: '1440.00',
    };
    const reply = composeReply(load);
    expect(reply).toBe(
      'PU: SAINT LOUIS, MO – 08/11/2026 6pm\n' +
      'DEL: SHEBOYGAN, WI – 08/12/2026 8am\n' +
      'Weight: 43,500 lbs\n' +
      'Rate: $1,440'
    );
  });

  test('formats a non-zero-minute time with the minutes included', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      early_pu: '2026-08-10 14:30:00',
    };
    const reply = composeReply(load);
    expect(reply).toContain('PU: CHICAGO, IL – 08/10/2026 2:30pm');
  });

  test('omits the PU line entirely when there is no origin city', () => {
    const load = {
      origin_city: null, origin_state: null,
      dest_city: 'Dallas', dest_state: 'TX',
      late_del: '2026-08-10 08:00:00',
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('PU:');
  });

  test('omits the DEL line entirely when there is no destination city', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: null, dest_state: null,
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('DEL:');
  });

  test('shows PU/DEL without a date when the load has no pickup/delivery time', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      early_pu: null,
      late_del: null,
    };
    const reply = composeReply(load);
    expect(reply).toContain('PU: CHICAGO, IL');
    expect(reply).not.toContain('PU: CHICAGO, IL –');
    expect(reply).toContain('DEL: DALLAS, TX');
    expect(reply).not.toContain('DEL: DALLAS, TX –');
  });

  test('omits the Weight line when weight is missing', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      weight: null,
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('Weight:');
  });

  test('omits the Rate line when target_pay is null', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      target_pay: null,
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('Rate:');
  });

  test('formats the rate with a thousands separator and no trailing cents when whole', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      target_pay: '5900.00',
    };
    const reply = composeReply(load);
    expect(reply).toContain('Rate: $5,900');
  });

  test('keeps cents in the rate when the amount is not a whole number', () => {
    const load = {
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      target_pay: '1440.50',
    };
    const reply = composeReply(load);
    expect(reply).toContain('Rate: $1,440.5');
  });

  test('never renders the literal string "null" or "undefined" anywhere in the reply', () => {
    const load = {
      load_number: 'TEST-005',
      origin_city: null, origin_state: null,
      dest_city: null, dest_state: null,
      early_pu: null, late_del: null,
      weight: null, target_pay: null,
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('null');
    expect(reply).not.toContain('undefined');
  });
});
