require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

jest.mock('../src/lib/googleOAuth');
jest.mock('../src/lib/gmailClient');
const googleOAuth = require('../src/lib/googleOAuth');
const gmailClient = require('../src/lib/gmailClient');

describe('inquiries routes', () => {
  let pool;
  let app;
  let agent;
  let userId;
  let accountId;

  beforeAll(() => {
    pool = createTestPool();
    app = createApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [userResult] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = userResult.insertId;
    const [accountResult] = await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
      [userId, 'testuser@example.com', 'refresh-token']
    );
    accountId = accountResult.insertId;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/inquiries');
    expect(res.status).toBe(401);
  });

  test('lists only the current user\'s own inquiries, newest first', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Older inquiry', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm2', 'carrier2@example.com', 'Newer inquiry', '2026-08-02 08:00:00', 'load_number', 'matched')`,
      [userId, accountId]
    );

    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    const [otherAccount] = await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
      [otherUser.insertId, 'other@example.com', 'other-refresh']
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm3', 'someone@example.com', 'Someone elses inquiry', '2026-08-03 08:00:00', 'none', 'needs_review')`,
      [otherUser.insertId, otherAccount.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].subject).toBe('Newer inquiry');
    expect(res.body[1].subject).toBe('Older inquiry');
  });

  test('filters by reply_status when the query param is given', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status, reply_status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Auto-sent one', '2026-08-01 08:00:00', 'load_number', 'matched', 'auto_sent')`,
      [userId, accountId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status, reply_status)
       VALUES (?, ?, 'm2', 'carrier2@example.com', 'Needs review one', '2026-08-02 08:00:00', 'city_state', 'matched', 'pending_review')`,
      [userId, accountId]
    );

    const res = await agent.get('/api/inquiries?reply_status=pending_review');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subject).toBe('Needs review one');
  });

  test('includes the matched load\'s stops count, so the frontend can flag multi-stop loads', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, stops, user_id, status) VALUES ('L1', 'Dallas', 'TX', 'Chicago', 'IL', 2, ?, 'active')",
      [userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Multi-stop load inquiry', '2026-08-01 08:00:00', ?, 'load_number', 'matched')`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_stops).toBe(2);
  });

  test('includes the matched load\'s planning comment, so the frontend can detect a multi-pick/multi-drop mention', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, comment, user_id, status) VALUES ('L1', 'Dallas', 'TX', 'Chicago', 'IL', '2nd pickup in Fort Worth', ?, 'active')",
      [userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Multi-pick load inquiry', '2026-08-01 08:00:00', ?, 'load_number', 'matched')`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_comment).toBe('2nd pickup in Fort Worth');
  });

  test('matched_load_stops and matched_load_comment are null when there is no matched load', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Unmatched inquiry', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_stops).toBeNull();
    expect(res.body[0].matched_load_comment).toBeNull();
  });

  test('surfaces ref_mismatch, so the frontend can flag a possibly-wrong match', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, user_id, status) VALUES ('L1', 'Goodyear', 'AZ', 'Los Angeles', 'CA', ?, 'active')",
      [userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status, ref_mismatch)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Goodyear, AZ Los Angeles, CA REF 0084341', '2026-08-01 08:00:00', ?, 'city_state', 'matched', 1)`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].ref_mismatch).toBe(1);
  });

  test('includes the matched load\'s target_pay, include_rate, and extra_stops for the review queue\'s rate toggle and stop tag', async () => {
    const [loadResult] = await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, dest_city, dest_state, target_pay, include_rate, extra_stops, user_id, status) VALUES ('L1', 'Dallas', 'TX', 'Chicago', 'IL', 1500, 0, ?, ?, 'active')",
      [JSON.stringify([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]), userId]
    );
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load inquiry', '2026-08-01 08:00:00', ?, 'load_number', 'matched')`,
      [userId, accountId, loadResult.insertId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(Number(res.body[0].matched_load_target_pay)).toBe(1500);
    expect(Number(res.body[0].matched_load_include_rate)).toBe(0);
    expect(res.body[0].matched_load_extra_stops).toEqual([{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }]);
  });

  test('matched_load_target_pay, matched_load_include_rate, and matched_load_extra_stops are null when there is no matched load', async () => {
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, match_tier, status)
       VALUES (?, ?, 'm1', 'carrier@example.com', 'Unmatched inquiry', '2026-08-01 08:00:00', 'none', 'needs_review')`,
      [userId, accountId]
    );

    const res = await agent.get('/api/inquiries');
    expect(res.status).toBe(200);
    expect(res.body[0].matched_load_target_pay).toBeNull();
    expect(res.body[0].matched_load_include_rate).toBeNull();
    expect(res.body[0].matched_load_extra_stops).toBeNull();
  });

  describe('POST /:id/send', () => {
    let inquiryId;

    beforeEach(async () => {
      const [result] = await pool.query(
        `INSERT INTO email_inquiries
         (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status, reply_status, reply_body, gmail_thread_id, gmail_in_reply_to)
         VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load?', '2026-08-01 08:00:00', 1, 'city_state', 'matched', 'pending_review', 'Yes, load #4521 is still available.', 't1', '<abc@mail.gmail.com>')`,
        [userId, accountId]
      );
      inquiryId = result.insertId;
    });

    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post(`/api/inquiries/${inquiryId}/send`);
      expect(res.status).toBe(401);
    });

    test('sends the stored reply_body via Gmail and marks the inquiry sent', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`);
      expect(res.status).toBe(200);
      expect(res.body.reply_status).toBe('sent');
      expect(res.body.reply_sent_at).not.toBeNull();

      expect(gmailClient.sendReply).toHaveBeenCalledTimes(1);
      const sendArgs = gmailClient.sendReply.mock.calls[0][1];
      expect(sendArgs.to).toBe('carrier@example.com');
      expect(sendArgs.subject).toBe('Re: Dallas load?');
      expect(sendArgs.body).toBe('Yes, load #4521 is still available.');
      expect(sendArgs.threadId).toBe('t1');
      expect(sendArgs.inReplyToMessageId).toBe('<abc@mail.gmail.com>');
    });

    test('sends a caller-edited body instead of the stored draft when provided', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`).send({ body: 'An edited reply body.' });
      expect(res.status).toBe(200);
      expect(res.body.reply_body).toBe('An edited reply body.');

      const sendArgs = gmailClient.sendReply.mock.calls[0][1];
      expect(sendArgs.body).toBe('An edited reply body.');
    });

    test('returns 404 for an inquiry belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherAccount] = await pool.query(
        'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
        [otherUser.insertId, 'other@example.com', 'other-refresh']
      );
      const [otherInquiry] = await pool.query(
        `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, received_at, match_tier, status, reply_status, reply_body)
         VALUES (?, ?, 'm-other', NOW(), 'city_state', 'matched', 'pending_review', 'draft')`,
        [otherUser.insertId, otherAccount.insertId]
      );

      const res = await agent.post(`/api/inquiries/${otherInquiry.insertId}/send`);
      expect(res.status).toBe(404);
      expect(gmailClient.sendReply).not.toHaveBeenCalled();
    });

    test('returns 400 when the inquiry is not pending_review', async () => {
      await pool.query("UPDATE email_inquiries SET reply_status = 'auto_sent' WHERE id = ?", [inquiryId]);

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`);
      expect(res.status).toBe(400);
      expect(gmailClient.sendReply).not.toHaveBeenCalled();
    });

    // Regression coverage for the reported bug: replying through the review
    // queue left the original message sitting in the inbox marked unread.
    test('marks the original message read after sending the reply', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`);
      expect(res.status).toBe(200);
      expect(gmailClient.markMessageRead).toHaveBeenCalledWith('fresh-access-token', 'm1');
    });

    // Regression coverage for the reported bug: "sometimes the reply
    // message is empty." A blank/whitespace-only body -- whether it's an
    // edited draft or a load with nothing composed yet -- must never
    // actually go out to the carrier.
    test('returns 400 and does not send when the body is blank', async () => {
      await pool.query("UPDATE email_inquiries SET reply_body = NULL WHERE id = ?", [inquiryId]);

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`).send({ body: '   ' });
      expect(res.status).toBe(400);
      expect(gmailClient.sendReply).not.toHaveBeenCalled();
    });

    test('still returns success and sent status even if marking the message read fails', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });
      gmailClient.markMessageRead.mockRejectedValue(new Error('Gmail API error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await agent.post(`/api/inquiries/${inquiryId}/send`);
      consoleErrorSpy.mockRestore();

      expect(res.status).toBe(200);
      expect(res.body.reply_status).toBe('sent');
    });
  });

  describe('POST /:id/reject', () => {
    let inquiryId;

    beforeEach(async () => {
      const [result] = await pool.query(
        `INSERT INTO email_inquiries
         (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status, reply_status, reply_body)
         VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load?', '2026-08-01 08:00:00', 1, 'city_state', 'matched', 'pending_review', 'draft reply')`,
        [userId, accountId]
      );
      inquiryId = result.insertId;
    });

    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post(`/api/inquiries/${inquiryId}/reject`);
      expect(res.status).toBe(401);
    });

    test('marks the inquiry rejected without sending anything', async () => {
      const res = await agent.post(`/api/inquiries/${inquiryId}/reject`);
      expect(res.status).toBe(200);
      expect(res.body.reply_status).toBe('rejected');
      expect(gmailClient.sendReply).not.toHaveBeenCalled();
    });

    test('returns 404 for an inquiry belonging to a different user', async () => {
      const passwordHash = await bcrypt.hash('otherpw', 10);
      const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
      const [otherAccount] = await pool.query(
        'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
        [otherUser.insertId, 'other@example.com', 'other-refresh']
      );
      const [otherInquiry] = await pool.query(
        `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, received_at, match_tier, status, reply_status)
         VALUES (?, ?, 'm-other', NOW(), 'city_state', 'matched', 'pending_review')`,
        [otherUser.insertId, otherAccount.insertId]
      );

      const res = await agent.post(`/api/inquiries/${otherInquiry.insertId}/reject`);
      expect(res.status).toBe(404);
    });

    test('returns 400 when the inquiry is not pending_review', async () => {
      await pool.query("UPDATE email_inquiries SET reply_status = 'rejected' WHERE id = ?", [inquiryId]);

      const res = await agent.post(`/api/inquiries/${inquiryId}/reject`);
      expect(res.status).toBe(400);
    });
  });

  describe('wsHub emits', () => {
    let hubApp;
    let hubAgent;
    let wsHub;
    let inquiryId;

    beforeEach(async () => {
      wsHub = { emitToUser: jest.fn() };
      hubApp = createApp(pool, wsHub);
      hubAgent = request.agent(hubApp);
      await hubAgent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });

      const [result] = await pool.query(
        `INSERT INTO email_inquiries
         (user_id, email_account_id, gmail_message_id, from_address, subject, received_at, matched_load_id, match_tier, status, reply_status, reply_body, gmail_thread_id, gmail_in_reply_to)
         VALUES (?, ?, 'm1', 'carrier@example.com', 'Dallas load?', '2026-08-01 08:00:00', 1, 'city_state', 'matched', 'pending_review', 'Yes, load #4521 is still available.', 't1', '<abc@mail.gmail.com>')`,
        [userId, accountId]
      );
      inquiryId = result.insertId;
    });

    test('send emits inquiry:updated with the updated row', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      await hubAgent.post(`/api/inquiries/${inquiryId}/send`);

      expect(wsHub.emitToUser).toHaveBeenCalledTimes(1);
      const [userIdArg, event, payload] = wsHub.emitToUser.mock.calls[0];
      expect(userIdArg).toBe(userId);
      expect(event).toBe('inquiry:updated');
      expect(payload.id).toBe(inquiryId);
      expect(payload.reply_status).toBe('sent');
    });

    test('reject emits inquiry:updated with the updated row', async () => {
      await hubAgent.post(`/api/inquiries/${inquiryId}/reject`);

      expect(wsHub.emitToUser).toHaveBeenCalledTimes(1);
      const [userIdArg, event, payload] = wsHub.emitToUser.mock.calls[0];
      expect(userIdArg).toBe(userId);
      expect(event).toBe('inquiry:updated');
      expect(payload.id).toBe(inquiryId);
      expect(payload.reply_status).toBe('rejected');
    });
  });
});
