# Email Integration & Load-Matching Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user connect their own Gmail inbox, automatically detect load-inquiry emails in it, and match each one against that user's own loads using a rule-based pipeline — logging every result (matched or not) for later review. No replies are sent yet.

**Architecture:** A thin OAuth wrapper (`googleOAuth.js`) and Gmail API wrapper (`gmailClient.js`) around the `googleapis` npm package, both mockable at their module boundary the same way `bcrypt`/`mysql2` calls are wrapped elsewhere in this backend. A pure-function matching engine (`matchingEngine.js`, tested as thoroughly as `mcleodParser.js` was) takes an email's text and a user's loads and returns a match. A poller (`emailPoller.js`), run on a `setInterval` from `server.js`, ties these together: for each connected account, fetch new messages, run them through the matcher, write the result to a new `email_inquiries` table, skipping messages already processed.

**Tech Stack:** Node.js, Express (existing), `googleapis` (new dependency) for Gmail OAuth + API access, MySQL (existing), Jest + Supertest (existing).

**Relationship to other plans:** Builds on `docs/superpowers/plans/2026-08-07-backend-multi-user-accounts.md` (per-user data isolation — this plan extends that same isolation to email inquiries and matching). Sub-project 3 (auto-send replies, review queue) and sub-project 4 (dashboard UI for reviewing inquiries) are separate follow-on plans that build on top of this one's `email_inquiries` table and `GET /api/inquiries` endpoint.

**Prerequisite for REAL Gmail connections (not for building/testing):** a Google Cloud project with the Gmail API enabled and OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `backend/.env`) — see the design spec (`docs/superpowers/specs/2026-08-08-email-matching-engine-design.md`) for exact setup steps. Every task in this plan is buildable and testable without these credentials (all Gmail API calls are mocked in tests); only a final live-Gmail manual check needs them.

---

## Task 1: Dependency and schema

**Files:**
- Modify: `backend/package.json` (add `googleapis` dependency)
- Modify: `backend/sql/schema.sql` (add `email_accounts`, `email_inquiries` tables)

- [ ] **Step 1: Install the `googleapis` package**

Run (from `backend/`):
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm install googleapis
```
Expected: `googleapis` added to `dependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Add the new tables to the schema**

Append to `backend/sql/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS email_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  gmail_address VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_polled_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS email_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  email_account_id INT NOT NULL,
  gmail_message_id VARCHAR(255) NOT NULL,
  from_address VARCHAR(255),
  subject VARCHAR(500),
  body_snippet TEXT,
  received_at DATETIME,
  matched_load_id INT NULL,
  match_tier ENUM('load_number','city_state','city','state','none') NOT NULL DEFAULT 'none',
  status ENUM('matched','needs_review') NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_message (email_account_id, gmail_message_id)
);
```
(`CREATE TABLE IF NOT EXISTS` is naturally idempotent — no ALTER-based migration needed since these are brand-new tables, unlike Task 1 of the multi-user-accounts plan which had to modify existing tables.)

- [ ] **Step 3: Apply and verify against the real database**

Run (from `backend/`):
```bash
npm run setup-db
```
Expected: no errors, ends with "Database setup complete."

Verify directly:
```bash
docker exec bulkposting-mysql mysql -uroot -pbulkposting_root_pw -e "
  DESCRIBE bulkposting_dev.email_accounts;
  DESCRIBE bulkposting_dev.email_inquiries;
  SHOW TABLES FROM bulkposting_test LIKE 'email%';
"
```
Expected: both tables exist with the columns above in `bulkposting_dev`, and both table names also appear in `bulkposting_test` (schema.sql is applied to both databases by the existing `setupDatabase()` function).

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/sql/schema.sql
git commit -m "chore: add googleapis dependency and email_accounts/email_inquiries tables"
```

---

## Task 2: Google OAuth wrapper

**Files:**
- Create: `backend/src/lib/googleOAuth.js`
- Test: `backend/tests/lib/googleOAuth.test.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/lib/googleOAuth.test.js`:
```js
jest.mock('googleapis', () => {
  const mockOAuth2Instance = {
    generateAuthUrl: jest.fn(),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    getAccessToken: jest.fn(),
  };
  const mockGmailClient = {
    users: { getProfile: jest.fn() },
  };
  return {
    google: {
      auth: { OAuth2: jest.fn(() => mockOAuth2Instance) },
      gmail: jest.fn(() => mockGmailClient),
    },
    __mockOAuth2Instance: mockOAuth2Instance,
    __mockGmailClient: mockGmailClient,
  };
});

