import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RelativeTime from '../../src/components/RelativeTime';

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders nothing for a falsy value', () => {
    const { container } = render(<RelativeTime value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows "just now" for a timestamp under a minute old, muted', () => {
    render(<RelativeTime value="2026-08-01T11:59:45Z" />);
    const el = screen.getByText('just now');
    expect(el.className).toMatch(/text-text-muted/);
  });

  test('shows minutes ago, normal text, between 15 and 30 minutes', () => {
    render(<RelativeTime value="2026-08-01T11:40:00Z" />);
    const el = screen.getByText('20m ago');
    expect(el.className).toMatch(/text-text\b/);
  });

  test('shows amber between 30 and 60 minutes', () => {
    render(<RelativeTime value="2026-08-01T11:20:00Z" />);
    const el = screen.getByText('40m ago');
    expect(el.className).toMatch(/text-warning/);
  });

  test('shows red past 60 minutes, with hours and minutes', () => {
    render(<RelativeTime value="2026-08-01T10:15:00Z" />);
    const el = screen.getByText('1h 45m ago');
    expect(el.className).toMatch(/text-error/);
  });

  test('updates live as time passes, without a per-instance interval', async () => {
    render(<RelativeTime value="2026-08-01T11:59:00Z" />);
    expect(screen.getByText('1m ago')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    expect(screen.getByText('1m ago')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });
});
