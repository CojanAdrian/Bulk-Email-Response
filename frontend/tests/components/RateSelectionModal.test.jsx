import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RateSelectionModal from '../../src/components/RateSelectionModal';

const LOADS = [
  { id: 1, load_number: 'L1', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', target_pay: 1500 },
  { id: 2, load_number: 'L2', origin_city: 'Atlanta', origin_state: 'GA', dest_city: 'Miami', dest_state: 'FL', target_pay: null },
];

describe('RateSelectionModal', () => {
  test('defaults every load to checked, pre-filled with its own target pay', () => {
    const onConfirm = vi.fn();
    render(<RateSelectionModal loads={LOADS} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      1: { include: true, value: 1500 },
      2: { include: true, value: '' },
    });
  });

  test('unchecking a single row excludes it without affecting others', () => {
    const onConfirm = vi.fn();
    render(<RateSelectionModal loads={LOADS} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /include rate for l1/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    const result = onConfirm.mock.calls[0][0];
    expect(result[1].include).toBe(false);
    expect(result[2].include).toBe(true);
  });

  test('select-all unchecks and rechecks every row', () => {
    const onConfirm = vi.fn();
    render(<RateSelectionModal loads={LOADS} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /^select all$/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    const result = onConfirm.mock.calls[0][0];
    expect(result[1].include).toBe(false);
    expect(result[2].include).toBe(false);
  });

  test('editing a rate value overrides the pre-filled target pay', () => {
    const onConfirm = vi.fn();
    render(<RateSelectionModal loads={LOADS} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /rate for l1/i }), { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    const result = onConfirm.mock.calls[0][0];
    expect(result[1].value).toBe('1800');
  });

  test('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<RateSelectionModal loads={LOADS} onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