const googleapis = require('googleapis');
const { getAuthUrl, exchangeCodeForTokens, getAccessToken, getUserEmailAddress } = require('../../src/lib/googleOAuth');

describe('googleOAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getAuthUrl returns the URL generated by the OAuth client with the right scopes', () => {
    googleapis.__mockOAuth2Instance.generateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/mock-url');
    const url = getAuthUrl();
    expect(url).toBe('https://accounts.google.com/o/oauth2/mock-url');
    expect(googleapis.__mockOAuth2Instance.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
      })
    );
  });

  test('exchangeCodeForTokens returns the tokens from getToken', async () => {
    googleapis.__mockOAuth2Instance.getToken.mockResolvedValue({ tokens: { access_token: 'abc', refresh_token: 'xyz' } });
    const tokens = await exchangeCodeForTokens('auth-code-123');
    expect(tokens).toEqual({ access_token: 'abc', refresh_token: 'xyz' });
    expect(googleapis.__mockOAuth2Instance.getToken).toHaveBeenCalledWith('auth-code-123');
  });

  test('getAccessToken sets the refresh token as credentials and returns a fresh access token', async () => {
    googleapis.__mockOAuth2Instance.getAccessToken.mockResolvedValue({ token: 'fresh-access-token' });
    const token = await getAccessToken('some-refresh-token');
    expect(token).toBe('fresh-access-token');
    expect(googleapis.__mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'some-refresh-token' });
  });

  test('getUserEmailAddress returns the profile email address', async () => {
    googleapis.__mockGmailClient.users.getProfile.mockResolvedValue({ data: { emailAddress: 'kenny@igtfreight.com' } });
    const email = await getUserEmailAddress('some-access-token');
    expect(email).toBe('kenny@igtfreight.com');
    expect(googleapis.__mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ access_token: 'some-access-token' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/lib/googleOAuth.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/googleOAuth'`

- [ ] **Step 3: Write the module**

`backend/src/lib/googleOAuth.js`:
```js
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/gmail/oauth/callback'
  );
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function getAccessToken(refreshToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2Client.getAccessToken();
  return token;
}

async function getUserEmailAddress(accessToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress;
}

module.exports = { getAuthUrl, exchangeCodeForTokens, getAccessToken, getUserEmailAddress, createOAuthClient, SCOPES };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/lib/googleOAuth.test.js`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/googleOAuth.js backend/tests/lib/googleOAuth.test.js
git commit -m "feat: add Google OAuth wrapper for Gmail account connection"
```

---

## Task 3: Gmail API client

**Files:**
- Create: `backend/src/lib/gmailClient.js`
- Test: `backend/tests/lib/gmailClient.test.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/lib/gmailClient.test.js`:
```js
jest.mock('googleapis', () => {
  const mockOAuth2Instance = {
    setCredentials: jest.fn(),
  };
  const mockGmailClient = {
    users: {
      messages: {
        list: jest.fn(),
        get: jest.fn(),
      },
    },
  };
  return {
    google: {
      auth: { OAuth2: jest.fn(() => mockOAuth2Instance) },
      gmail: jest.fn(() => mockGmailClient),
    },
    __mockOAuth2Instance: mockOAuth2Instance,
    __mockGmailClient: mockGmailClient,
  };
});

const googleapis = require('googleapis');
const { listNewMessageIds, getMessage, extractPlainTextBody } = require('../../src/lib/gmailClient');

describe('listNewMessageIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries with no date filter when sinceDate is null', async () => {
    googleapis.__mockGmailClient.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 'm1' }, { id: 'm2' }] } });
    const ids = await listNewMessageIds('token', null);
    expect(ids).toEqual(['m1', 'm2']);
    expect(googleapis.__mockGmailClient.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', q: '', labelIds: ['INBOX'] })
    );
  });

  test('queries with an after: filter when sinceDate is provided', async () => {
    googleapis.__mockGmailClient.users.messages.list.mockResolvedValue({ data: { messages: [] } });
    const sinceDate = new Date('2026-08-01T00:00:00Z');
    await listNewMessageIds('token', sinceDate);
    const callArgs = googleapis.__mockGmailClient.users.messages.list.mock.calls[0][0];
    expect(callArgs.q).toBe(`after:${Math.floor(sinceDate.getTime() / 1000)}`);
  });

  test('returns an empty array when there are no messages', async () => {
    googleapis.__mockGmailClient.users.messages.list.mockResolvedValue({ data: {} });
    const ids = await listNewMessageIds('token', null);
    expect(ids).toEqual([]);
  });
});

