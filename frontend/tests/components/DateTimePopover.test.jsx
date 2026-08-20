import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateTimePopover from '../../src/components/DateTimePopover';

describe('DateTimePopover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows a placeholder when no value is set', () => {
    render(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /stop 1 date\/time/i })).toHaveTextContent('Set date & time');
  });

  test('shows the formatted value once set', () => {
    render(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="2026-08-24T14:00" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /stop 1 date\/time/i })).toHaveTextContent('Aug 24, 2pm');
  });

  test('the calendar is closed until the trigger is clicked', () => {
    render(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /stop 1 date\/time/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('picking a day and a time calls onChange and the value flows back through', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /stop 1 date\/time/i }));
    fireEvent.click(screen.getByRole('button', { name: '2026-08-14' }));
    expect(onChange).toHaveBeenCalledWith('2026-08-14T08:00');

    rerender(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="2026-08-14T08:00" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /stop 1 date\/time/i })).toHaveTextContent('Aug 14, 8am');
  });

  test('pressing Escape closes the popover', () => {
    render(<DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /stop 1 date\/time/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('clicking outside the popover closes it', () => {
    render(
      <div>
        <DateTimePopover id="t" ariaLabel="Stop 1 date/time" value="" onChange={vi.fn()} />
        <button>outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /stop 1 date\/time/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
