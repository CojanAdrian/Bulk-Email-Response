jest.mock('googleapis', () => {
  const mockOAuth2Instance = {
    setCredentials: jest.fn(),
  };
  const mockGmailClient = {
    users: {
      messages: {
        list: jest.fn(),
        get: jest.fn(),
        send: jest.fn(),
        modify: jest.fn(),
      },
      threads: {
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
const { listNewMessageIds, getMessage, extractPlainTextBody, extractEmailAddresses, threadHasSentMessage, sendReply, markMessageRead } = require('../../src/lib/gmailClient');

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

  test('parses headers, threading info, and body from a Gmail message response', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        threadId: 't1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'carrier@example.com' },
            { name: 'To', value: 'broker@example.com' },
            { name: 'Cc', value: 'dispatch@carrier.com' },
            { name: 'Subject', value: 'Load #4521 availability' },
            { name: 'Message-ID', value: '<abc123@mail.gmail.com>' },
          ],
          body: { data: Buffer.from('Is load 4521 still available?').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message).toEqual({
      id: 'm1',
      threadId: 't1',
      messageIdHeader: '<abc123@mail.gmail.com>',
      from: 'carrier@example.com',
      to: 'broker@example.com',
      cc: 'dispatch@carrier.com',
      subject: 'Load #4521 availability',
      body: 'Is load 4521 still available?',
      receivedAt: new Date(1735689600000),
    });
  });

  test('sets messageIdHeader to null when the Message-ID header is absent', async () => {
    googleapis.__mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        threadId: 't1',
        internalDate: '1735689600000',
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'From', value: 'carrier@example.com' }],
          body: { data: Buffer.from('No Message-ID header').toString('base64url') },
        },
      },
    });

    const message = await getMessage('token', 'm1');
    expect(message.messageIdHeader).toBeNull();
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

describe('extractEmailAddresses', () => {
  test('extracts a bare address', () => {
    expect(extractEmailAddresses('carrier@example.com')).toEqual(['carrier@example.com']);
  });

  test('extracts the address out of a "Name <addr>" formatted entry', () => {
    expect(extractEmailAddresses('Justin Ionita <justin@igtfreight.com>')).toEqual(['justin@igtfreight.com']);
  });

  test('splits and extracts multiple comma-separated recipients', () => {
    expect(extractEmailAddresses('Justin Ionita <justin@igtfreight.com>, team@igtfreight.com')).toEqual([
      'justin@igtfreight.com',
      'team@igtfreight.com',
    ]);
  });

  test('lowercases every extracted address', () => {
    expect(extractEmailAddresses('Justin@IGTFreight.com')).toEqual(['justin@igtfreight.com']);
  });

  test('returns an empty array for a missing header', () => {
    expect(extractEmailAddresses('')).toEqual([]);
    expect(extractEmailAddresses(null)).toEqual([]);
    expect(extractEmailAddresses(undefined)).toEqual([]);
  });
});

describe('threadHasSentMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when a message in the thread has the SENT label', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
      data: { messages: [{ labelIds: ['INBOX'] }, { labelIds: ['SENT'] }] },
    });
    const result = await threadHasSentMessage('token', 't1');
    expect(result).toBe(true);
    expect(googleapis.__mockGmailClient.users.threads.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 't1' })
    );
  });

  test('returns false when no message in the thread has the SENT label', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
      data: { messages: [{ labelIds: ['INBOX'] }, { labelIds: ['INBOX', 'UNREAD'] }] },
    });
    const result = await threadHasSentMessage('token', 't1');
    expect(result).toBe(false);
  });

  test('returns false when the thread has no messages at all', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({ data: {} });
    const result = await threadHasSentMessage('token', 't1');
    expect(result).toBe(false);
  });

  // Regression coverage: a Blast Email is BCC'd to many carriers from one
  // outbound message, and Gmail can assign every carrier's reply the SAME
  // threadId (they all share the References chain back to that one sent
  // message). Without a recipient check here, the mere presence of that
  // original blast -- or a reply already sent to a DIFFERENT carrier -- in
  // the thread would make every other carrier's fresh reply look
  // "already answered", silently dropping their inquiry.
  test('when a recipient is given, only counts a SENT message addressed to that recipient', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
      data: {
        messages: [
          { labelIds: ['SENT'], payload: { headers: [{ name: 'To', value: 'carrierA@example.com' }] } },
          { labelIds: ['INBOX'], payload: { headers: [{ name: 'To', value: 'me@example.com' }] } },
        ],
      },
    });
    const result = await threadHasSentMessage('token', 't1', 'carrierB@example.com');
    expect(result).toBe(false);
  });

  test('when a recipient is given, returns true for a SENT message addressed to that recipient', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
      data: {
        messages: [
          { labelIds: ['SENT'], payload: { headers: [{ name: 'To', value: 'carrierA@example.com' }] } },
        ],
      },
    });
    const result = await threadHasSentMessage('token', 't1', 'carrierA@example.com');
    expect(result).toBe(true);
  });

  test('requests only the To header via metadataHeaders when a recipient is given', async () => {
    googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({ data: { messages: [] } });
    await threadHasSentMessage('token', 't1', 'carrierA@example.com');
    expect(googleapis.__mockGmailClient.users.threads.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 't1', format: 'metadata', metadataHeaders: ['To'] })
    );
  });

  // Regression coverage: a thread with any sent reply anywhere in its
  // history used to look permanently "already answered", even to a brand
  // new carrier message that arrived well after that old reply. sinceDate
  // scopes the check to "answered after this specific message came in".
  describe('sinceDate (only a reply that postdates the message counts)', () => {
    test('returns false when the only SENT message predates sinceDate', async () => {
      googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
        data: { messages: [{ labelIds: ['SENT'], internalDate: '1000' }] },
      });
      const result = await threadHasSentMessage('token', 't1', null, new Date(2000));
      expect(result).toBe(false);
    });

    test('returns true when a SENT message postdates sinceDate', async () => {
      googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
        data: { messages: [{ labelIds: ['SENT'], internalDate: '3000' }] },
      });
      const result = await threadHasSentMessage('token', 't1', null, new Date(2000));
      expect(result).toBe(true);
    });

    test('a SENT message sent at exactly sinceDate does not count (must be strictly after)', async () => {
      googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
        data: { messages: [{ labelIds: ['SENT'], internalDate: '2000' }] },
      });
      const result = await threadHasSentMessage('token', 't1', null, new Date(2000));
      expect(result).toBe(false);
    });

    test('combines with the recipient check -- both must hold', async () => {
      googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            { labelIds: ['SENT'], internalDate: '3000', payload: { headers: [{ name: 'To', value: 'someoneElse@example.com' }] } },
            { labelIds: ['SENT'], internalDate: '1000', payload: { headers: [{ name: 'To', value: 'carrierA@example.com' }] } },
          ],
        },
      });
      const result = await threadHasSentMessage('token', 't1', 'carrierA@example.com', new Date(2000));
      expect(result).toBe(false);
    });

    test('without sinceDate, a SENT message still counts regardless of when it was sent', async () => {
      googleapis.__mockGmailClient.users.threads.get.mockResolvedValue({
        data: { messages: [{ labelIds: ['SENT'], internalDate: '1000' }] },
      });
      const result = await threadHasSentMessage('token', 't1');
      expect(result).toBe(true);
    });
  });
});

