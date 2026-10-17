import { useState } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateField, { parseDateInput } from '../../src/components/DateField';

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState('');
  return (
    <DateField
      ariaLabel="From date"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('parseDateInput', () => {
  test('accepts US and ISO formats and rejects impossible dates', () => {
    expect(parseDateInput('1/5/2026')).toBe('2026-01-05');
    expect(parseDateInput('2026-01-05')).toBe('2026-01-05');
    expect(parseDateInput('02/30/2026')).toBeNull();
    expect(parseDateInput('soon')).toBeNull();
  });
});

describe('DateField', () => {
  test('typing a full date reports it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '10/17/2026' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-17');
  });

  test('the calendar picks a day and closes; Clear empties it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /open calendar for from date/i }));
    const anyDay = screen.getAllByRole('button').find((b) => /^\d{4}-\d{2}-15$/.test(b.getAttribute('aria-label') || ''));
    fireEvent.click(anyDay);
    expect(onChange).toHaveBeenLastCalledWith(anyDay.getAttribute('aria-label'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('From date').value).toMatch(/^\d{2}\/15\/\d{4}$/);

    fireEvent.click(screen.getByRole('button', { name: /open calendar for from date/i }));
    fireEvent.click(screen.getByRole('button', { name: /clear date/i }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  test('arrow keys move between days and Enter picks', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /open calendar for from date/i }));
    const grid = screen.getByRole('grid');
    const start = grid.querySelector('[tabindex="0"]').getAttribute('data-day');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    const [y, m, d] = start.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const expected = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });
});
