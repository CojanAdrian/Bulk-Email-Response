import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import LoadsTable from '../../src/components/LoadsTable';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const SAMPLE_LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
};

const SAMPLE_LOAD_2 = {
  id: 2, load_number: 'A2002', origin_city: 'Atlanta', origin_state: 'GA',
  dest_city: 'Miami', dest_state: 'FL', equipment: 'R', target_pay: '900.00', status: 'active',
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

  test('shows a yellow "Modified" badge for a load with a custom_reply_body', async () => {
    loadsApi.listLoads.mockResolvedValue([{ ...SAMPLE_LOAD, custom_reply_body: 'Custom text' }]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    expect(screen.getByText('Modified')).toBeInTheDocument();
  });

  test('does not show the "Modified" badge for a load with no custom_reply_body', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
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

  test('calls onSelectLoad with the load when "Edit" is clicked', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    const onSelectLoad = vi.fn();
    render(<LoadsTable refreshKey={0} onSelectLoad={onSelectLoad} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(onSelectLoad).toHaveBeenCalledWith(SAMPLE_LOAD);
  });

  test('changing the per-row status select calls updateLoad with the new status', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, status: 'booked' });
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.change(screen.getByLabelText(/status for l1001/i), { target: { value: 'booked' } });

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { status: 'booked' });
    });
  });

  test('shows an error when the status quick-change fails', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.updateLoad.mockRejectedValue(new Error('Update failed'));
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.change(screen.getByLabelText(/status for l1001/i), { target: { value: 'covered' } });

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  test('clicking Delete then Confirm calls deleteLoad', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.deleteLoad.mockResolvedValue({ ok: true });
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(loadsApi.deleteLoad).toHaveBeenCalledWith(1);
    });
  });

  test('clicking Delete then Cancel does not call deleteLoad', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument();
    expect(loadsApi.deleteLoad).not.toHaveBeenCalled();
  });

  test('shows an error when delete fails', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.deleteLoad.mockRejectedValue(new Error('Delete failed'));
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  test('refetches with the new filter when the status dropdown changes', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('active'));

    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'booked' } });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('booked'));
  });

  test('offers "Covered" as a status filter option', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('active'));

    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'covered' } });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledWith('covered'));
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

  describe('row selection and bulk actions', () => {
    test('checking a row shows the bulk action bar with a count of 1', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));

      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('"Select all" checks every row and the count matches', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByLabelText('Select L1001')).toBeChecked();
      expect(screen.getByLabelText('Select A2002')).toBeChecked();
    });

    test('"Select all" again clears the selection', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const selectAll = screen.getByLabelText('Select all loads');
      fireEvent.click(selectAll);
      fireEvent.click(selectAll);

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('"Clear selection" empties the selection and hides the bulk bar', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));
      fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    test('bulk-deleting selected loads with confirm calls bulkDeleteLoads with the selected ids', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkDeleteLoads.mockResolvedValue({ deleted: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(loadsApi.bulkDeleteLoads).toHaveBeenCalledWith([1, 2]);
      });
    });

    test('bulk-delete Cancel does not call bulkDeleteLoads', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(loadsApi.bulkDeleteLoads).not.toHaveBeenCalled();
    });

    test('choosing a bulk status calls bulkUpdateLoadStatus with the selected ids and status', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkUpdateLoadStatus.mockResolvedValue({ updated: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));
      fireEvent.change(screen.getByLabelText(/mark selected as/i), { target: { value: 'covered' } });

      await waitFor(() => {
        expect(loadsApi.bulkUpdateLoadStatus).toHaveBeenCalledWith([1, 2], 'covered');
      });
    });

    test('shows an error when the bulk delete fails', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.bulkDeleteLoads.mockRejectedValue(new Error('Bulk delete failed'));
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select L1001'));
      fireEvent.click(screen.getByRole('button', { name: /delete selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(screen.getByText('Bulk delete failed')).toBeInTheDocument();
      });
    });
  });

  describe('sortable column headers', () => {
    test('clicking "Load #" sorts rows ascending by load number', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: /^load #/i }));

      const rows = screen.getAllByRole('row').slice(1); // skip header row
      expect(within(rows[0]).getByText('A2002')).toBeInTheDocument();
      expect(within(rows[1]).getByText('L1001')).toBeInTheDocument();
    });

    test('clicking the same header twice reverses the sort direction', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const header = screen.getByRole('button', { name: /^load #/i });
      fireEvent.click(header);
      fireEvent.click(header);

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('L1001')).toBeInTheDocument();
      expect(within(rows[1]).getByText('A2002')).toBeInTheDocument();
    });

    test('clicking "Target Pay" sorts rows numerically, not as text', async () => {
      loadsApi.listLoads.mockResolvedValue([
        { ...SAMPLE_LOAD, id: 1, load_number: 'BIG', target_pay: '9000.00' },
        { ...SAMPLE_LOAD_2, id: 2, load_number: 'SMALL', target_pay: '200.00' },
      ]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('BIG'));

      fireEvent.click(screen.getByRole('button', { name: /target pay/i }));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('SMALL')).toBeInTheDocument();
      expect(within(rows[1]).getByText('BIG')).toBeInTheDocument();
    });

    test('clicking "Origin" groups by state then sorts alphabetically by city within it', async () => {
      loadsApi.listLoads.mockResolvedValue([
        { ...SAMPLE_LOAD, id: 1, load_number: 'TXLOAD', origin_city: 'Dallas', origin_state: 'TX' },
        { ...SAMPLE_LOAD_2, id: 2, load_number: 'GALOAD', origin_city: 'Atlanta', origin_state: 'GA' },
      ]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('TXLOAD'));

      fireEvent.click(screen.getByRole('button', { name: /^origin$/i }));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('GALOAD')).toBeInTheDocument();
      expect(within(rows[1]).getByText('TXLOAD')).toBeInTheDocument();
    });
  });
});