describe('sendReply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends a base64url-encoded RFC 2822 message with To/Subject/body', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1' } });

    await sendReply('token', { to: 'carrier@example.com', subject: 'Re: Load #4521', body: 'Yes, still available.' });

    const callArgs = googleapis.__mockGmailClient.users.messages.send.mock.calls[0][0];
    expect(callArgs.userId).toBe('me');
    const decoded = Buffer.from(callArgs.requestBody.raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: carrier@example.com');
    expect(decoded).toContain('Subject: Re: Load #4521');
    expect(decoded).toContain('Yes, still available.');
  });

  test('includes threadId in the request when provided, to keep the reply in the same Gmail thread', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1' } });

    await sendReply('token', { to: 'carrier@example.com', subject: 'Re: Load #4521', body: 'body', threadId: 't1' });

    const callArgs = googleapis.__mockGmailClient.users.messages.send.mock.calls[0][0];
    expect(callArgs.requestBody.threadId).toBe('t1');
  });

  test('omits threadId from the request when not provided', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1' } });

    await sendReply('token', { to: 'carrier@example.com', subject: 'Re: Load #4521', body: 'body' });

    const callArgs = googleapis.__mockGmailClient.users.messages.send.mock.calls[0][0];
    expect(callArgs.requestBody.threadId).toBeUndefined();
  });

  test('sets In-Reply-To and References headers when inReplyToMessageId is provided', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1' } });

    await sendReply('token', {
      to: 'carrier@example.com',
      subject: 'Re: Load #4521',
      body: 'body',
      inReplyToMessageId: '<abc123@mail.gmail.com>',
    });

    const callArgs = googleapis.__mockGmailClient.users.messages.send.mock.calls[0][0];
    const decoded = Buffer.from(callArgs.requestBody.raw, 'base64url').toString('utf8');
    expect(decoded).toContain('In-Reply-To: <abc123@mail.gmail.com>');
    expect(decoded).toContain('References: <abc123@mail.gmail.com>');
  });

  test('omits In-Reply-To/References headers when inReplyToMessageId is not provided', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1' } });

    await sendReply('token', { to: 'carrier@example.com', subject: 'Re: Load #4521', body: 'body' });

    const callArgs = googleapis.__mockGmailClient.users.messages.send.mock.calls[0][0];
    const decoded = Buffer.from(callArgs.requestBody.raw, 'base64url').toString('utf8');
    expect(decoded).not.toContain('In-Reply-To');
    expect(decoded).not.toContain('References');
  });

  test('resolves with the Gmail API response data', async () => {
    googleapis.__mockGmailClient.users.messages.send.mockResolvedValue({ data: { id: 'sent1', threadId: 't1' } });

    const result = await sendReply('token', { to: 'carrier@example.com', subject: 'Re: Load #4521', body: 'body' });
    expect(result).toEqual({ id: 'sent1', threadId: 't1' });
  });
});

describe('markMessageRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('removes the UNREAD label from the given message', async () => {
    googleapis.__mockGmailClient.users.messages.modify.mockResolvedValue({ data: { id: 'm1' } });

    await markMessageRead('token', 'm1');

    expect(googleapis.__mockGmailClient.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm1',
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  });
});
