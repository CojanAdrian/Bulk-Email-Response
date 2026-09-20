import { describe, test, expect, vi, beforeEach } from 'vitest';
import { listInquiries, sendInquiryReply, rejectInquiry, reassignInquiry } from '../../src/api/inquiries';

describe('inquiries api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('listInquiries gets /api/inquiries with no filter when called with no argument', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listInquiries();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries');
    expect(url).not.toContain('?reply_status=');
  });

  test('listInquiries gets /api/inquiries?reply_status=... when given a filter', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listInquiries('pending_review');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries?reply_status=pending_review');
  });

  test('listInquiries adds &order=oldest when given an order option', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    await listInquiries('pending_review', { order: 'oldest' });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries?reply_status=pending_review&order=oldest');
  });

  test('reassignInquiry patches /api/inquiries/:id/match with the new load id', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await reassignInquiry(1, 42);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries/1/match');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ matched_load_id: 42 });
  });

  test('reassignInquiry can detach the match by passing null', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await reassignInquiry(1, null);
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ matched_load_id: null });
  });

  test('sendInquiryReply posts /api/inquiries/:id/send with a body override', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await sendInquiryReply(1, 'edited reply text');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries/1/send');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ body: 'edited reply text' });
  });

  test('sendInquiryReply posts an empty body when no override is given', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await sendInquiryReply(1);
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({});
  });

  test('rejectInquiry posts /api/inquiries/:id/reject', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
    await rejectInquiry(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/inquiries/1/reject');
    expect(options.method).toBe('POST');
  });
});
