import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReviewQueue from '../../src/components/ReviewQueue';
import * as inquiriesApi from '../../src/api/inquiries';

vi.mock('../../src/api/inquiries');

const INQUIRY = {
  id: 1,
  from_address: 'dispatch@carrierco.com',
  subject: 'Dallas load?',
  reply_body: 'Hi,\n\nYes, load #4521 is still available.',
};

describe('ReviewQueue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
});
