import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StateSelect from '../../src/components/StateSelect';

describe('StateSelect', () => {
  test('typing a valid two-letter code commits immediately, uppercased', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    expect(onChange).toHaveBeenCalledWith('TX');
  });

  test('typing an invalid state and blurring shows an error and does not call onChange', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Texs' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid us state/i);
    expect(screen.getByLabelText('State')).toHaveValue('Texs');
  });

  test('typing a full state name and blurring resolves to the code', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Texas' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).toHaveBeenCalledWith('TX');
  });

  test('clicking a dropdown option commits that state', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Cali' } });
    fireEvent.click(screen.getByRole('option', { name: /CA.*California/ }));
    expect(onChange).toHaveBeenCalledWith('CA');
  });

  test('clearing the field and blurring commits an empty value without an error', () => {
    const onChange = vi.fn();
    render(<StateSelect id="s" ariaLabel="State" value="TX" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('State'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('reflects an externally-changed value prop', () => {
    const { rerender } = render(<StateSelect id="s" ariaLabel="State" value="TX" onChange={vi.fn()} />);
    expect(screen.getByLabelText('State')).toHaveValue('TX');
    rerender(<StateSelect id="s" ariaLabel="State" value="IL" onChange={vi.fn()} />);
    expect(screen.getByLabelText('State')).toHaveValue('IL');
  });
});

describe('StateSelect keyboard', () => {
  test('arrow keys move through matching states and Enter commits the highlighted one', async () => {
    const { default: StateSelect } = await import('../../src/components/StateSelect');
    const onChange = vi.fn();
    render(<StateSelect ariaLabel="Origin state" value="" onChange={onChange} />);
    const input = screen.getByLabelText('Origin state');
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^N[A-Z]$/));
    expect(onChange.mock.calls.at(-1)[0]).not.toBe('');
  });
});
