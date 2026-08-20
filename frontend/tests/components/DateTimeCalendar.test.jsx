import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateTimeCalendar from '../../src/components/DateTimeCalendar';

describe('DateTimeCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1)); // Aug 1, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('clicking a day sets the date portion, defaulting the time to 8am when none is set yet', () => {
    const onChange = vi.fn();
    render(<DateTimeCalendar value="" onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByRole('button', { name: '2026-08-14' }));
    expect(onChange).toHaveBeenCalledWith('2026-08-14T08:00');
  });

  test('clicking a day keeps the existing time', () => {
    const onChange = vi.fn();
    render(<DateTimeCalendar value="2026-08-10T14:00" onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByRole('button', { name: '2026-08-20' }));
    expect(onChange).toHaveBeenCalledWith('2026-08-20T14:00');
  });

  test('clicking a quick time chip sets the time, defaulting the date to today when none is set yet', () => {
    const onChange = vi.fn();
    render(<DateTimeCalendar value="" onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByRole('button', { name: /set time to 2:00 pm/i }));
    expect(onChange).toHaveBeenCalledWith('2026-08-01T14:00');
  });

  test('the exact-time input keeps the existing date and applies an arbitrary time', () => {
    const onChange = vi.fn();
    render(<DateTimeCalendar value="2026-08-14T08:00" onChange={onChange} idPrefix="t" />);
    fireEvent.change(screen.getByLabelText(/exact time/i), { target: { value: '09:15' } });
    expect(onChange).toHaveBeenCalledWith('2026-08-14T09:15');
  });

  test('next/previous month navigation changes the visible days without changing the value', () => {
    const onChange = vi.fn();
    render(<DateTimeCalendar value="" onChange={onChange} idPrefix="t" />);
    expect(screen.getByText('August 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText('September 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('marks the selected day with aria-pressed', () => {
    render(<DateTimeCalendar value="2026-08-14T08:00" onChange={vi.fn()} idPrefix="t" />);
    expect(screen.getByRole('button', { name: '2026-08-14' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2026-08-15' })).toHaveAttribute('aria-pressed', 'false');
  });
});
