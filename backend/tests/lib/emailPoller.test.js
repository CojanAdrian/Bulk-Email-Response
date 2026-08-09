require('dotenv').config();
jest.mock('../../src/lib/googleOAuth');
jest.mock('../../src/lib/gmailClient');
jest.mock('../../src/lib/matchingEngine');

const googleOAuth = require('../../src/lib/googleOAuth');
const gmailClient = require('../../src/lib/gmailClient');
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
    await resetTables(pool);
    const passwordHash = await bcrypt.hash('correcthorse', 10);
    const [userResult] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    userId = userResult.insertId;
    const [accountResult] = await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
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
      from: 'carrier@example.com',
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
      id: 'm1', from: 'carrier@example.com', subject: 'Random question', body: 'Do you have parking available?',
      receivedAt: new Date('2026-08-08T08:00:00Z'),
    });
    matchingEngine.matchInquiry.mockReturnValue({ matchedLoad: null, tier: 'none' });

    const [accountRows] = await pool.query('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    await pollAccount(pool, accountRows[0]);

    const [inquiries] = await pool.query('SELECT * FROM email_inquiries WHERE email_account_id = ?', [accountId]);
    expect(inquiries[0].matched_load_id).toBeNull();
    expect(inquiries[0].status).toBe('needs_review');
  });

  test('pollAllAccounts continues polling other accounts if one account fails', async () => {
    const passwordHash = await bcrypt.hash('otherpw', 10);
    const [otherUser] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('otheruser', ?, 'user')", [passwordHash]);
    await pool.query(
      'INSERT INTO email_accounts (user_id, gmail_address, refresh_token) VALUES (?, ?, ?)',
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
