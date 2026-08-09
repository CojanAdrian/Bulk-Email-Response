import { describe, test, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import GmailConnectionPanel from '../../src/components/GmailConnectionPanel';
import * as gmailApi from '../../src/api/gmail';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/gmail');
vi.mock('../../src/lib/liveSocket');

describe('GmailConnectionPanel', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    delete window.location;
    window.location = { href: '' };
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('shows a Connect button when no account is connected', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(<GmailConnectionPanel />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect gmail/i })).toBeInTheDocument();
    });
  });

  test('navigates the browser to the connect URL when Connect is clicked', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    gmailApi.getGmailConnectUrl.mockReturnValue('http://localhost:4000/api/gmail/connect');
    render(<GmailConnectionPanel />);
    await waitFor(() => screen.getByRole('button', { name: /connect gmail/i }));

    fireEvent.click(screen.getByRole('button', { name: /connect gmail/i }));
    expect(window.location.href).toBe('http://localhost:4000/api/gmail/connect');
  });

  test('shows the connected address when an account is connected', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'kenny@igtfreight.com' });
    render(<GmailConnectionPanel />);
    await waitFor(() => {
      expect(screen.getByText('kenny@igtfreight.com')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^disconnect$/i })).toBeInTheDocument();
  });

  test('requires a confirm step before actually disconnecting', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'kenny@igtfreight.com' });
    render(<GmailConnectionPanel />);
    await waitFor(() => screen.getByRole('button', { name: /^disconnect$/i }));

    fireEvent.click(screen.getByRole('button', { name: /^disconnect$/i }));
    expect(screen.getByText(/disconnect this gmail account/i)).toBeInTheDocument();
    expect(gmailApi.disconnectGmail).not.toHaveBeenCalled();
  });

  test('disconnects and refreshes status after confirming', async () => {
    gmailApi.getGmailStatus
      .mockResolvedValueOnce({ connected: true, gmailAddress: 'kenny@igtfreight.com' })
      .mockResolvedValueOnce({ connected: false });
    gmailApi.disconnectGmail.mockResolvedValue({ ok: true });
    render(<GmailConnectionPanel />);
    await waitFor(() => screen.getByRole('button', { name: /^disconnect$/i }));

    fireEvent.click(screen.getByRole('button', { name: /^disconnect$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm disconnect/i }));

    await waitFor(() => {
      expect(gmailApi.disconnectGmail).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect gmail/i })).toBeInTheDocument();
    });
  });

  test('shows an error message when the status fetch fails', async () => {
    gmailApi.getGmailStatus.mockRejectedValue(new Error('Network error'));
    render(<GmailConnectionPanel />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  test('a live gmail:status event applies the pushed status directly, without a refetch', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(<GmailConnectionPanel />);
    await waitFor(() => screen.getByRole('button', { name: /connect gmail/i }));
    gmailApi.getGmailStatus.mockClear();

    act(() => {
      liveHandlers['gmail:status']({ connected: true, gmailAddress: 'pushed@igtfreight.com' });
    });

    expect(screen.getByText('pushed@igtfreight.com')).toBeInTheDocument();
    expect(gmailApi.getGmailStatus).not.toHaveBeenCalled();
  });

  // Regression test for a real bug: React 18 StrictMode deliberately mounts
  // -> cleans up -> re-mounts every component once in development. The old
  // isMountedRef.current = false set by that first simulated cleanup was
  // never reset back to true on the real second mount, so every fetchStatus()
  // result afterward was silently dropped and the panel stayed on "Checking
  // connection..." forever -- exactly what a user saw in the running app,
  // even though every other (non-StrictMode) test here passed.
  test('resolves out of the loading state even under React StrictMode\'s dev-only double-mount', async () => {
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    render(
      <StrictMode>
        <GmailConnectionPanel />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect gmail/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/checking connection/i)).not.toBeInTheDocument();
  });
});
