import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useInquiryAlerts } from '../../src/components/InquiryAlertBanner';

// jsdom doesn't run real animation frames, so AnimatePresence's exit
// animation never completes under fake timers -- see the identical note in
// Toast.test.jsx. Swapped for instant passthrough equivalents so this file
// tests the alert queue's own behavior, not Framer Motion's timing.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => children,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...rest }) => <div {...rest}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

function TestHarness({ onReady }) {
  const { pushAlert, viewport } = useInquiryAlerts();
  onReady(pushAlert);
  return viewport;
}

describe('useInquiryAlerts', () => {
  test('renders a pushed alert as role="alert" with its message', () => {
    let pushAlert;
    render(<TestHarness onReady={(fn) => (pushAlert = fn)} />);

    act(() => {
      pushAlert('New inquiry from carrier@example.com');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('New inquiry from carrier@example.com');
  });

  test('clicking the alert calls onView and dismisses it', () => {
    let pushAlert;
    const onView = vi.fn();
    render(<TestHarness onReady={(fn) => (pushAlert = fn)} />);

    act(() => {
      pushAlert('New inquiry from carrier@example.com', { onView });
    });
    fireEvent.click(screen.getByText('New inquiry from carrier@example.com'));

    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('the dismiss button removes the alert without calling onView', () => {
    let pushAlert;
    const onView = vi.fn();
    render(<TestHarness onReady={(fn) => (pushAlert = fn)} />);

    act(() => {
      pushAlert('New inquiry from carrier@example.com', { onView });
    });
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onView).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('auto-dismisses after its duration elapses', async () => {
    vi.useFakeTimers();
    let pushAlert;
    render(<TestHarness onReady={(fn) => (pushAlert = fn)} />);

    act(() => {
      pushAlert('New inquiry from carrier@example.com');
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test('stacks multiple alerts when several arrive before either is dismissed', () => {
    let pushAlert;
    render(<TestHarness onReady={(fn) => (pushAlert = fn)} />);

    act(() => {
      pushAlert('New inquiry from carrierA@example.com');
      pushAlert('New inquiry from carrierB@example.com');
    });

    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});
