import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ReviewQueue from '../../src/components/ReviewQueue';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

const INQUIRY_1 = {
  id: 1, from_address: 'carrierA@example.com', subject: 'Dallas load?',
  body_snippet: 'Hey, is the Dallas to Chicago van load still available?',
  reply_status: 'pending_review', reply_body: null, live_reply_body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL',
  matched_load_id: 5, match_tier: 'city_state',
  matched_load_load_number: 'L1001', matched_load_equipment: 'V',
  matched_load_origin_city: 'Dallas', matched_load_origin_state: 'TX',
  matched_load_dest_city: 'Chicago', matched_load_dest_state: 'IL',
  matched_load_early_pu: null, matched_load_late_pu: null,
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
};

const INQUIRY_2 = {
  id: 2, from_address: 'carrierB@example.com', subject: 'Chicago load?',
  body_snippet: null,
  reply_status: 'pending_review', reply_body: 'stale draft', live_reply_body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL',
  matched_load_id: null, match_tier: 'none',
  matched_load_load_number: null, matched_load_equipment: null,
  matched_load_origin_city: null, matched_load_origin_state: null,
  matched_load_dest_city: null, matched_load_dest_state: null,
  matched_load_early_pu: null, matched_load_late_pu: null,
  matched_load_target_pay: null, matched_load_include_rate: 1, matched_load_extra_stops: null,
  ref_mismatch: 0,
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

  test('seeds the draft textarea from live_reply_body, not the stale reply_body snapshot', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('PU: CHICAGO, IL\nDEL: MIAMI, FL');
  });

  test('falls back to reply_body when live_reply_body is null (no matched load)', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY_1, live_reply_body: null, reply_body: 'fallback text' }]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('fallback text');
  });

  test('a live-pushed new inquiry also seeds its draft from live_reply_body', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    render(<ReviewQueue />);
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeDefined());

    act(() => {
      liveHandlers['inquiry:new'](INQUIRY_1);
    });

    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    expect(screen.getByLabelText('Reply').value).toBe('PU: DALLAS, TX\nDEL: CHICAGO, IL');
  });

  test('fetches the queue oldest-first', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

    expect(inquiriesApi.listInquiries).toHaveBeenCalledWith('pending_review', { order: 'oldest' });
  });

  test('a live-pushed new inquiry is appended to the end, not the front (it is the newest, and the queue is oldest-first)', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeDefined());

    act(() => {
      liveHandlers['inquiry:new'](INQUIRY_2);
    });

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    const rowTexts = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rowTexts[0]).toContain('carrierA@example.com');
    expect(rowTexts[1]).toContain('carrierB@example.com');
  });

  test("shows the carrier's own message text on the card", async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText(/is the dallas to chicago van load still available/i));
  });

  test('shows a fallback when there is no captured message text', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByText(/no message text captured/i)).toBeInTheDocument();
  });

  test("shows the matched load's number, lane, and equipment", async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText(/L1001/));
    expect(screen.getByText(/Dallas, TX.*Chicago, IL/)).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
  });

  test('shows a "no load matched" message when nothing matched', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_2]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText('carrierB@example.com', { exact: false }));
    expect(screen.getByText(/no load matched/i)).toBeInTheDocument();
  });

  test('shows how long ago the inquiry was received', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    inquiriesApi.listInquiries.mockResolvedValue([{ ...INQUIRY_1, received_at: twoHoursAgo }]);
    render(<ReviewQueue />);

    await waitFor(() => screen.getByText(/2h ago/));
  });

  test('no selection circle or bulk bar shows until "Select" is clicked', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
    render(<ReviewQueue />);
    await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  describe('selection mode and bulk actions', () => {
    test('clicking "Select" reveals selection circles and "Select All"/"Done" controls', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));

      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierB@example.com' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    test('checking one inquiry shows the bulk action bar with a count of 1', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('"Select All" checks every inquiry and the count matches', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierB@example.com' })).toHaveAttribute('aria-checked', 'true');
    });

    test('"Done" exits selection mode, hiding the circles and the bulk bar', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
    });

    test('"Clear selection" empties the selection but stays in selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toBeInTheDocument();
    });

    test('bulk-sending selected inquiries calls bulkSendInquiries with each one\'s current draft text, then exits selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkSendInquiries.mockResolvedValue({
        results: [{ id: 1, ok: true }, { id: 2, ok: true }],
      });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /send 2/i }));

      await waitFor(() => {
        expect(inquiriesApi.bulkSendInquiries).toHaveBeenCalledWith([
          { id: 1, body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL' },
          { id: 2, body: 'PU: CHICAGO, IL\nDEL: MIAMI, FL' },
        ]);
      });
      await waitFor(() => {
        expect(screen.queryByText('carrierA@example.com', { exact: false })).not.toBeInTheDocument();
        expect(screen.queryByText('carrierB@example.com', { exact: false })).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    });

    test('a partial bulk-send failure keeps the failed inquiry selected in selection mode and shows an error', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkSendInquiries.mockResolvedValue({
        results: [{ id: 1, ok: true }, { id: 2, ok: false, error: 'Reply body cannot be empty.' }],
      });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /send 2/i }));

      await waitFor(() => {
        expect(screen.queryByText('carrierA@example.com', { exact: false })).not.toBeInTheDocument();
      });
      expect(screen.getByText('carrierB@example.com', { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/1 of 2/);
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    test('bulk-rejecting requires confirmation, then calls bulkRejectInquiries and exits selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1, INQUIRY_2]);
      inquiriesApi.bulkRejectInquiries.mockResolvedValue({ updated: 2 });
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));
      expect(inquiriesApi.bulkRejectInquiries).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(inquiriesApi.bulkRejectInquiries).toHaveBeenCalledWith([1, 2]);
      });
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    });

    test('clicking anywhere on a row toggles its selection while in selection mode', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByText('carrierA@example.com', { exact: false }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByText('carrierA@example.com', { exact: false }));
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
    });

    test('clicking the selection circle does not double-toggle via the row click handler', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' })).toHaveAttribute('aria-checked', 'true');
    });

    test('clicking the reply textarea or action buttons does not toggle row selection', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      inquiriesApi.rejectInquiry.mockResolvedValue({});
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByLabelText('Reply'));
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('a selected row gets a locked selected-state class distinct from an unselected row', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      const row = screen.getByText('carrierA@example.com', { exact: false }).closest('li');
      expect(row.className).not.toMatch(/border-accent/);

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      expect(row.className).toMatch(/border-accent/);
    });

    test('canceling the bulk-reject confirmation does not call bulkRejectInquiries', async () => {
      inquiriesApi.listInquiries.mockResolvedValue([INQUIRY_1]);
      render(<ReviewQueue />);
      await waitFor(() => screen.getByText('carrierA@example.com', { exact: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from carrierA@example.com' }));
      fireEvent.click(screen.getByRole('button', { name: /reject selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(inquiriesApi.bulkRejectInquiries).not.toHaveBeenCalled();
    });
  });
});
