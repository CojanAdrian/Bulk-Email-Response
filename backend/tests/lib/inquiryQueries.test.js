const { attachLiveReplyBody } = require('../../src/lib/inquiryQueries');

describe('attachLiveReplyBody', () => {
  test('sets live_reply_body to null when there is no matched load', () => {
    const row = { id: 1, matched_load_id: null, reply_body: null };
    expect(attachLiveReplyBody(row).live_reply_body).toBeNull();
  });

  // Regression coverage: reply_body is a snapshot taken when the inquiry
  // first arrived, before the load may have had PU/DEL times or extra
  // stops filled in. live_reply_body must be recomposed from the load's
  // CURRENT data, not the stale snapshot.
  test('recomposes the reply from the matched load\'s current data, ignoring a stale reply_body snapshot', () => {
    const row = {
      id: 1,
      matched_load_id: 5,
      reply_body: null, // stale snapshot: load had nothing filled in yet when the inquiry arrived
      matched_load_origin_city: 'Dallas',
      matched_load_origin_state: 'TX',
      matched_load_dest_city: 'Chicago',
      matched_load_dest_state: 'IL',
      matched_load_early_pu: '2026-08-10 08:00:00',
      matched_load_late_pu: '2026-08-10 08:00:00',
      matched_load_early_del: null,
      matched_load_late_del: null,
      matched_load_weight: null,
      matched_load_target_pay: null,
      matched_load_include_rate: 1,
      matched_load_extra_stops: null,
      matched_load_custom_reply_body: null,
    };
    const result = attachLiveReplyBody(row);
    expect(result.live_reply_body).toBe('PU: DALLAS, TX – 08/10/2026 8am appt\nDEL: CHICAGO, IL');
  });

  test('includes extra stops added to the load after the inquiry first arrived', () => {
    const row = {
      id: 1,
      matched_load_id: 5,
      reply_body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL', // stale: no extra stop yet
      matched_load_origin_city: 'Dallas',
      matched_load_origin_state: 'TX',
      matched_load_dest_city: 'Chicago',
      matched_load_dest_state: 'IL',
      matched_load_early_pu: null,
      matched_load_late_pu: null,
      matched_load_early_del: null,
      matched_load_late_del: null,
      matched_load_weight: null,
      matched_load_target_pay: null,
      matched_load_include_rate: 1,
      matched_load_extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      matched_load_custom_reply_body: null,
    };
    const result = attachLiveReplyBody(row);
    expect(result.live_reply_body).toContain('2nd PU: FORT WORTH, TX');
  });

  test('prefers the load\'s custom_reply_body over a recomposed reply', () => {
    const row = {
      id: 1,
      matched_load_id: 5,
      reply_body: null,
      matched_load_origin_city: 'Dallas',
      matched_load_origin_state: 'TX',
      matched_load_dest_city: 'Chicago',
      matched_load_dest_state: 'IL',
      matched_load_custom_reply_body: 'Custom multi-drop text',
    };
    const result = attachLiveReplyBody(row);
    expect(result.live_reply_body).toBe('Custom multi-drop text');
  });

  test('is null when the matched load still has nothing to compose a reply from', () => {
    const row = { id: 1, matched_load_id: 5, reply_body: null, matched_load_origin_city: null, matched_load_dest_city: null };
    expect(attachLiveReplyBody(row).live_reply_body).toBeNull();
  });
});
