import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RateModal from '../../src/components/RateModal';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOAD = { id: 1, load_number: 'L1001', target_pay: '1500.00', status: 'active' };

describe('RateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('saves the updated target pay and status, then closes', async () => {
    loadsApi.updateLoad.mockResolvedValue({ ...LOAD, target_pay: '1700', status: 'booked' });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1700' } });
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'booked' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: '1700', status: 'booked' });
      expect(onSaved).toHaveBeenCalledWith({ ...LOAD, target_pay: '1700', status: 'booked' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('shows an error and keeps the modal open when saving fails', async () => {
    loadsApi.updateLoad.mockRejectedValue(new Error('Internal server error'));
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('calls onClose without saving when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(loadsApi.updateLoad).not.toHaveBeenCalled();
  });
});
