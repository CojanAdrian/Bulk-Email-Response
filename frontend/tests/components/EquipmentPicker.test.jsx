import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EquipmentPicker from '../../src/components/EquipmentPicker';

describe('EquipmentPicker', () => {
  test('shows the current value in the input', () => {
    render(<EquipmentPicker id="equipment" value="V" onChange={vi.fn()} />);
    expect(screen.getByLabelText(/equipment/i)).toHaveValue('V');
  });

  test('opens a dropdown of every option when focused with an empty value', () => {
    render(<EquipmentPicker id="equipment" value="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByLabelText(/equipment/i));
    expect(screen.getByRole('button', { name: 'V — Van' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'R — Reefer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'F — Flatbed' })).toBeInTheDocument();
  });

  test('typing filters the dropdown by code or label', () => {
    render(<EquipmentPicker id="equipment" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText(/equipment/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sprinter' } });

    expect(screen.getByRole('button', { name: 'SP — Sprinter Van' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'V — Van' })).not.toBeInTheDocument();
  });

  test('typing a code matches by code too, not just label', () => {
    render(<EquipmentPicker id="equipment" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText(/equipment/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sd' } });

    expect(screen.getByRole('button', { name: 'SD — Step Deck' })).toBeInTheDocument();
  });

  test('clicking an option calls onChange with its code and closes the dropdown', () => {
    const onChange = vi.fn();
    render(<EquipmentPicker id="equipment" value="" onChange={onChange} />);
    const input = screen.getByLabelText(/equipment/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sprinter' } });
    fireEvent.click(screen.getByRole('button', { name: 'SP — Sprinter Van' }));

    expect(onChange).toHaveBeenCalledWith('SP');
    expect(screen.queryByRole('button', { name: 'SP — Sprinter Van' })).not.toBeInTheDocument();
  });

  test('shows no matches message when nothing matches the search', () => {
    render(<EquipmentPicker id="equipment" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText(/equipment/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzzz' } });

    expect(screen.getByText(/no matching equipment/i)).toBeInTheDocument();
  });

  test('updates its displayed value when the value prop changes externally', () => {
    const { rerender } = render(<EquipmentPicker id="equipment" value="V" onChange={vi.fn()} />);
    expect(screen.getByLabelText(/equipment/i)).toHaveValue('V');

    rerender(<EquipmentPicker id="equipment" value="R" onChange={vi.fn()} />);
    expect(screen.getByLabelText(/equipment/i)).toHaveValue('R');
  });
});
