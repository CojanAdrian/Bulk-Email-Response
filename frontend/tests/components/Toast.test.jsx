import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../../src/components/Toast';

// jsdom doesn't run real animation frames, so AnimatePresence's exit animation
// never completes under fake timers — this app's own behavior (which toast is
// present after which action) is what's under test here, not Framer Motion's
// animation timing, so real motion/AnimatePresence are swapped for instant
// passthrough equivalents.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => children,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...rest }) => <div {...rest}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

function Trigger({ message, onClick }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, { onClick })}>Trigger</button>;
}

describe('Toast / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders children with no toasts visible initially', () => {
    render(
      <ToastProvider>
        <p>App content</p>
      </ToastProvider>
    );
    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('showToast displays the message in an accessible status region', () => {
    render(
      <ToastProvider>
        <Trigger message="New inquiry from dispatch@carrierco.com" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByRole('status')).toHaveTextContent('New inquiry from dispatch@carrierco.com');
  });

  test('clicking the toast message calls the onClick callback and dismisses it', () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Trigger message="New inquiry" onClick={onClick} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    fireEvent.click(screen.getByRole('button', { name: /new inquiry/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('the dismiss button removes the toast without calling onClick', () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Trigger message="New inquiry" onClick={onClick} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('a toast auto-dismisses after ~4 seconds', () => {
    render(
      <ToastProvider>
        <Trigger message="New inquiry" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('multiple toasts can be shown at once', () => {
    render(
      <ToastProvider>
        <Trigger message="First" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
