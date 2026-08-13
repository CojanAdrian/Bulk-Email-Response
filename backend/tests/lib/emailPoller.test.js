require('dotenv').config();
jest.mock('../../src/lib/googleOAuth');
jest.mock('../../src/lib/gmailClient');
jest.mock('../../src/lib/matchingEngine');

const googleOAuth = require('../../src/lib/googleOAuth');
const gmailClient = require('../../src/lib/gmailClient');
const { extractEmailAddresses: realExtractEmailAddresses } = jest.requireActual('../../src/lib/gmailClient');
const matchingEngine = require('../../src/lib/matchingEngine');
const bcrypt = require('bcrypt');
const { createTestPool, resetTables } = require('../setupTestDb');
const { pollAccount, pollAllAccounts } = require('../../src/lib/emailPoller');

describe('emailPoller', () => {
  let pool;
  let userId;
  let accountId;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    gmailClient.extractEmailAddresses.mockImplementation(realExtractEmailAddresses);
    gmailClient.threadHasSentMessage.mockResolvedValue(false);
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [userResult] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = userResult.insertId;
    // Seeded with a past last_polled_at (already through its first poll --
    // the dedicated "first poll" tests below cover the null case) and
    // auto_send_enabled = 1 (the dedicated "auto-send gating" tests below
    // cover the disabled case) so the rest of this file's tests exercise
    // the matching/sending pipeline itself, not these two gates.
    const [accountResult] = await pool.query(
      "INSERT INTO email_accounts (user_id, gmail_address, refresh_token, last_polled_at, auto_send_enabled) VALUES (?, ?, ?, '2020-01-01 00:00:00', 1)",
      [userId, 'testuser@example.com', 'refresh-token-abc']
    );
    accountId = accountResult.insertId;
    await pool.query(
      "INSERT INTO loads (load_number, origin_city, origin_state, user_id, status) VALUES ('4521', 'Dallas', 'TX', ?, 'active')",
      [userId]
    );
  });

  test('pollAccount fetches new messages, matches them, and inserts inquiries', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1',
      from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Load 4521',
      body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1 }, tier: 'load_number' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries).toHaveLength(1);
    expect(inquiries[0].gmail_message_id).toBe('m1');
    expect(inquiries[0].matched_load_id).toBe(1);
    expect(inquiries[0].status).toBe('matched');
  });

  test('stores ref_mismatch = 1 when the matcher flags an unresolvable cited reference number', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Goodyear, AZ Los Angeles, CA REF 0084341', body: 'Is this still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'city_state', refMismatch: true });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].ref_mismatch).toBe(1);
  });

  test('stores ref_mismatch = 0 for an ordinary match with no cited reference number', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Load 4521', body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number', refMismatch: false });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].ref_mismatch).toBe(0);
  });

  test('uses the load\'s custom_reply_body verbatim instead of the auto-composed reply when set', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Load 4521', body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = {
      id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
      custom_reply_body: 'PU: DALLAS, TX\n2nd PU: FORT WORTH, TX\nDEL: CHICAGO, IL\nRate: $1,500',
    };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'load_number', refMismatch: false });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_body).toBe('PU: DALLAS, TX\n2nd PU: FORT WORTH, TX\nDEL: CHICAGO, IL\nRate: $1,500');
  });

  test('uses custom_reply_body even for a low-confidence (city) tier match, unlike the auto-composed reply', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Dallas load?', body: 'Anything from Dallas?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', custom_reply_body: 'Custom multi-drop text' };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'city', refMismatch: false });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_body).toBe('Custom multi-drop text');
  });

  test('auto-sends a reply and marks it auto_sent for a confident (load_number) match', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1',
      threadId: 't1',
      messageIdHeader: '<abc123@mail.gmail.com>',
      from: 'carrier@example.com', to: 'testuser@example.com',
      subject: 'Load 4521',
      body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', early_pu: '2026-08-10 08:00:00', target_pay: '1500.00' };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'load_number' });
    gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.sendReply).toHaveBeenCalledTimes(1);
    const sendArgs = gmailClient.sendReply.mock.calls[0][1];
    expect(sendArgs.to).toBe('carrier@example.com');
    expect(sendArgs.subject).toBe('Re: Load 4521');
    expect(sendArgs.threadId).toBe('t1');
    expect(sendArgs.inReplyToMessageId).toBe('<abc123@mail.gmail.com>');
    expect(sendArgs.body).toContain('PU: DALLAS, TX – 08/10/2026 8am');

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_status).toBe('auto_sent');
    expect(inquiries[0].reply_body).toContain('PU: DALLAS, TX – 08/10/2026 8am');
    expect(inquiries[0].reply_sent_at).not.toBeNull();
  });

  // Regression coverage for the reported bug: "sometimes the reply message
  // is empty." A load_number match against a load with no PU/DEL/weight/
  // rate data yet (e.g. just added via the quick-entry Add Load form) has
  // nothing to auto-send -- it must fall back to pending_review instead of
  // emailing the carrier a blank reply.
  test('falls back to pending_review instead of auto-sending a blank reply when the matched load has no data yet', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.sendReply).not.toHaveBeenCalled();
    expect(gmailClient.markMessageRead).not.toHaveBeenCalled();
    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_status).toBe('pending_review');
    expect(inquiries[0].reply_body).toBeNull();
  });

  // Regression coverage for the reported bug: an auto-sent reply left the
  // original message sitting in the inbox marked unread.
  test('marks the original message read after an auto-sent reply', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });
    gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.markMessageRead).toHaveBeenCalledWith('fresh-access-token', 'm1');
  });

  test('does not mark the message read when the auto-send itself fails', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });
    gmailClient.sendReply.mockRejectedValue(new Error('Gmail API rate limited'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);
    consoleErrorSpy.mockRestore();

    expect(gmailClient.markMessageRead).not.toHaveBeenCalled();
  });

  test('does not add "Re:" twice when the original subject already has it', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Re: Load 4521', body: 'Still available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({
      matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number',
    });
    gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const sendArgs = gmailClient.sendReply.mock.calls[0][1];
    expect(sendArgs.subject).toBe('Re: Load 4521');
  });

  test('queues (does not send) a reply for a less-confident matched tier', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Dallas load?', body: 'Anything from Dallas, TX?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', early_pu: null, target_pay: null };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'city_state' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.sendReply).not.toHaveBeenCalled();
    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_status).toBe('pending_review');
    expect(inquiries[0].reply_body).toContain('PU: DALLAS, TX');
    expect(inquiries[0].reply_sent_at).toBeNull();
  });

  test('does not pre-fill a reply body for a low-confidence (city) tier match, so a human never sees a possibly-wrong load suggested', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Anything out of Dallas?', body: 'Anything out of Dallas?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', target_pay: '1500.00' };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'city' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.sendReply).not.toHaveBeenCalled();
    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_status).toBe('pending_review');
    expect(inquiries[0].reply_body).toBeNull();
    // still recorded for context, just without a suggested reply
    expect(inquiries[0].matched_load_id).toBe(1);
    expect(inquiries[0].match_tier).toBe('city');
  });

  test('does not pre-fill a reply body for a low-confidence (state) tier match either', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Anything in Texas?', body: 'Anything in Texas?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    const matchedLoad = { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', target_pay: '1500.00' };
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad, tier: 'state' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_body).toBeNull();
  });

  describe('recipient filtering (only direct, single-recipient inquiries)', () => {
    test('processes a message addressed only to the connected account as normal', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
    });

    test('skips a message entirely (no inquiry row at all) when a Cc recipient is present besides the account itself', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', cc: 'team@igtfreight.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(matchingEngine.matchInquiry).not.toHaveBeenCalled();
      expect(gmailClient.sendReply).not.toHaveBeenCalled();
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('skips a message when the To header lists another recipient besides the account itself', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com, dispatch@carrier.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('still processes other messages in the same poll after skipping one addressed to a group', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1', 'm2']);
      gmailClient.getMessage.mockImplementation(async (token, messageId) => {
        if (messageId === 'm1') {
          return {
            id: 'm1', from: 'carrier1@example.com', to: 'testuser@example.com', cc: 'team@igtfreight.com',
            subject: 'Group reply', body: 'Is load 4521 still available?',
            receivedAt: new Date('2026-08-08T08:00:00Z'),
          };
        }
        return {
          id: 'm2', from: 'carrier2@example.com', to: 'testuser@example.com',
          subject: 'Direct reply', body: 'Is load 4521 still available?',
          receivedAt: new Date('2026-08-08T08:05:00Z'),
        };
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0].gmail_message_id).toBe('m2');
    });
  });

  describe('thread-level deduplication (one inquiry per thread, not per message)', () => {
    test('a second poll picking up a follow-up reply in an already-logged thread is skipped entirely', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      // First poll: the original inquiry in the thread.
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Lewistown, PA - Orlando, FL', body: 'Is this still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      let [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      // Second poll: a followup reply in the SAME thread (a carrier's "any
      // update?"/tracking chatter, or Gmail assigning a new message id to
      // each leg of the back-and-forth) -- same threadId, different message id.
      gmailClient.listNewMessageIds.mockResolvedValue(['m2']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm2', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Re: Lewistown, PA - Orlando, FL', body: 'Any update?',
        receivedAt: new Date('2026-08-08T09:00:00Z'),
      });
      [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0].gmail_message_id).toBe('m1');
    });

    test('a followup reply in an already-logged thread is skipped even within the same poll batch', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1', 'm2']);
      gmailClient.getMessage.mockImplementation(async (token, messageId) => {
        if (messageId === 'm1') {
          return {
            id: 'm1', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
            subject: 'Lewistown, PA - Orlando, FL', body: 'Is this still available?',
            receivedAt: new Date('2026-08-08T08:00:00Z'),
          };
        }
        return {
          id: 'm2', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
          subject: 'Re: Lewistown, PA - Orlando, FL', body: 'Any update?',
          receivedAt: new Date('2026-08-08T08:05:00Z'),
        };
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0].gmail_message_id).toBe('m1');
    });

    // Regression test for the reported bug: "two inquiries came in at the
    // same time and only one made it to the board." A Blast Email is BCC'd
    // to many carriers from one sent message, and Gmail can assign every
    // carrier's reply the SAME threadId (they all share the References
    // chain back to that one sent message). The old thread-only dedup
    // treated the second carrier's reply as a followup in an
    // already-logged conversation and silently dropped it.
    test('two different carriers replying into what Gmail reports as the same thread are both logged', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'carrierA@example.com', to: 'testuser@example.com',
        subject: 'Load Available | Dallas TX -> Chicago IL | Reefer', body: 'Is this still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      let [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      gmailClient.listNewMessageIds.mockResolvedValue(['m2']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm2', threadId: 't1', from: 'carrierB@example.com', to: 'testuser@example.com',
        subject: 'Re: Load Available | Dallas TX -> Chicago IL | Reefer', body: 'Is this still available?',
        receivedAt: new Date('2026-08-08T08:00:05Z'),
      });
      [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ? ORDER BY gmail_message_id', [accountId]);
      expect(inquiries).toHaveLength(2);
      expect(inquiries.map((i) => i.from_address)).toEqual(['carrierA@example.com', 'carrierB@example.com']);
    });

    test('a message in a genuinely new thread is still processed normally', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'carrier1@example.com', to: 'testuser@example.com',
        subject: 'Lewistown, PA - Orlando, FL', body: 'Is this still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      let [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      gmailClient.listNewMessageIds.mockResolvedValue(['m2']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm2', threadId: 't2', from: 'carrier2@example.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T09:00:00Z'),
      });
      [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(2);
    });

    test('does not skip on thread when the message has no threadId at all', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: undefined, from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      let [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      gmailClient.listNewMessageIds.mockResolvedValue(['m2']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm2', threadId: undefined, from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Load 4521 again', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T09:00:00Z'),
      });
      [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(2);
    });
  });

  describe('automated notification filtering', () => {
    test('skips a message entirely from a noreply@ sender (no inquiry row at all)', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'noreply@truckertools.com', to: 'testuser@example.com',
        subject: 'Load# 0807261 -  view the real-time location of this load using Load Track', body: 'Track your shipment.',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(matchingEngine.matchInquiry).not.toHaveBeenCalled();
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('skips a message from a real person\'s address when the subject is a shipment-tendered notification', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'Daisy Carchilan <daisy@igtfreight.com>', to: 'testuser@example.com',
        subject: 'Re: Shipment 60115349232 Tendered for IGT Logistics Inc', body: 'FYI.',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('still processes an ordinary carrier inquiry normally', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'dispatch@carrierco.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
    });
  });

  describe('threads already answered directly in Gmail', () => {
    test('skips a brand-new thread entirely when the account has already sent a message in it', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      gmailClient.threadHasSentMessage.mockResolvedValue(true);
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(matchingEngine.matchInquiry).not.toHaveBeenCalled();
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('processes a brand-new thread normally when the account has not sent anything in it yet', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      gmailClient.threadHasSentMessage.mockResolvedValue(false);
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries).toHaveLength(1);
    });

    test('passes the sender\'s address to threadHasSentMessage, so a SENT reply to a different carrier in a shared thread does not hide this one', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: 't1', from: 'Carrier B <carrierB@example.com>', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      gmailClient.threadHasSentMessage.mockResolvedValue(false);
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(gmailClient.threadHasSentMessage).toHaveBeenCalledWith('fresh-access-token', 't1', 'carrierb@example.com');
    });

    test('does not call threadHasSentMessage for a message with no threadId', async () => {
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', threadId: undefined, from: 'carrier@example.com', to: 'testuser@example.com',
        subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(gmailClient.threadHasSentMessage).not.toHaveBeenCalled();
    });
  });

  test('falls back to pending_review if the auto-send attempt itself fails', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({
      matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number',
    });
    gmailClient.sendReply.mockRejectedValue(new Error('Gmail API rate limited'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);
    consoleErrorSpy.mockRestore();

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].reply_status).toBe('pending_review');
    expect(inquiries[0].reply_sent_at).toBeNull();
    // the inquiry itself is still recorded, not lost, despite the send failure
    expect(inquiries[0].matched_load_id).toBe(1);
  });

  test('pollAccount does not reprocess a message it has already stored', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    await pool.query(
      `INSERT INTO email_inquiries (user_id, email_account_id, gmail_message_id, received_at, match_tier, status)
       VALUES (?, ?, 'm1', NOW(), 'none', 'needs_review')`,
      [userId, accountId]
    );

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    expect(gmailClient.getMessage).not.toHaveBeenCalled();
    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries).toHaveLength(1);
  });

  test('pollAccount logs an unmatched message as needs_review with a null matched_load_id', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Random question', body: 'Do you have parking available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: null, tier: 'none' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].matched_load_id).toBeNull();
    expect(inquiries[0].status).toBe('needs_review');
    expect(inquiries[0].reply_status).toBe('none');
    expect(inquiries[0].reply_body).toBeNull();
    expect(gmailClient.sendReply).not.toHaveBeenCalled();
  });

  test('pollAccount emits inquiry:new to the account owner when a wsHub is given', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Random question', body: 'Do you have parking available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: null, tier: 'none' });
    const wsHub = { emitToUser: jest.fn() };

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0], wsHub);

    expect(wsHub.emitToUser).toHaveBeenCalledTimes(1);
    const [userIdArg, event, payload] = wsHub.emitToUser.mock.calls[0];
    expect(userIdArg).toBe(userId);
    expect(event).toBe('inquiry:new');
    expect(payload.gmail_message_id).toBe('m1');
  });

  test('pollAccount does not touch wsHub when none is given', async () => {
    googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
    gmailClient.getMessage.mockResolvedValue({
      id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Random question', body: 'Do you have parking available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: null, tier: 'none' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await expect(pollAccount(pool, accountRows[0])).resolves.not.toThrow();
  });

  describe('auto-send gating (email_accounts.auto_send_enabled)', () => {
    test('a load_number match still only queues a reply for review when auto-send is disabled', async () => {
      await pool.query('UPDATE email_accounts SET auto_send_enabled = 0 WHERE id = ?', [accountId]);
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({
        matchedLoad: { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' }, tier: 'load_number',
      });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(gmailClient.sendReply).not.toHaveBeenCalled();
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries[0].reply_status).toBe('pending_review');
      expect(inquiries[0].reply_body).toContain('PU: DALLAS, TX');
      expect(inquiries[0].match_tier).toBe('load_number');
    });

    test('a load_number match auto-sends when auto-send is enabled', async () => {
      await pool.query('UPDATE email_accounts SET auto_send_enabled = 1 WHERE id = ?', [accountId]);
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({
        matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number',
      });
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(gmailClient.sendReply).toHaveBeenCalledTimes(1);
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries[0].reply_status).toBe('auto_sent');
    });

    test('a lower-confidence tier still never auto-sends, even with auto-send enabled', async () => {
      await pool.query('UPDATE email_accounts SET auto_send_enabled = 1 WHERE id = ?', [accountId]);
      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'testuser@example.com', subject: 'Dallas load?', body: 'Anything from Dallas, TX?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({
        matchedLoad: { id: 1, load_number: '4521', origin_city: 'Dallas', origin_state: 'TX' }, tier: 'city_state',
      });

      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
      await pollAccount(pool, accountRows[0]);

      expect(gmailClient.sendReply).not.toHaveBeenCalled();
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
      expect(inquiries[0].reply_status).toBe('pending_review');
    });
  });

  describe('first poll for a newly-connected account', () => {
    let freshAccountId;

    beforeEach(async () => {
      // email_accounts.user_id is UNIQUE (one Gmail account per user), and
      // the outer beforeEach already gave `userId` its own account, so this
      // needs a separate user.
      const passwordHash = await bcrypt.hash('freshpw', 10);
      const [freshUserResult] = await pool.query(
        "INSERT INTO users (username, password_hash, role) VALUES ('freshuser', ?, 'user')",
        [passwordHash]
      );
      // No last_polled_at -- simulates an account that was just connected
      // and has never been polled.
      const [freshAccountResult] = await pool.query(
        'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
        [freshUserResult.insertId, 'freshuser@example.com', 'fresh-refresh-token']
      );
      freshAccountId = freshAccountResult.insertId;
    });

    test('does not fetch or process any messages, and never fetches an access token', async () => {
      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [freshAccountId]);
      expect(accountRows[0].last_polled_at).toBeNull();

      await pollAccount(pool, accountRows[0]);

      // Regression guard for the real bug this fixes: on a never-polled
      // account, gmailClient.listNewMessageIds(accessToken, null) queried
      // Gmail with no date filter at all, returning the 50 most recent
      // inbox messages regardless of age -- including old carrier threads
      // and unrelated internal mail -- and processed every one of them as
      // a fresh inquiry. A first poll must only establish a "from now on"
      // baseline, never backfill.
      expect(googleOAuth.getAccessToken).not.toHaveBeenCalled();
      expect(gmailClient.listNewMessageIds).not.toHaveBeenCalled();
      expect(gmailClient.getMessage).not.toHaveBeenCalled();

      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [freshAccountId]);
      expect(inquiries).toHaveLength(0);
    });

    test('still stamps last_polled_at, so the next poll only looks forward from here', async () => {
      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [freshAccountId]);
      await pollAccount(pool, accountRows[0]);

      const [updated] = await pool.query('SELECT last_polled_at FROM email_accounts WHERE id = ?', [freshAccountId]);
      expect(updated[0].last_polled_at).not.toBeNull();
    });

    test('does not emit anything even when a wsHub is given', async () => {
      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [freshAccountId]);
      const wsHub = { emitToUser: jest.fn() };

      await pollAccount(pool, accountRows[0], wsHub);

      expect(wsHub.emitToUser).not.toHaveBeenCalled();
    });

    test('a later poll (after the baseline is established) processes messages normally', async () => {
      const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [freshAccountId]);
      await pollAccount(pool, accountRows[0]); // first poll: establishes baseline, processes nothing

      googleOAuth.getAccessToken.mockResolvedValue('fresh-access-token');
      gmailClient.listNewMessageIds.mockResolvedValue(['m1']);
      gmailClient.getMessage.mockResolvedValue({
        id: 'm1', from: 'carrier@example.com', to: 'freshuser@example.com', subject: 'Load 4521', body: 'Is load 4521 still available?',
        receivedAt: new Date('2026-08-08T08:00:00Z'),
      });
      matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: { id: 1, load_number: '4521' }, tier: 'load_number' });
      gmailClient.sendReply.mockResolvedValue({ id: 'sent1' });

      const [reFetchedAccount] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [freshAccountId]);
      await pollAccount(pool, reFetchedAccount[0]); // second poll: normal processing

      expect(gmailClient.listNewMessageIds).toHaveBeenCalledTimes(1);
      const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [freshAccountId]);
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0].gmail_message_id).toBe('m1');
    });
  });

  test('pollAllAccounts continues polling other accounts if one account fails', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    await pool.query(
      "INSERT INTO email_accounts (user_id, gmail_address, refresh_token, last_polled_at) VALUES (?, ?, ?, '2020-01-01 00:00:00')",
      [otherUser.insertId, 'other@example.com', 'other-refresh-token']
    );

    googleOAuth.getAccessToken
      .mockRejectedValueOnce(new Error('refresh token expired'))
      .mockResolvedValueOnce('fresh-access-token');
    gmailClient.listNewMessageIds.mockResolvedValue([]);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await pollAllAccounts(pool);
    consoleErrorSpy.mockRestore();

    expect(googleOAuth.getAccessToken).toHaveBeenCalledTimes(2);
  });
});
