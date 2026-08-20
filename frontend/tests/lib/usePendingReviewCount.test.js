import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePendingReviewCount } from '../../src/lib/usePendingReviewCount';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

describe('usePendingReviewCount', () => {
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

  test('starts as null (unknown) before the fetch resolves', () => {
    inquiriesApi.listInquiries.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePendingReviewCount());
    expect(result.current).toBeNull();
  });

  test('fetches only pending_review inquiries and resolves to the count', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { result } = renderHook(() => usePendingReviewCount());
    await waitFor(() => expect(result.current).toBe(2));
    expect(inquiriesApi.listInquiries).toHaveBeenCalledWith('pending_review');
  });

  test('resolves to 0 when the queue is empty', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    const { result } = renderHook(() => usePendingReviewCount());
    await waitFor(() => expect(result.current).toBe(0));
  });

  test('stays null when the fetch fails', async () => {
    inquiriesApi.listInquiries.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => usePendingReviewCount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeNull();
  });

  test('re-fetches when a live inquiry:new event arrives', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([]);
    const { result } = renderHook(() => usePendingReviewCount());
    await waitFor(() => expect(result.current).toBe(0));

    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }]);
    act(() => {
      liveHandlers['inquiry:new']({ id: 1, reply_status: 'pending_review' });
    });

    await waitFor(() => expect(result.current).toBe(1));
  });

  test('re-fetches when a live inquiry:updated event arrives', async () => {
    inquiriesApi.listInquiries.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => usePendingReviewCount());
    await waitFor(() => expect(result.current).toBe(1));

    inquiriesApi.listInquiries.mockResolvedValue([]);
    act(() => {
      liveHandlers['inquiry:updated']({ id: 1, reply_status: 'sent' });
    });

    await waitFor(() => expect(result.current).toBe(0));
  });
});
