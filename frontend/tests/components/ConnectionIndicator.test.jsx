import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ConnectionIndicator from '../../src/components/ConnectionIndicator';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/lib/liveSocket');

describe('ConnectionIndicator', () => {
  let statusHandler;

  beforeEach(() => {
    statusHandler = null;
    liveSocket.subscribeStatus.mockImplementation((handler) => {
      statusHandler = handler;
      return () => {};
    });
  });

  test('shows a "connected" indicator when the socket is open', () => {
    liveSocket.getStatus.mockReturnValue('open');
    render(<ConnectionIndicator />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/connected/i);
  });

  test('shows a "reconnecting" indicator while connecting', () => {
    liveSocket.getStatus.mockReturnValue('connecting');
    render(<ConnectionIndicator />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/reconnecting/i);
  });

  test('shows an "offline" indicator when closed', () => {
    liveSocket.getStatus.mockReturnValue('closed');
    render(<ConnectionIndicator />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/offline/i);
  });

  test('updates when the live socket status changes', () => {
    liveSocket.getStatus.mockReturnValue('connecting');
    render(<ConnectionIndicator />);
    expect(screen.getByRole('status')).toHaveAccessibleName(/reconnecting/i);

    act(() => {
      statusHandler('open');
    });

    expect(screen.getByRole('status')).toHaveAccessibleName(/connected/i);
  });
});
