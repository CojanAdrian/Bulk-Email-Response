import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
        load_number: 'L1001', target_pay: null, comment: null, include_rate: true, extra_stops: [],
      }));
      expect(onCreated).toHaveBeenCalledWith({ id: 1, load_number: 'L1001' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('creates a load with the full set of fields, including an extra stop', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 2, load_number: 'L2002' });
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L2002' } });
    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    const [originState, destState] = screen.getAllByLabelText(/^state$/i);
    fireEvent.change(originState, { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/dest city/i), { target: { value: 'Chicago' } });
    fireEvent.change(destState, { target: { value: 'IL' } });
    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByLabelText(/include rate in replies/i));
    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }));
    fireEvent.change(screen.getByLabelText(/stop 1 city/i), { target: { value: 'Fort Worth' } });
    fireEvent.change(screen.getByLabelText(/stop 1 state/i), { target: { value: 'TX' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(loadsApi.createLoad).toHaveBeenCalledWith(expect.objectContaining({
        load_number: 'L2002', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL',
        target_pay: 1500, include_rate: false,
        extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }],
      }));
    });
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

  test('rejects a non-integer stops value without calling the API', async () => {
    render(<AddLoadModal onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'L1001' } });
    fireEvent.change(screen.getByLabelText(/^stops$/i), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/stops must be a whole number/i)).toBeInTheDocument();
    });
    expect(loadsApi.createLoad).not.toHaveBeenCalled();
  });
});
