import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DatExportSection from '../../src/components/DatExportSection';
import * as loadsApi from '../../src/api/loads';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/loads');
vi.mock('../../src/lib/liveSocket');

const LOADS = [
  {
    id: 1, load_number: '1001', origin_city: 'Chicago', origin_state: 'IL', origin_zip: '',
    dest_city: 'Dallas', dest_state: 'TX', dest_zip: '', equipment: 'V', raw_equipment: 'V', weight: '42000', target_pay: 1500,
    early_pu: new Date(2026, 7, 10, 8, 0).toISOString(), late_pu: new Date(2026, 7, 10, 8, 0).toISOString(),
    late_del: null, stops: 0, commodity: null, temperature: null, comment: '',
  },
];

describe('DatExportSection', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('fetches active loads and shows the count once ready', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    expect(loadsApi.listLoads).toHaveBeenCalledWith('active');
    await waitFor(() => {
      expect(screen.getByText(/1 active load\(s\) ready to export/i)).toBeInTheDocument();
    });
  });

  test('shows an error when the loads fetch fails', async () => {
    loadsApi.listLoads.mockRejectedValue(new Error('Network error'));
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  test('disables the export button until loads are ready, and when there are none', async () => {
    loadsApi.listLoads.mockResolvedValue([]);
    render(<DatExportSection refreshKey={0} />);
    expect(screen.getByRole('button', { name: /generate dat export/i })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByText(/0 active load\(s\)/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /generate dat export/i })).toBeDisabled();
  });

  test('clicking Generate DAT Export opens the contact method modal', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i, hidden: false }));
    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    expect(screen.getByText(/dat contact method/i)).toBeInTheDocument();
  });

  test('confirming the contact method downloads a CSV immediately, using each load\'s rate switch', async () => {
    loadsApi.listLoads.mockResolvedValue([{ ...LOADS[0], include_rate: 1 }]);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
    expect(screen.getByText(/anomaly report/i)).toBeInTheDocument();
    // the modal may still be mid-exit-animation briefly
    await waitFor(() => {
      expect(screen.queryByText(/dat contact method/i)).not.toBeInTheDocument();
    });
  });

  test('renders the load lookup panel once loads are ready, and forwards blast requests from it to onOpenBlast', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    const onOpenBlast = vi.fn();
    render(<DatExportSection refreshKey={0} onOpenBlast={onOpenBlast} />);
    await waitFor(() => screen.getByLabelText(/search loads/i));

    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    fireEvent.click(screen.getByRole('button', { name: /blast email/i }));

    expect(onOpenBlast).toHaveBeenCalledWith(expect.objectContaining({ id: 1, load_number: '1001' }), false);
  });

  test('refetches active loads when a live load:changed event arrives', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    act(() => {
      liveHandlers['load:changed']({});
    });

    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));
  });
});