describe('extractPlainTextBody', () => {
  test('extracts body from a simple text/plain payload', () => {
    const payload = { mimeType: 'text/plain', body: { data: Buffer.from('Hello world').toString('base64url') } };
    expect(extractPlainTextBody(payload)).toBe('Hello world');
  });

  test('recurses into multipart payloads to find the text/plain part', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('Plain text version').toString('base64url') } },
        { mimeType: 'text/html', body: { data: Buffer.from('<p>HTML version</p>').toString('base64url') } },
      ],
    };
    expect(extractPlainTextBody(payload)).toBe('Plain text version');
  });

  test('returns an empty string when no text/plain part exists', () => {
    const payload = { mimeType: 'text/html', body: { data: Buffer.from('<p>Only HTML</p>').toString('base64url') } };
    expect(extractPlainTextBody(payload)).toBe('');
  });
});

describe('getMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses headers and body from a Gmail message response', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'carrier@example.com' },
            { name: 'Subject', value: 'Load #4521 availability' },
          ],
          body: { data: Buffer.from('Is load 4521 still available?').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message).toEqual({
      id: 'm1',
      from: 'carrier@example.com',
      subject: 'Load #4521 availability',
      body: 'Is load 4521 still available?',
      receivedAt: new Date(1735689600000),
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/lib/gmailClient.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/gmailClient'`

- [ ] **Step 3: Write the module**

`backend/src/lib/gmailClient.js`:
```js
const { google } = require('googleapis');
const { createOAuthClient } = require('./googleOAuth');

function buildGmailClient(accessToken) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function listNewMessageIds(accessToken, sinceDate) {
  const gmail = buildGmailClient(accessToken);
  const query = sinceDate ? `after:${Math.floor(sinceDate.getTime() / 1000)}` : '';
  const res = await gmail.users.messages.list({ userId: 'me', q: query, labelIds: ['INBOX'], maxResults: 50 });
  return (res.data.messages || []).map((m) => m.id);
}

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function extractPlainTextBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainTextBody(part);
      if (text) return text;
    }
  }
  return '';
}

async function getMessage(accessToken, messageId) {
  const gmail = buildGmailClient(accessToken);
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = res.data.payload.headers || [];
  const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
  return {
    id: res.data.id,
    from: getHeader('From'),
    subject: getHeader('Subject'),
    body: extractPlainTextBody(res.data.payload),
    receivedAt: new Date(Number(res.data.internalDate)),
  };
}

module.exports = { listNewMessageIds, getMessage, extractPlainTextBody };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/lib/gmailClient.test.js`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/gmailClient.js backend/tests/lib/gmailClient.test.js
git commit -m "feat: add Gmail API client for listing and reading messages"
```

---

## Task 4: Load-matching engine

**Files:**
- Create: `backend/src/lib/matchingEngine.js`
- Test: `backend/tests/lib/matchingEngine.test.js`

This is a pure-function module — no network calls, no database, no React. It's the highest-value, most novel logic in this plan, so it gets the same thorough branch-by-branch testing `mcleodParser.js` got in the frontend.

- [ ] **Step 1: Write the failing tests**

`backend/tests/lib/matchingEngine.test.js`:
```js
const { matchInquiry, extractDate } = require('../../src/lib/matchingEngine');

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

  test('matches on a city+state pair when no load number is mentioned', () => {
    const result = matchInquiry('Do you have anything from Dallas, TX this week?', LOADS);
    expect(result.tier).toBe('city_state');
    expect(result.matchedLoad.id).toBe(1); // two Dallas,TX loads (1 and 3) -- tie-break picks earliest pickup
  });

  test('narrows a city+state tie using a date mentioned in the email', () => {
    const result = matchInquiry('Looking for a Dallas, TX load picking up 8/12', LOADS);
    expect(result.tier).toBe('city_state');
    expect(result.matchedLoad.id).toBe(3);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/lib/matchingEngine.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/matchingEngine'`

- [ ] **Step 3: Write the module**

`backend/src/lib/matchingEngine.js`:
```js
const STATE_NAMES = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
  ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
};

function normalizeText(s) {
  return String(s || '').toLowerCase();
}

function textMentionsState(normalizedText, stateAbbr) {
  if (!stateAbbr) return false;
  const abbr = String(stateAbbr).toLowerCase();
  if (new RegExp(`\\b${abbr}\\b`).test(normalizedText)) return true;
  const fullName = STATE_NAMES[abbr];
  return fullName ? normalizedText.includes(fullName) : false;
}

function findLoadNumberMatch(text, loads) {
  const normalized = normalizeText(text);
  return loads.find((load) => load.load_number && normalized.includes(String(load.load_number).toLowerCase()));
}

function findCityStateMatches(text, loads) {
  const normalized = normalizeText(text);
  return loads.filter((load) => {
    const originMatch = load.origin_city && load.origin_state &&
      normalized.includes(String(load.origin_city).toLowerCase()) &&
      textMentionsState(normalized, load.origin_state);
    const destMatch = load.dest_city && load.dest_state &&
      normalized.includes(String(load.dest_city).toLowerCase()) &&
      textMentionsState(normalized, load.dest_state);
    return originMatch || destMatch;
  });
}

function findCityMatches(text, loads) {
  const normalized = normalizeText(text);
  return loads.filter((load) =>
    (load.origin_city && normalized.includes(String(load.origin_city).toLowerCase())) ||
    (load.dest_city && normalized.includes(String(load.dest_city).toLowerCase()))
  );
}

function findStateMatches(text, loads) {
  const normalized = normalizeText(text);
  return loads.filter((load) =>
    textMentionsState(normalized, load.origin_state) || textMentionsState(normalized, load.dest_state)
  );
}

function extractDate(text) {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3], 10) : parseInt(match[3], 10)) : null;
  return { month, day, year };
}

function matchesExtractedDate(loadDate, extracted) {
  const d = new Date(loadDate);
  if (extracted.year !== null && d.getFullYear() !== extracted.year) return false;
  return d.getMonth() + 1 === extracted.month && d.getDate() === extracted.day;
}

function resolveTie(candidates, text) {
  const extracted = extractDate(text);
  let pool = candidates;
  if (extracted) {
    const dateFiltered = candidates.filter((load) => load.early_pu && matchesExtractedDate(load.early_pu, extracted));
    if (dateFiltered.length >= 1) {
      pool = dateFiltered;
    }
  }
  if (pool.length === 1) return pool[0];
  const withPickup = pool.filter((load) => load.early_pu);
  if (withPickup.length === 0) return pool[0];
  return withPickup.reduce((earliest, load) => (new Date(load.early_pu) < new Date(earliest.early_pu) ? load : earliest));
}

function matchInquiry(emailText, loads) {
  if (!loads || loads.length === 0) {
    return { matchedLoad: null, tier: 'none' };
  }

  const loadNumberMatch = findLoadNumberMatch(emailText, loads);
  if (loadNumberMatch) {
    return { matchedLoad: loadNumberMatch, tier: 'load_number' };
  }

  const cityStateMatches = findCityStateMatches(emailText, loads);
  if (cityStateMatches.length > 0) {
    return { matchedLoad: resolveTie(cityStateMatches, emailText), tier: 'city_state' };
  }

  const cityMatches = findCityMatches(emailText, loads);
  if (cityMatches.length > 0) {
    return { matchedLoad: resolveTie(cityMatches, emailText), tier: 'city' };
  }

  const stateMatches = findStateMatches(emailText, loads);
  if (stateMatches.length > 0) {
    return { matchedLoad: resolveTie(stateMatches, emailText), tier: 'state' };
  }

  return { matchedLoad: null, tier: 'none' };
}

module.exports = {
  matchInquiry,
  extractDate,
  findLoadNumberMatch,
  findCityStateMatches,
  findCityMatches,
  findStateMatches,
  resolveTie,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/lib/matchingEngine.test.js`
Expected: PASS (12 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/matchingEngine.js backend/tests/lib/matchingEngine.test.js
git commit -m "feat: add rule-based load-matching engine"
```

---

## Task 5: Gmail connect/disconnect/status routes

**Files:**
- Create: `backend/src/routes/gmail.js`
- Test: `backend/tests/gmail.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/gmail.test.js`:
```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

jest.mock('../src/lib/googleOAuth');
const googleOAuth = require('../src/lib/googleOAuth');

describe('gmail routes', () => {
  let pool;
  let app;
  let agent;

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
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')", ['testuser', passwordHash]);
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testuser', password: 'correcthorse' });
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/gmail/status');
    expect(res.status).toBe(401);
  });

  test('status reports not connected when no email_accounts row exists', async () => {
    const res = await agent.get('/api/gmail/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  test('connect redirects to the URL from getAuthUrl', async () => {
    googleOAuth.getAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/mock-url');
    const res = await agent.get('/api/gmail/connect');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/mock-url');
  });

  test('oauth callback stores the connection and redirects to the frontend', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');

    const res = await agent.get('/api/gmail/oauth/callback?code=auth-code-123');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('gmail=connected');

    const statusRes = await agent.get('/api/gmail/status');
    expect(statusRes.body.connected).toBe(true);
    expect(statusRes.body.gmailAddress).toBe('kenny@igtfreight.com');
  });

  test('oauth callback with no code returns 400', async () => {
    const res = await agent.get('/api/gmail/oauth/callback');
    expect(res.status).toBe(400);
  });

  test('re-connecting updates the stored account rather than creating a second row', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=first-code');

    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-2', refresh_token: 'refresh-2' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=second-code');

    const [rows] = await pool.query(
      'SELECT * FROM email_accounts WHERE user_id = (SELECT id FROM users WHERE username = ?)',
      ['testuser']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].refresh_token).toBe('refresh-2');
  });

  test('disconnect removes the stored account', async () => {
    googleOAuth.exchangeCodeForTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: 'refresh-1' });
    googleOAuth.getUserEmailAddress.mockResolvedValue('kenny@igtfreight.com');
    await agent.get('/api/gmail/oauth/callback?code=auth-code-123');

    const res = await agent.post('/api/gmail/disconnect');
    expect(res.status).toBe(200);

    const statusRes = await agent.get('/api/gmail/status');
    expect(statusRes.body.connected).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/gmail.test.js`
Expected: FAIL — `/api/gmail/status` returns 404 (route doesn't exist yet)

- [ ] **Step 3: Write the router**

`backend/src/routes/gmail.js`:
```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { getAuthUrl, exchangeCodeForTokens, getUserEmailAddress } = require('../lib/googleOAuth');

function createGmailRouter(pool) {
  const router = express.Router();

  router.get('/status', asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT gmail_address, connected_at FROM email_accounts WHERE user_id = ?',
      [req.session.userId]
    );
    if (rows.length === 0) {
      return res.json({ connected: false });
    }
    res.json({ connected: true, gmailAddress: rows[0].gmail_address, connectedAt: rows[0].connected_at });
  }));

  router.get('/connect', (req, res) => {
    res.redirect(getAuthUrl());
  });

  router.get('/oauth/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    const tokens = await exchangeCodeForTokens(code);
    const gmailAddress = await getUserEmailAddress(tokens.access_token);

    await pool.query(
      `INSERT INTO email_accounts (user_id, gmail_address, refresh_token, connected_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE gmail_address = VALUES(gmail_address), refresh_token = VALUES(refresh_token), connected_at = VALUES(connected_at)`,
      [req.session.userId, gmailAddress, tokens.refresh_token]
    );

    res.redirect(`${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/?gmail=connected`);
  }));

  router.post('/disconnect', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM email_accounts WHERE user_id = ?', [req.session.userId]);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createGmailRouter;
```

- [ ] **Step 4: Mount the router in app.js**

Read the current `backend/src/app.js` first. Add near the top, alongside the other route imports:
```js
const createGmailRouter = require('./routes/gmail');
```
And after the existing `app.use('/api/loads', requireAuth, createLoadsRouter(pool));` line, add:
```js
  app.use('/api/gmail', requireAuth, createGmailRouter(pool));
```
(Must come before the terminal error-handling middleware, which stays last.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/gmail.test.js`
Expected: PASS (7 passed)

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/gmail.js backend/tests/gmail.test.js backend/src/app.js
git commit -m "feat: add Gmail connect/status/disconnect routes"
```

---

## Task 6: Inquiries list route

**Files:**
- Create: `backend/src/routes/inquiries.js`
- Test: `backend/tests/inquiries.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/inquiries.test.js`:
```js
require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createTestPool, resetTables } = require('./setupTestDb');

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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/inquiries.test.js`
Expected: FAIL — `/api/inquiries` returns 404

- [ ] **Step 3: Write the router**

`backend/src/routes/inquiries.js`:
```js
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

