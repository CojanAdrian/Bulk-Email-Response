jest.mock('../../src/lib/gmailClient');
const gmailClient = require('../../src/lib/gmailClient');
const { signReply, signedReplyFor, htmlToText, clearSignatureCache } = require('../../src/lib/signature');

const GMAIL_SIGNATURE =
  '<div dir="ltr"><b>Kenny Cojan</b><br>Logistics Coordinator | IGT Freight<br>' +
  '<a href="mailto:kenny@igtfreight.com">kenny@igtfreight.com</a> &nbsp;|&nbsp; (312) 555-0100<br>' +
  '<img src="https://ci3.googleusercontent.com/logo.png" width="120"></div>';

describe('signature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSignatureCache();
  });

  test('turns a Gmail signature into readable plain text', () => {
    expect(htmlToText(GMAIL_SIGNATURE)).toBe('Kenny Cojan\nLogistics Coordinator | IGT Freight\nkenny@igtfreight.com | (312) 555-0100');
  });

  test('uses the Gmail signature, keeping its HTML for the formatted copy', () => {
    const signed = signReply('PU: CHICAGO, IL\nRate: $2,450', { gmailSignatureHtml: GMAIL_SIGNATURE, typedSignature: 'Typed sig' });
    expect(signed.text).toBe('PU: CHICAGO, IL\nRate: $2,450\n\nKenny Cojan\nLogistics Coordinator | IGT Freight\nkenny@igtfreight.com | (312) 555-0100');
    expect(signed.html).toContain('PU: CHICAGO, IL<br>Rate: $2,450');
    expect(signed.html).toContain('class="gmail_signature"');
    expect(signed.html).toContain('<img src="https://ci3.googleusercontent.com/logo.png"');
    expect(signed.text).not.toContain('Typed sig');
  });

  test('escapes the reply text in the formatted copy', () => {
    expect(signReply('a < b & c', { gmailSignatureHtml: '<b>K</b>' }).html).toContain('a &lt; b &amp; c');
  });

  test('falls back to the typed signature, as plain text, when Gmail has none', () => {
    expect(signReply('Hello', { gmailSignatureHtml: '', typedSignature: 'Kenny\nIGT' })).toEqual({ text: 'Hello\n\nKenny\nIGT', html: null });
  });

  test('reads the Gmail signature once and reuses it for a while', async () => {
    gmailClient.getGmailSignature.mockResolvedValue(GMAIL_SIGNATURE);
    const account = { id: 1, gmail_address: 'kenny@igtfreight.com', signature: '' };
    await signedReplyFor(account, 'token', 'one');
    const signed = await signedReplyFor(account, 'token', 'two');
    expect(gmailClient.getGmailSignature).toHaveBeenCalledTimes(1);
    expect(gmailClient.getGmailSignature).toHaveBeenCalledWith('token', 'kenny@igtfreight.com');
    expect(signed.html).toContain('gmail_signature');
  });

  test('still sends with the typed signature when Gmail cannot be reached', async () => {
    gmailClient.getGmailSignature.mockRejectedValue(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const signed = await signedReplyFor({ id: 2, gmail_address: 'k@x.com', signature: 'Typed' }, 'token', 'Hi');
    spy.mockRestore();
    expect(signed).toEqual({ text: 'Hi\n\nTyped', html: null });
  });
});
