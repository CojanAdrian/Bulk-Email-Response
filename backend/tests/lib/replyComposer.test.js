const { composeReply } = require('../../src/lib/replyComposer');

describe('composeReply', () => {
  test('renders a full reply when every field is present', () => {
    const load = {
      load_number: 'TEST-001',
      origin_city: 'Chicago',
      origin_state: 'IL',
      dest_city: 'Dallas',
      dest_state: 'TX',
      early_pu: '2026-08-10 08:00:00',
      target_pay: '1500.00',
    };
    const reply = composeReply(load);
    expect(reply).toContain('load #TEST-001 is still available');
    expect(reply).toContain('Chicago, IL -> Dallas, TX');
    expect(reply).toContain('Pickup: 2026-08-10 08:00:00');
    expect(reply).toContain('Rate: $1500.00');
    expect(reply).toContain("Let me know if you'd like to book it.");
  });

  test('omits the rate line when target_pay is null', () => {
    const load = {
      load_number: 'TEST-002',
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      early_pu: '2026-08-10 08:00:00',
      target_pay: null,
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('Rate:');
    expect(reply).not.toContain('null');
  });

  test('omits the pickup line when early_pu is null', () => {
    const load = {
      load_number: 'TEST-003',
      origin_city: 'Chicago', origin_state: 'IL',
      dest_city: 'Dallas', dest_state: 'TX',
      early_pu: null,
      target_pay: '1500.00',
    };
    const reply = composeReply(load);
    expect(reply).not.toContain('Pickup:');
    expect(reply).not.toContain('null');
  });

  test('renders origin/destination with just a city when state is missing', () => {
    const load = {
      load_number: 'TEST-004',
      origin_city: 'Chicago', origin_state: null,
      dest_city: 'Dallas', dest_state: null,
      early_pu: null,
      target_pay: null,
    };
    const reply = composeReply(load);
    expect(reply).toContain('Chicago -> Dallas');
    expect(reply).not.toContain('null');
  });

  test('renders a bare-minimum reply when only the load number is present', () => {
    const load = {
      load_number: 'TEST-005',
      origin_city: null, origin_state: null,
      dest_city: null, dest_state: null,
      early_pu: null,
      target_pay: null,
    };
    const reply = composeReply(load);
    expect(reply).toContain('load #TEST-005 is still available');
    expect(reply).not.toContain('->');
    expect(reply).not.toContain('Pickup:');
    expect(reply).not.toContain('Rate:');
    expect(reply).not.toContain('null');
    expect(reply).not.toContain('undefined');
  });
});
