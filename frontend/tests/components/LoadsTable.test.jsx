import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import LoadsTable from '../../src/components/LoadsTable';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const SAMPLE_LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active', include_rate: 1,
};

const SAMPLE_LOAD_2 = {
  id: 2, load_number: 'A2002', origin_city: 'Atlanta', origin_state: 'GA',
  dest_city: 'Miami', dest_state: 'FL', equipment: 'R', target_pay: '900.00', status: 'active', include_rate: 1,
};

describe('LoadsTable', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
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

  test('shows the PU column formatted as an appointment when early and late pickup match', async () => {
    loadsApi.listLoads.mockResolvedValue([
      { ...SAMPLE_LOAD, early_pu: '2026-08-10T08:00:00Z', late_pu: '2026-08-10T08:00:00Z' },
    ]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    expect(screen.getByText(/appt/i)).toBeInTheDocument();
  });

  test('shows the PU column with both times and FCFS when early and late pickup differ', async () => {
    loadsApi.listLoads.mockResolvedValue([
      { ...SAMPLE_LOAD, early_pu: '2026-08-10T07:00:00Z', late_pu: '2026-08-10T15:00:00Z' },
    ]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    expect(screen.getByText(/fcfs/i)).toBeInTheDocument();
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

  // Regression coverage: the Blast Email feature existed but was only
  // reachable by re-searching for a load in a lookup panel buried below the
  // table -- a per-row action puts it right where the load is already
  // visible, same as Edit/Delete.
  test('calls onOpenBlast with the load when "Blast" is clicked', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    const onOpenBlast = vi.fn();
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} onOpenBlast={onOpenBlast} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^blast$/i }));
    expect(onOpenBlast).toHaveBeenCalledWith(SAMPLE_LOAD);
  });

  test('does not render a Blast button when onOpenBlast is not provided', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    expect(screen.queryByRole('button', { name: /^blast$/i })).not.toBeInTheDocument();
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

  test('shows a checked rate toggle by default and unchecked when include_rate is 0', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, { ...SAMPLE_LOAD_2, include_rate: 0 }]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByLabelText(/include rate for l1001/i)).toBeChecked();
    expect(screen.getByLabelText(/include rate for a2002/i)).not.toBeChecked();
  });

  test('toggling the rate switch calls updateLoad with the new include_rate value', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, include_rate: 0 });
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    fireEvent.click(screen.getByLabelText(/include rate for l1001/i));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { include_rate: false });
    });
  });

  test('shows a red "Needs stops added" tag when the comment suggests multi-stop and there are no structured extra stops', async () => {
    loadsApi.listLoads.mockResolvedValue([{ ...SAMPLE_LOAD, comment: '2nd pickup required', extra_stops: [] }]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByText(/needs stops added/i)).toBeInTheDocument();
  });

  test('shows a blue "Stops added" tag once structured extra stops exist, instead of the red one', async () => {
    loadsApi.listLoads.mockResolvedValue([
      { ...SAMPLE_LOAD, comment: '2nd pickup required', extra_stops: [{ type: 'pickup', city: 'Fort Worth', state: 'TX', datetime: null }] },
    ]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.getByText(/^stops added$/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs stops added/i)).not.toBeInTheDocument();
  });

  test('shows no multi-stop tag for an ordinary load', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    expect(screen.queryByText(/needs stops added/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^stops added$/i)).not.toBeInTheDocument();
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

    test('choosing a bulk rate action calls bulkSetIncludeRate with the selected ids', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      loadsApi.bulkSetIncludeRate.mockResolvedValue({ updated: 2 });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByLabelText('Select all loads'));
      fireEvent.change(screen.getByLabelText(/rate for selected/i), { target: { value: 'exclude' } });

      await waitFor(() => {
        expect(loadsApi.bulkSetIncludeRate).toHaveBeenCalledWith([1, 2], false);
      });
    });
  });

  describe('search', () => {
    test('filters rows by load number as you type', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: 'a2002' } });

      expect(screen.queryByText('L1001')).not.toBeInTheDocument();
      expect(screen.getByText('A2002')).toBeInTheDocument();
    });

    test('filters rows by origin city', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: 'atlanta' } });

      expect(screen.queryByText('L1001')).not.toBeInTheDocument();
      expect(screen.getByText('A2002')).toBeInTheDocument();
    });

    test('shows a no-match message, distinct from the empty-table message, when nothing matches', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: 'zzz-no-match' } });

      expect(screen.queryByText('L1001')).not.toBeInTheDocument();
      expect(screen.getByText(/no loads match/i)).toBeInTheDocument();
      expect(screen.queryByText(/^no loads found\.$/i)).not.toBeInTheDocument();
    });

    test('clearing the search restores every row', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const search = screen.getByLabelText(/search loads/i);
      fireEvent.change(search, { target: { value: 'atlanta' } });
      fireEvent.change(search, { target: { value: '' } });

      expect(screen.getByText('L1001')).toBeInTheDocument();
      expect(screen.getByText('A2002')).toBeInTheDocument();
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

    test('clicking "PU" sorts rows chronologically by pickup time', async () => {
      loadsApi.listLoads.mockResolvedValue([
        { ...SAMPLE_LOAD, id: 1, load_number: 'LATER', early_pu: '2026-08-15T08:00:00Z', late_pu: '2026-08-15T08:00:00Z' },
        { ...SAMPLE_LOAD_2, id: 2, load_number: 'EARLIER', early_pu: '2026-08-10T08:00:00Z', late_pu: '2026-08-10T08:00:00Z' },
      ]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('LATER'));

      fireEvent.click(screen.getByRole('button', { name: /^pu$/i }));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('EARLIER')).toBeInTheDocument();
      expect(within(rows[1]).getByText('LATER')).toBeInTheDocument();
    });

    test('loads with no PU time sort first when sorting by PU ascending', async () => {
      loadsApi.listLoads.mockResolvedValue([
        { ...SAMPLE_LOAD, id: 1, load_number: 'HASPU', early_pu: '2026-08-10T08:00:00Z', late_pu: '2026-08-10T08:00:00Z' },
        { ...SAMPLE_LOAD_2, id: 2, load_number: 'NOPU', early_pu: null, late_pu: null },
      ]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('HASPU'));

      fireEvent.click(screen.getByRole('button', { name: /^pu$/i }));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('NOPU')).toBeInTheDocument();
      expect(within(rows[1]).getByText('HASPU')).toBeInTheDocument();
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

    // Regression coverage for the reported bug: sorting reset every time the
    // user left the Loads tab (e.g. to check Inquiries) and came back,
    // because LoadsTable unmounts on tab switch and its sort state was
    // purely in-memory.
    test('persists the chosen column and direction across a remount, as if the tab were switched away and back', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      const { unmount } = render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const header = screen.getByRole('button', { name: /^load #/i });
      fireEvent.click(header); // ascending
      fireEvent.click(header); // descending
      unmount();

      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('L1001')).toBeInTheDocument();
      expect(within(rows[1]).getByText('A2002')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^load #/i })).toHaveTextContent('↓');
    });

    test('defaults to unsorted when nothing has been persisted yet', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD, SAMPLE_LOAD_2]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('L1001')).toBeInTheDocument();
      expect(within(rows[1]).getByText('A2002')).toBeInTheDocument();
    });
  });

  test('the table header is sticky so it stays visible while scrolling', async () => {
    loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
    render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
    await waitFor(() => screen.getByText('L1001'));

    const headerRow = screen.getAllByRole('row')[0];
    expect(headerRow.closest('thead')).toHaveClass('sticky');
  });

  describe('inline target pay editing', () => {
    test('clicking the target pay cell swaps it for an editable input', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: '1500.00' }));
      expect(screen.getByLabelText(/target pay for l1001/i)).toBeInTheDocument();
    });

    test('saves the new value on blur', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, target_pay: '1800' });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: '1500.00' }));
      const input = screen.getByLabelText(/target pay for l1001/i);
      fireEvent.change(input, { target: { value: '1800' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: 1800 });
      });
    });

    test('pressing Enter saves the new value', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, target_pay: '1800' });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: '1500.00' }));
      const input = screen.getByLabelText(/target pay for l1001/i);
      fireEvent.change(input, { target: { value: '1800' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: 1800 });
      });
    });

    test('pressing Escape cancels without saving', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: '1500.00' }));
      const input = screen.getByLabelText(/target pay for l1001/i);
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByLabelText(/target pay for l1001/i)).not.toBeInTheDocument();
      expect(loadsApi.updateLoad).not.toHaveBeenCalled();
    });

    test('clearing the field sends null instead of an empty string', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.updateLoad.mockResolvedValue({ ...SAMPLE_LOAD, target_pay: null });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: '1500.00' }));
      const input = screen.getByLabelText(/target pay for l1001/i);
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { target_pay: null });
      });
    });
  });

  describe('inline PU editing', () => {
    test('picking a PU date and time from the row saves it without opening the Edit modal', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 7, 1)); // Aug 1, 2026
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.updateLoad.mockResolvedValue(SAMPLE_LOAD);
      const onSelectLoad = vi.fn();
      render(<LoadsTable refreshKey={0} onSelectLoad={onSelectLoad} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: /set pu window/i }));
      const early = within(screen.getByRole('group', { name: 'Early' }));
      fireEvent.click(early.getByRole('button', { name: '2026-08-14' }));
      fireEvent.click(early.getByRole('button', { name: /set time to 8:00 am/i }));

      await waitFor(() => {
        expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { early_pu: '2026-08-14 08:00:00' });
      });
      expect(onSelectLoad).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    // Regression coverage: the row's DateRangeField reads its value straight
    // from the load prop, which only updates once a fetch round-trips back
    // from the server. Without local staging, a second edit within the same
    // popover session (day, then a non-default time) would find no date
    // recorded yet and silently fall back to today's date instead of the
    // day just picked.
    test('a second edit in the same popover session (a non-default time) keeps the date already picked', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 7, 1)); // Aug 1, 2026
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      loadsApi.updateLoad.mockResolvedValue(SAMPLE_LOAD);
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: /set pu window/i }));
      const early = within(screen.getByRole('group', { name: 'Early' }));
      fireEvent.click(early.getByRole('button', { name: '2026-08-14' }));
      fireEvent.click(early.getByRole('button', { name: /set time to 10:00 am/i }));

      await waitFor(() => {
        expect(loadsApi.updateLoad).toHaveBeenLastCalledWith(1, { early_pu: '2026-08-14 10:00:00' });
      });

      vi.useRealTimers();
    });
  });

  describe('copy action', () => {
    test('copies the formatted lookup message to the clipboard and shows a confirmation', async () => {
      loadsApi.listLoads.mockResolvedValue([SAMPLE_LOAD]);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      render(<LoadsTable refreshKey={0} onSelectLoad={vi.fn()} />);
      await waitFor(() => screen.getByText('L1001'));

      fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText.mock.calls[0][0]).toContain('PU: Dallas, TX');
        expect(screen.getByRole('button', { name: /^copied!$/i })).toBeInTheDocument();
      });
    });
  });
});
