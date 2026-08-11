import { describe, test, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ReviewQueue from '../../src/components/ReviewQueue';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

const INQUIRY = {
  id: 1,
  from_address: 'dispatch@carrierco.com',
  subject: 'Dallas load?',
  reply_body: 'Hi,\n\nYes, load #4521 is still available.',
};

describe('ReviewQueue', () => {
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

  test('fetches only pending_review inquiries', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => {
      expect(inquiriesApi.listInquiries).toHaveBeenCalledWith('pending_review');
    });
  });

  test('shows an empty state when the queue is empty', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => {
      expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument();
    });
  });

  test('renders each inquiry with an editable, pre-filled reply textarea', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));
    expect(screen.getByText(/dallas load\?/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reply/i)).toHaveValue(INQUIRY.reply_body);
  });

  test('shows a "Different load?" badge when ref_mismatch is set', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY, ref_mismatch: 1 }]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText(/different load\?/i)).toBeInTheDocument();
  });

  test('does not show the "Different load?" badge when ref_mismatch is 0', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY, ref_mismatch: 0 }]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.queryByText(/different load\?/i)).not.toBeInTheDocument();
  });

  test('shows a red multi-stop badge when the matched load has extra stops', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY, matched_load_stops: 1 }]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText(/multi-stop/i)).toBeInTheDocument();
  });

  test('does not show the multi-stop badge when the matched load has no extra stops', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY, matched_load_stops: 0 }]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.queryByText(/multi-stop/i)).not.toBeInTheDocument();
  });

  test('labels the badge MULTI-PICK when the matched load\'s comment mentions a second pickup', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { ...INQUIRY, matched_load_stops: 1, matched_load_comment: '2nd pickup in Fort Worth' },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText(/multi-pick/i)).toBeInTheDocument();
  });

  test('labels the badge MULTI-DROP when the matched load\'s comment mentions a second delivery', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { ...INQUIRY, matched_load_stops: 1, matched_load_comment: '2nd delivery in Joliet' },
    ]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText(/multi-drop/i)).toBeInTheDocument();
  });

  test('sends the edited textarea content, not the original draft, when Send is clicked', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    inquiriesApi.sendInquiryReply.mockResolvedValue({ id: 1, reply_status: 'sent' });
    render(<ReviewQueue />);
    await waitFor(() => screen.getByLabelText(/reply/i));

    fireEvent.change(screen.getByLabelText(/reply/i), { target: { value: 'An edited reply.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(inquiriesApi.sendInquiryReply).toHaveBeenCalledWith(1, 'An edited reply.');
    });
  });

  test('removes the inquiry from the list after a successful send', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    inquiriesApi.sendInquiryReply.mockResolvedValue({ id: 1, reply_status: 'sent' });
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.queryByText('dispatch@carrierco.com')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument();
  });

  test('removes the inquiry from the list after a successful reject, without sending anything', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    inquiriesApi.rejectInquiry.mockResolvedValue({ id: 1, reply_status: 'rejected' });
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() => {
      expect(screen.queryByText('dispatch@carrierco.com')).not.toBeInTheDocument();
    });
    expect(inquiriesApi.sendInquiryReply).not.toHaveBeenCalled();
  });

  test('shows an error and keeps the inquiry in the list when sending fails', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    inquiriesApi.sendInquiryReply.mockRejectedValue(new Error('Gmail account is no longer connected'));
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Gmail account is no longer connected');
    });
    expect(screen.getByText('dispatch@carrierco.com')).toBeInTheDocument();
  });

  test('shows an error when the initial fetch fails', async () => {
    inquiriesApi.listInquiries.mockRejectedValue(new Error('Network error'));
    render(<ReviewQueue />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  test('a live inquiry:new event prepends a pending_review inquiry to the list', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText(/nothing waiting for review/i));

    act(() => {
      liveHandlers['inquiry:new']({ id: 9, from_address: 'new@carrier.com', subject: 'New load?', reply_body: 'draft', reply_status: 'pending_review' });
    });

    expect(screen.getByText('new@carrier.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/reply/i)).toHaveValue('draft');
  });

  test('a live inquiry:new event for a non-pending inquiry is ignored', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText(/nothing waiting for review/i));

    act(() => {
      liveHandlers['inquiry:new']({ id: 9, from_address: 'new@carrier.com', reply_status: 'auto_sent' });
    });

    expect(screen.queryByText('new@carrier.com')).not.toBeInTheDocument();
  });

  test('a live inquiry:updated event removes the inquiry once it is no longer pending_review', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    act(() => {
      liveHandlers['inquiry:updated']({ ...INQUIRY, reply_status: 'sent' });
    });

    expect(screen.queryByText('dispatch@carrierco.com')).not.toBeInTheDocument();
  });

  // Regression test: see GmailConnectionPanel.test.jsx's StrictMode test for
  // the full explanation. Here the same stale-ref bug would have left the
  // queue stuck loading forever, and Send/Reject clicks would silently do
  // nothing (button stuck on "Sending...") in development.
  test('loads and reacts to Send under React StrictMode\'s dev-only double-mount', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY]);
    inquiriesApi.sendInquiryReply.mockResolvedValue({ id: 1, reply_status: 'sent' });
    render(
      <StrictMode>
        <ReviewQueue />
      </StrictMode>
    );

    await waitFor(() => screen.getByText('dispatch@carrierco.com'));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.queryByText('dispatch@carrierco.com')).not.toBeInTheDocument();
    });
  });
});
