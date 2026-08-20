import { useState } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExtraStopsEditor from '../../src/components/ExtraStopsEditor';

// ExtraStopsEditor is fully controlled (no internal state) -- a multi-step
// interaction (pick a day, then pick a time) needs the parent to actually
// re-render with the updated stops in between, the same way RateModal's own
// state does in real usage.
function ControlledWrapper({ initialStops }) {
  const [stops, setStops] = useState(initialStops);
  return <ExtraStopsEditor stops={stops} onChange={setStops} />;
}

describe('ExtraStopsEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1)); // Aug 1, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  test('picking a date/time via the popover updates only that row\'s datetime', () => {
    render(<ControlledWrapper initialStops={[{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: '' }]} />);

    fireEvent.click(screen.getByRole('button', { name: /stop 1 date\/time/i }));
    fireEvent.click(screen.getByRole('button', { name: '2026-08-14' }));
    fireEvent.click(screen.getByRole('button', { name: /set time to 10:00 am/i }));

    expect(screen.getByRole('button', { name: /stop 1 date\/time/i })).toHaveTextContent('Aug 14, 10am');
  });
});
