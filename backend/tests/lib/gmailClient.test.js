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

  test('warns when Gmail signals more results were available than fetched', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    googleapis.__mockGmailClient.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'm1' }], nextPageToken: 'abc123' },
    });
    await listNewMessageIds('token', null);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  test('does not warn when there is no next page token', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    googleapis.__mockGmailClient.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'm1' }] },
    });
    await listNewMessageIds('token', null);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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

  test('returns an empty string for a header that is missing entirely', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'From', value: 'carrier@example.com' }],
          body: { data: Buffer.from('No subject here').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message.subject).toBe('');
  });

  test('matches header names case-insensitively', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'from', value: 'carrier@example.com' }],
          body: { data: Buffer.from('Case insensitive header').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message.from).toBe('carrier@example.com');
  });

  test('does not crash when a header object is missing a name property', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [{ value: 'malformed-header-with-no-name' }, { name: 'From', value: 'carrier@example.com' }],
          body: { data: Buffer.from('Malformed header present').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message.from).toBe('carrier@example.com');
  });
});
