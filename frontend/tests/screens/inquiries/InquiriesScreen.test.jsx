import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import InquiriesScreen from '../../../src/screens/inquiries/InquiriesScreen';
import { getState, resetMapStore } from '../../../src/map/mapStore';
import * as inquiriesApi from '../../../src/api/inquiries';
import * as loadsApi from '../../../src/api/loads';
import * as gmailApi from '../../../src/api/gmail';
import * as statsApi from '../../../src/api/stats';
import * as liveSocket from '../../../src/lib/liveSocket';
import { withRateLine } from '../../../src/screens/inquiries/inquiryText';

vi.mock('../../../src/api/inquiries');
vi.mock('../../../src/api/loads');
vi.mock('../../../src/api/gmail');
vi.mock('../../../src/api/stats');
vi.mock('../../../src/lib/liveSocket');

const OLDER = {
  id: 1, from_address: 'Redline Haul <dispatch@redline.com>', subject: 'Re: L1001', body_snippet: 'Is Chicago still open? Can do $2,300.',
  received_at: '2026-11-14T09:00:00Z', reply_status: 'pending_review', match_tier: 'load_number', matched_load_id: 11,
  matched_load_load_number: 'L1001', matched_load_origin_city: 'Chicago', matched_load_origin_state: 'IL', matched_load_dest_city: 'Dallas', matched_load_dest_state: 'TX',
  matched_load_origin_lat: 41.88, matched_load_origin_lng: -87.63, matched_load_dest_lat: 32.78, matched_load_dest_lng: -96.8,
  matched_load_target_pay: '2450.00', matched_load_include_rate: 1, live_reply_body: 'PU: CHICAGO, IL\nRate: $2,450',
};
const NEWER = {
  id: 2, from_address: 'ops@northstar.com', subject: 'Fresno reefer', body_snippet: 'Can do $3,500', received_at: '2026-11-14T10:00:00Z',
  reply_status: 'pending_review', match_tier: 'none', matched_load_id: null, live_reply_body: null,
};
const SENT = { id: 3, from_address: 'maria@tql.net', subject: 'L1002 weight?', received_at: '2026-11-14T08:00:00Z', reply_status: 'sent', reply_body: 'Weight: 42,000', matched_load_id: null };

let handlers;

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderScreen(start = '/inquiries') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <InquiriesScreen refreshKey={0} />
      <Where />
    </MemoryRouter>
  );
}

const row = (name) => screen.getByRole('button', { name: new RegExp(`^open inquiry from ${name}`, 'i') });

describe('withRateLine', () => {
  test('adds and removes the rate line', () => {
    expect(withRateLine('PU: A', true, 2450)).toBe('PU: A\nRate: $2,450');
    expect(withRateLine('PU: A\nRate: $2,450', false, 2450)).toBe('PU: A');
  });
});

