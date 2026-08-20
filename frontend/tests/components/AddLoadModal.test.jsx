import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AddLoadModal from '../../src/components/AddLoadModal';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

describe('AddLoadModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('shows an error and does not call the API when load # is blank', async () => {
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));
    await waitFor(() => {
      expect(screen.getByText(/load # is required/i)).toBeInTheDocument();
    });
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });

  test('creates a load with only load_number set, leaving rate and comment blank', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 1, load_number: 'L1001' });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(loadsApi.createLoad).toHaveBeenCalledWith(expect.objectContaining({
        load_number: 'L1001', target_pay: null, comment: null, include_rate: true,
      }));
      expect(onCreated).toHaveBeenCalledWith({ id: 1, load_number: 'L1001' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('creates a load with the full set of fields, including early/late delivery and a picked equipment type', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1)); // Aug 1, 2026 -- day 14 is visible without navigating months
    loadsApi.createLoad.mockResolvedValue({ id: 2, load_number: 'L2002' });
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L2002' } });
    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    const [originState, destState] = screen.getAllByLabelText(/^state$/i);
    fireEvent.change(originState, { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/dest city/i), { target: { value: 'Chicago' } });
    fireEvent.change(destState, { target: { value: 'IL' } });

    fireEvent.click(screen.getByRole('button', { name: /set delivery window/i }));
    const earlyGroup = within(screen.getByRole('group', { name: 'Early' }));
    fireEvent.click(earlyGroup.getByRole('button', { name: '2026-08-14' }));
    fireEvent.click(earlyGroup.getByRole('button', { name: /set time to 8:00 am/i }));
    const lateGroup = within(screen.getByRole('group', { name: 'Late' }));
    fireEvent.click(lateGroup.getByRole('button', { name: '2026-08-14' }));
    fireEvent.click(lateGroup.getByRole('button', { name: /set time to 4:00 pm/i }));

    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByLabelText(/include rate in replies/i));

    const equipmentInput = screen.getByLabelText(/equipment/i);
    fireEvent.focus(equipmentInput);
    fireEvent.change(equipmentInput, { target: { value: 'reefer' } });
    fireEvent.click(screen.getByRole('button', { name: 'R — Reefer' }));

    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(loadsApi.createLoad).toHaveBeenCalledWith(expect.objectContaining({
        load_number: 'L2002', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
        early_del: '2026-08-14 08:00:00', late_del: '2026-08-14 16:00:00',
        target_pay: 1500, include_rate: false, equipment: 'R',
      }));
    });

    vi.useRealTimers();
  });

  test('shows the server error and does not close when creation fails', async () => {
    loadsApi.createLoad.mockRejectedValue(new Error('A load with number "L1001" already exists'));
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('calls onClose without creating when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AddLoadModal onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });

  test('has no Stops or Extra Stops controls', () => {
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByLabelText(/^stops$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/extra stops/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a stop/i })).not.toBeInTheDocument();
  });
});
