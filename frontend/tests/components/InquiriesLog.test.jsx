import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import InquiriesLog from '../../src/components/InquiriesLog';
import * as inquiriesApi from '../../src/api/inquiries';

vi.mock('../../src/api/inquiries');

describe('InquiriesLog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('fetches all inquiries with no filter', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<InquiriesLog />);
    await waitFor(() => {
      expect(inquiriesApi.listInquiries).toHaveBeenCalledWith();
    });
  });

  test('shows an empty state when there are no inquiries', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<InquiriesLog />);
    await waitFor(() => {
      expect(screen.getByText(/no inquiries yet/i)).toBeInTheDocument();
    });
  });

  test('renders a row per inquiry with a human-readable reply status badge', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      {
        id: 1, from_address: 'dispatch@carrierco.com', subject: 'Load #4521', match_tier: 'load_number',
        reply_status: 'auto_sent', received_at: '2026-08-08T14:02:00.000Z',
      },
      {
        id: 2, from_address: 'other@carrier.com', subject: 'Anything from Dallas?', match_tier: 'city_state',
        reply_status: 'pending_review', received_at: '2026-08-08T15:00:00.000Z',
      },
    ]);
    render(<InquiriesLog />);
    await waitFor(() => screen.getByText('dispatch@carrierco.com'));

    expect(screen.getByText('Auto-sent')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('other@carrier.com')).toBeInTheDocument();
  });

  test('re-fetches when refreshKey changes', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    const { rerender } = render(<InquiriesLog refreshKey={0} />);
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(1));

    rerender(<InquiriesLog refreshKey={1} />);
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(2));
  });

  test('shows an error message when the fetch fails', async () => {
    inquiriesApi.listInquiries.mockRejectedValue(new Error('Network error'));
    render(<InquiriesLog />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });
});
