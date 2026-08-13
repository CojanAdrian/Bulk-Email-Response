import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateTimeField from '../../src/components/DateTimeField';

describe('DateTimeField', () => {
  test('renders a labeled datetime-local input that forwards raw edits as-is', () => {
    const onChange = vi.fn();
    render(<DateTimeField id="earlyPu" label="Early pickup" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/early pickup/i), { target: { value: '2026-08-14T08:00' } });
    expect(onChange).toHaveBeenCalledWith('2026-08-14T08:00');
  });

  test('clicking a quick-time preset sets the time portion and keeps the existing date', () => {
    const onChange = vi.fn();
    render(<DateTimeField id="earlyPu" label="Early pickup" value="2026-08-14T05:00" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /set time to 2:00 pm/i }));
    expect(onChange).toHaveBeenCalledWith('2026-08-14T14:00');
  });

  test('clicking a quick-time preset with no date set defaults to today\'s date', () => {
    const onChange = vi.fn();
    render(<DateTimeField id="earlyPu" label="Early pickup" value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /set time to 6:00 am/i }));
    const [calledValue] = onChange.mock.calls[0];
    expect(calledValue).toMatch(/^\d{4}-\d{2}-\d{2}T06:00$/);
  });

  test('supports an aria-label override instead of a visible label, for repeated rows', () => {
    const onChange = vi.fn();
    render(<DateTimeField id="stop-1-datetime" ariaLabel="Stop 1 date/time" value="" onChange={onChange} />);
    expect(screen.getByLabelText(/stop 1 date\/time/i)).toBeInTheDocument();
  });
});
