import { describe, test, expect, vi, beforeEach } from 'vitest';
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
});
