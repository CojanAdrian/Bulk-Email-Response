import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExtraStopsEditor from '../../src/components/ExtraStopsEditor';

describe('ExtraStopsEditor', () => {
  test('renders no rows and an "Add a stop" button when there are no stops', () => {
    render(<ExtraStopsEditor stops={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/stop 1 city/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a stop/i })).toBeInTheDocument();
  });

  test('clicking "Add a stop" appends a blank pickup row', () => {
    const onChange = vi.fn();
    render(<ExtraStopsEditor stops={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    expect(onChange).toHaveBeenCalledWith([{ type: 'pickup', city: '', state: '', datetime: '' }]);
  });

  test('editing a row\'s city updates only that row', () => {
    const onChange = vi.fn();
    const stops = [
      { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/stop 1 city/i), { target: { value: 'Waco' } });
    expect(onChange).toHaveBeenCalledWith([
      { type: 'pickup', city: 'Waco', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ]);
  });

  test('changing a row\'s type updates only the type field', () => {
    const onChange = vi.fn();
    const stops = [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' }];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/stop 1 type/i), { target: { value: 'delivery' } });
    expect(onChange).toHaveBeenCalledWith([{ type: 'delivery', city: 'Fort Worth', state: 'TX', datetime: '' }]);
  });

  test('removing a row drops only that row', () => {
    const onChange = vi.fn();
    const stops = [
      { type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' },
      { type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' },
    ];
    render(<ExtraStopsEditor stops={stops} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/remove stop 1/i));
    expect(onChange).toHaveBeenCalledWith([{ type: 'delivery', city: 'Joliet', state: 'IL', datetime: '' }]);
  });
});