function createInquiriesRouter(pool) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM email_inquiries WHERE user_id = ? ORDER BY received_at DESC',
      [req.session.userId]
    );
    res.json(rows);
  }));

  return router;
}

module.exports = createInquiriesRouter;
```

- [ ] **Step 4: Mount the router in app.js**

Read the current `backend/src/app.js` first. Add near the top, alongside the other route imports:
```js
const createInquiriesRouter = require('./routes/inquiries');
```
And after the `app.use('/api/gmail', requireAuth, createGmailRouter(pool));` line added in Task 5, add:
```js
  app.use('/api/inquiries', requireAuth, createInquiriesRouter(pool));
```
(Must still come before the terminal error-handling middleware.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/inquiries.test.js`
Expected: PASS (2 passed)

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/inquiries.js backend/tests/inquiries.test.js backend/src/app.js
git commit -m "feat: add inquiries list endpoint"
```

---

## Task 7: Poller orchestration and scheduling

**Files:**
- Create: `backend/src/lib/emailPoller.js`
- Test: `backend/tests/lib/emailPoller.test.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Write the failing tests**

`backend/tests/lib/emailPoller.test.js`:
```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `npx jest tests/lib/emailPoller.test.js`
Expected: FAIL — `Cannot find module '../../src/lib/emailPoller'`

- [ ] **Step 3: Write the module**

`backend/src/lib/emailPoller.js`:
```js
const { getAccessToken } = require('./googleOAuth');
const { listNewMessageIds, getMessage } = require('./gmailClient');
const { matchInquiry } = require('./matchingEngine');