describe('InquiriesScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete window.matchMedia;
    resetMapStore();
    handlers = {};
    inquiriesApi.listInquiries.mockResolvedValue([NEWER, OLDER, SENT]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'me@igt.com', autoSendEnabled: false });
    statsApi.getToday.mockResolvedValue(null);
    loadsApi.listLoads.mockResolvedValue([]);
    liveSocket.subscribe.mockImplementation((event, handler) => {
      handlers[event] = handler;
      return () => {};
    });
  });

  test('lists waiting inquiries newest first and counts them', async () => {
    renderScreen();
    await screen.findByText('Redline Haul');
    const rows = screen.getAllByTestId('inquiry-row');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('ops@northstar.com'), expect.stringContaining('Redline Haul')]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 need a reply');
    expect(within(rows[0]).getByText('No load matched')).toBeInTheDocument();
  });

  test('All shows every inquiry with what happened to it', async () => {
    renderScreen();
    await screen.findByText('Redline Haul');
    fireEvent.click(screen.getByRole('button', { name: /^all 3$/i }));
    expect(screen.getAllByTestId('inquiry-row')).toHaveLength(3);
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  test('search narrows the list', async () => {
    renderScreen();
    await screen.findByText('Redline Haul');
    fireEvent.change(screen.getByLabelText('Search inquiries'), { target: { value: 'fresno' } });
    expect(screen.getAllByTestId('inquiry-row')).toHaveLength(1);
  });

  test('draws the matched loads on the map, and hovering one focuses its lane', async () => {
    renderScreen();
    await screen.findByText('Redline Haul');
    await waitFor(() => expect(getState().lanes.map((lane) => lane.id)).toEqual([11]));
    fireEvent.pointerEnter(row('Redline Haul').closest('li'));
    await waitFor(() => expect(getState().focusId).toBe(11));
  });

  test('opening one shows their message, the matched load and an editable reply', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /^open inquiry from redline haul/i }));
    const sheet = screen.getByRole('dialog', { name: /inquiry from redline haul/i });
    expect(sheet).toHaveTextContent('Is Chicago still open? Can do $2,300.');
    expect(sheet).toHaveTextContent('Chicago, IL');
    expect(within(sheet).getByLabelText('Reply')).toHaveValue('PU: CHICAGO, IL\nRate: $2,450');
    expect(screen.getByTestId('path')).toHaveTextContent('/inquiries/1');
  });

  test('sending sends the edited reply and moves on to the next waiting inquiry', async () => {
    inquiriesApi.sendInquiryReply.mockResolvedValue({ ...OLDER, reply_status: 'sent' });
    renderScreen('/inquiries/1');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from redline haul/i });
    fireEvent.change(within(sheet).getByLabelText('Reply'), { target: { value: 'Still open, $2,450.' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(inquiriesApi.sendInquiryReply).toHaveBeenCalledWith(1, 'Still open, $2,450.'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/inquiries/2'));
  });

  test('Ctrl+Enter in the reply sends it', async () => {
    inquiriesApi.sendInquiryReply.mockResolvedValue({ ...OLDER, reply_status: 'sent' });
    renderScreen('/inquiries/1');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from redline haul/i });
    fireEvent.keyDown(within(sheet).getByLabelText('Reply'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(inquiriesApi.sendInquiryReply).toHaveBeenCalledWith(1, OLDER.live_reply_body));
  });

  test('the rate switch takes the rate line out of the reply', async () => {
    renderScreen('/inquiries/1');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from redline haul/i });
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Include rate on send' }));
    expect(within(sheet).getByLabelText('Reply')).toHaveValue('PU: CHICAGO, IL');
  });

  test('a failed send shows the error in the sheet', async () => {
    inquiriesApi.sendInquiryReply.mockRejectedValue(new Error('Gmail account is no longer connected'));
    renderScreen('/inquiries/1');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from redline haul/i });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send reply' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Gmail account is no longer connected');
  });

  test('Reject rejects it', async () => {
    inquiriesApi.rejectInquiry.mockResolvedValue({ ...OLDER, reply_status: 'rejected' });
    renderScreen('/inquiries/1');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from redline haul/i });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(inquiriesApi.rejectInquiry).toHaveBeenCalledWith(1));
  });

  test('an unmatched inquiry can be matched to a load', async () => {
    loadsApi.listLoads.mockResolvedValue([{ id: 22, load_number: 'L2002', origin_city: 'Fresno', origin_state: 'CA', dest_city: 'Denver', dest_state: 'CO' }]);
    inquiriesApi.reassignInquiry.mockResolvedValue({ ...NEWER, matched_load_id: 22, match_tier: 'manual', live_reply_body: 'PU: FRESNO, CA' });
    renderScreen('/inquiries/2');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from ops@northstar.com/i });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Pick the load' }));
    fireEvent.click(await within(sheet).findByText(/L2002/));
    await waitFor(() => expect(inquiriesApi.reassignInquiry).toHaveBeenCalledWith(2, 22));
    await waitFor(() => expect(within(sheet).getByLabelText('Reply')).toHaveValue('PU: FRESNO, CA'));
  });

  test('a sent inquiry shows what was sent and cannot be sent again', async () => {
    renderScreen('/inquiries/3');
    const sheet = await screen.findByRole('dialog', { name: /inquiry from maria@tql.net/i });
    expect(sheet).toHaveTextContent('Weight: 42,000');
    expect(within(sheet).queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument();
  });

  test('selected inquiries can be sent together', async () => {
    inquiriesApi.bulkSendInquiries.mockResolvedValue({ results: [{ id: 1, ok: true }, { id: 2, ok: true }] });
    renderScreen();
    await screen.findByText('Redline Haul');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send 2' }));
    await waitFor(() => expect(inquiriesApi.bulkSendInquiries).toHaveBeenCalledWith([{ id: 2, body: '' }, { id: 1, body: OLDER.live_reply_body }]));
    await waitFor(() => expect(screen.queryAllByTestId('inquiry-row')).toHaveLength(0));
  });

  test('a new inquiry appears live', async () => {
    renderScreen();
    await screen.findByText('Redline Haul');
    act(() => handlers['inquiry:new']({ id: 4, from_address: 'new@carrier.com', subject: 'Anything to Denver?', received_at: '2026-11-14T11:00:00Z', reply_status: 'pending_review' }));
    expect(screen.getByText('new@carrier.com')).toBeInTheDocument();
  });

  test('on a wide screen, shows the connected inbox beside the list', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    renderScreen();
    expect(await screen.findByText('me@igt.com')).toBeInTheDocument();
  });
});
