import { useState } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DateRangeField from '../../src/components/DateRangeField';
import { buildPUSched } from '../../src/lib/datExport';

function Wrapper({ formatRange = buildPUSched }) {
  const [early, setEarly] = useState('');
  const [late, setLate] = useState('');
  return (
    <DateRangeField
      legend="Pickup"
      earlyId="earlyPu"
      lateId="latePu"
      earlyValue={early}
      lateValue={late}
      onEarlyChange={setEarly}
      onLateChange={setLate}
      formatRange={formatRange}
    />
  );
}

describe('DateRangeField', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows a placeholder when neither date is set', () => {
    render(<Wrapper />);
    expect(screen.getByRole('button', { name: /set pickup window/i })).toBeInTheDocument();
  });

  test('opens a dialog with separate Early and Late groups', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /set pickup window/i }));
    expect(screen.getByRole('dialog', { name: /pickup window/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Early' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Late' })).toBeInTheDocument();
  });

  test('picking early and late dates updates the trigger label to match the table format', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /set pickup window/i }));

    const early = within(screen.getByRole('group', { name: 'Early' }));
    fireEvent.click(early.getByRole('button', { name: '2026-08-24' }));
    fireEvent.click(early.getByRole('button', { name: /set time to 2:00 am/i }));

    const late = within(screen.getByRole('group', { name: 'Late' }));
    fireEvent.click(late.getByRole('button', { name: '2026-08-24' }));
    fireEvent.click(late.getByRole('button', { name: /set time to 10:00 am/i }));

    expect(screen.getByRole('button', { name: /08\/24\/2026 2am - 10am FCFS/i })).toBeInTheDocument();
  });

  test('"Same as early (appt)" is disabled until an early value is set', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /set pickup window/i }));
    expect(screen.getByRole('button', { name: /same as early/i })).toBeDisabled();

    const early = within(screen.getByRole('group', { name: 'Early' }));
    fireEvent.click(early.getByRole('button', { name: '2026-08-24' }));
    expect(screen.getByRole('button', { name: /same as early/i })).toBeEnabled();
  });

  test('"Same as early (appt)" copies the early value onto late, producing an appt label', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /set pickup window/i }));

    const early = within(screen.getByRole('group', { name: 'Early' }));
    fireEvent.click(early.getByRole('button', { name: '2026-08-24' }));
    fireEvent.click(early.getByRole('button', { name: /set time to 10:00 am/i }));
    fireEvent.click(screen.getByRole('button', { name: /same as early/i }));

    expect(screen.getByRole('button', { name: /08\/24\/2026 10am appt/i })).toBeInTheDocument();
  });

  test('closes on Escape', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /set pickup window/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