async function pollAccount(pool, account) {
  const accessToken = await getAccessToken(account.refresh_token);
  const sinceDate = account.last_polled_at ? new Date(account.last_polled_at) : null;
  const messageIds = await listNewMessageIds(accessToken, sinceDate);

  const [loads] = await pool.query('SELECT * FROM loads WHERE user_id = ? AND status = ?', [account.user_id, 'active']);

  for (const messageId of messageIds) {
    const [existing] = await pool.query(
      'SELECT id FROM email_inquiries WHERE email_account_id = ? AND gmail_message_id = ?',
      [account.id, messageId]
    );
    if (existing.length > 0) continue;

    const message = await getMessage(accessToken, messageId);
    const { matchedLoad, tier } = matchInquiry(`${message.subject} ${message.body}`, loads);
    const status = matchedLoad ? 'matched' : 'needs_review';

    await pool.query(
      `INSERT INTO email_inquiries
       (user_id, email_account_id, gmail_message_id, from_address, subject, body_snippet, received_at, matched_load_id, match_tier, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.user_id, account.id, message.id, message.from, message.subject,
        message.body.slice(0, 500), message.receivedAt, matchedLoad ? matchedLoad.id : null, tier, status,
      ]
    );
  }

  await pool.query('UPDATE email_accounts SET last_polled_at = NOW() WHERE id = ?', [account.id]);
}

async function pollAllAccounts(pool) {
  const [accounts] = await pool.query('SELECT * FROM email_accounts');
  for (const account of accounts) {
    try {
      await pollAccount(pool, account);
    } catch (err) {
      console.error(`Failed to poll Gmail for account ${account.id}:`, err);
    }
  }
}

module.exports = { pollAccount, pollAllAccounts };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/lib/emailPoller.test.js`
Expected: PASS (4 passed)

- [ ] **Step 5: Wire the poller into server.js**

Read the current `backend/src/server.js` first. Add near the top, alongside the other requires:
```js
const { pollAllAccounts } = require('./lib/emailPoller');
```
Add this constant near the top-level code (after the `pool`/`app`/`port` setup, before `app.listen(...)`):
```js
const POLL_INTERVAL_MS = 2 * 60 * 1000;
setInterval(() => {
  pollAllAccounts(pool).catch((err) => console.error('Email poll cycle failed:', err));
}, POLL_INTERVAL_MS);
```
(This does not need its own test — `server.js` is the composition root that wires a real pool into `app.listen()`, and isn't covered by the Jest suite the same way `app.js` is via `createApp()`; the poller's actual logic is already fully tested in Step 4 above. Verify this manually in Task 8 instead.)

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/emailPoller.js backend/tests/lib/emailPoller.test.js backend/src/server.js
git commit -m "feat: add email poller orchestration, scheduled every 2 minutes"
```

---

## Task 8: README and manual verification

**Files:**
- Modify: `backend/README.md`

- [ ] **Step 1: Update the README**

Read the current `backend/README.md` first. Add:
- New API reference rows for `GET /api/gmail/status`, `GET /api/gmail/connect`, `GET /api/gmail/oauth/callback`, `POST /api/gmail/disconnect`, `GET /api/inquiries`.
- A new "Gmail integration" section explaining: each user connects their own Gmail account (one per user); a background poller checks every connected inbox every 2 minutes for new messages and matches them against that user's own active loads using the tiered pipeline (load number → city+state → city → state, with a date-based tie-break); results are logged to `email_inquiries` whether or not a match was found; **no replies are sent by this phase** — that's a separate, not-yet-built feature.
- A "Setting up real Gmail access" subsection listing the exact steps from the design spec (`docs/superpowers/specs/2026-08-08-email-matching-engine-design.md`): create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen with `gmail.readonly`/`gmail.send` scopes, create a Web application OAuth Client ID with `http://localhost:4000/api/gmail/oauth/callback` as an authorized redirect URI, and put `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` into `.env`.
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to `.env.example` with placeholder values and a comment that they're only needed for real Gmail connections, not for running the test suite.

- [ ] **Step 2: Verify what's verifiable without real Google credentials**

Run the full suite one more time (`npm test`) and confirm all tests — including the new Gmail/inquiries/poller/matching-engine suites — pass together. Start the server (`npm start`) and confirm it boots without error even with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` unset in `.env` (the OAuth client is only constructed lazily, when `/connect` or the poller actually runs against a connected account — confirm this by checking the server log shows "Backend listening..." with no crash, and that `curl http://localhost:4000/api/health` still returns `{"ok":true}`). This proves the new code doesn't break the server for everyone who hasn't set up Gmail yet, which is the realistic day-one state for anyone other than you.

If you have real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` available at this point, additionally verify the real OAuth flow end-to-end (visit `/api/gmail/connect` in a browser while logged in, complete Google's consent screen, confirm `/api/gmail/status` shows `connected: true` with the real Gmail address). If you don't have real credentials yet, skip this part explicitly rather than faking it — note in your report that this specific check was skipped and why.

- [ ] **Step 3: Commit**

```bash
git add backend/README.md backend/.env.example
git commit -m "docs: document Gmail integration setup and API"
```

---

## Definition of Done

- `npm test` passes in `backend/` with zero failures (health, auth, loads, gmail, inquiries, and the three new `lib/` suites).
- `npm run setup-db` is idempotent and creates the two new tables correctly.
- The server boots and stays healthy with no Google credentials configured (graceful for the common case of a user who hasn't connected Gmail yet).
- No frontend UI is included — a "Connect Gmail" button and the inquiry-review dashboard are separate, later plans.
- Real end-to-end Gmail verification is explicitly marked done or explicitly marked skipped-pending-credentials in the final report — never silently assumed.
