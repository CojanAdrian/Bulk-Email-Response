import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoadsTable from '../../src/components/LoadsTable';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const SAMPLE_LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
};

describe('LoadsTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('renders loads returned by the API, filtered to active by default', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('L1001')).toBeInTheDocument();
    });
    expect(loadsApi.listLoads).toHaveBeenCalledWith('active');
  });

  test('shows an empty state when there are no loads', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('shows an error state when the request fails', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('Network error'));
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load loads/i)).toBeInTheDocument();
    });
  });

  test('calls onSelectLoad with the load when "Edit rate" is clicked', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    const onSelectLoad = vi.fn();
    render(<LoadsTable refreshKey={0} onSelectLoad={onSelectLoad} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /edit rate/i }));
    expect(onSelectLoad).toHaveBeenCalledWith(SAMPLE_LOAD);
  });

  test('refetches with the new filter when the status dropdown changes', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('active'));

    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'booked' } });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('booked'));
  });

  test('refetches when refreshKey changes', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    const { rerender } = render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    rerender(<LoadsTable refreshKey={1} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));
  });
});
