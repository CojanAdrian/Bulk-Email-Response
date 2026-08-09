import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGmailConnected } from '../../src/lib/useGmailConnected';
import * as gmailApi from '../../src/api/gmail';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/gmail');
vi.mock('../../src/lib/liveSocket');

describe('useGmailConnected', () => {
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
    gmailApi.getGmailStatus.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useGmailConnected());
    expect(result.current).toBeNull();
  });

  test('resolves to true when connected', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'a@b.com' });
    const { result } = renderHook(() => useGmailConnected());
    await waitFor(() => expect(result.current).toBe(true));
  });

  test('resolves to false when not connected', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    const { result } = renderHook(() => useGmailConnected());
    await waitFor(() => expect(result.current).toBe(false));
  });

  test('stays null when the fetch fails', async () => {
    gmailApi.getGmailStatus.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useGmailConnected());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeNull();
  });

  test('updates live when a gmail:status event arrives', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    const { result } = renderHook(() => useGmailConnected());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      liveHandlers['gmail:status']({ connected: true });
    });

    expect(result.current).toBe(true);
  });
});
