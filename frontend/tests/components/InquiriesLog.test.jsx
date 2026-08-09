import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import InquiriesLog from '../../src/components/InquiriesLog';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

describe('InquiriesLog', () => {
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

  test('a live inquiry:new event prepends a row', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<InquiriesLog />);
    await waitFor(() => screen.getByText(/no inquiries yet/i));

    act(() => {
      liveHandlers['inquiry:new']({
        id: 5, from_address: 'live@carrier.com', subject: 'Live one', match_tier: 'none',
        reply_status: 'pending_review', received_at: '2026-08-09T10:00:00.000Z',
      });
    });

    expect(screen.getByText('live@carrier.com')).toBeInTheDocument();
  });

  test('a live inquiry:updated event replaces the matching row in place', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([
      { id: 1, from_address: 'carrier@example.com', subject: 'Subj', match_tier: 'none', reply_status: 'pending_review', received_at: '2026-08-09T10:00:00.000Z' },
    ]);
    render(<InquiriesLog />);
    await waitFor(() => screen.getByText('carrier@example.com'));

    act(() => {
      liveHandlers['inquiry:updated']({
        id: 1, from_address: 'carrier@example.com', subject: 'Subj', match_tier: 'none',
        reply_status: 'sent', received_at: '2026-08-09T10:00:00.000Z',
      });
    });

    expect(screen.getByText('Sent')).toBeInTheDocument();
  });
});
