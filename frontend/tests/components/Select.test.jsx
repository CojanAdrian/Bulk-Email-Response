import { useState } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Select from '../../src/components/Select';

const OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'booked', label: 'Booked' },
  { value: 'covered', label: 'Covered' },
];

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState('active');
  return (
    <Select
      ariaLabel="Status"
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('Select', () => {
  test('shows the current choice and picks a new one by click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Status' });
    expect(trigger).toHaveTextContent('Active');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Active' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'Booked' }));
    expect(onChange).toHaveBeenCalledWith('booked');
    expect(trigger).toHaveTextContent('Booked');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('is fully keyboard driven: arrows move, Enter picks, Escape closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Status' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/opt-2$/);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('covered');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('typing a letter jumps to the matching option', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Status' }), { key: 'b' });
    expect(onChange).toHaveBeenCalledWith('booked');
  });
});
