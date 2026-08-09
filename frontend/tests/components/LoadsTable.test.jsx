import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import LoadsTable from '../../src/components/LoadsTable';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const SAMPLE_LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
};

describe('LoadsTable', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
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
      expect(screen.getByText('Network error')).toBeInTheDocument();
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

  test('ignores a stale response that resolves after a newer filter change', async () => {
    let resolveFirst;
    loadsApi.listLoads.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('active'));

    const BOOKED_LOAD = { ...SAMPLE_LOAD, id: 2, load_number: 'L2002', status: 'booked' };
    loadsApi.listLoads.mockResolvedValueOnce([BOOKED_LOAD]);
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'booked' } });

    await waitFor(() => {
      expect(screen.getByText('L2002')).toBeInTheDocument();
    });

    // The stale "active" request now resolves after the "booked" one already rendered.
    resolveFirst([SAMPLE_LOAD]);

    expect(screen.getByText('L2002')).toBeInTheDocument();
    expect(screen.queryByText('L1001')).not.toBeInTheDocument();
  });

  test('refetches when a live load:changed event arrives', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    act(() => {
      liveHandlers['load:changed']({ loadId: 1 });
    });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));
  });
});
