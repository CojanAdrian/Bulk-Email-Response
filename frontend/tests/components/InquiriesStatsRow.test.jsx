import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import InquiriesStatsRow from '../../src/components/InquiriesStatsRow';
import * as inquiriesApi from '../../src/api/inquiries';
import * as gmailApi from '../../src/api/gmail';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/api/gmail');
vi.mock('../../src/lib/liveSocket');

const INQUIRIES = [
  { id: 1, reply_status: 'pending_review' },
  { id: 2, reply_status: 'pending_review' },
  { id: 3, reply_status: 'auto_sent' },
];

describe('InquiriesStatsRow', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('shows pending/auto-sent counts and the Gmail connection status', async () => {
    inquiriesApi.listInquiries.mockResolvedValue(INQUIRIES);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'a@b.com' });
    render(<InquiriesStatsRow refreshKey={0} />);

    expect(inquiriesApi.listInquiries).toHaveBeenCalledWith();
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  test('shows "Not connected" when no Gmail account is linked', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(<InquiriesStatsRow refreshKey={0} />);
    await waitFor(() => expect(screen.getByText('Not connected')).toBeInTheDocument());
  });

  test('renders nothing while the inquiries fetch is pending or fails', async () => {
    inquiriesApi.listInquiries.mockRejectedValue(new Error('network error'));
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    const { container } = render(<InquiriesStatsRow refreshKey={0} />);
    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container).toBeEmptyDOMElement();
  });

  test('refetches when a live inquiry:new or gmail:status event arrives', async () => {
    inquiriesApi.listInquiries.mockResolvedValue(INQUIRIES);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(<InquiriesStatsRow refreshKey={0} />);
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(1));

    act(() => {
      liveHandlers['inquiry:new']({ id: 9, reply_status: 'pending_review' });
    });
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(2));

    act(() => {
      liveHandlers['gmail:status']({ connected: true });
    });
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  });
});
