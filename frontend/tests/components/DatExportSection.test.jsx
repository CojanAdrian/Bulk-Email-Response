import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DatExportSection from '../../src/components/DatExportSection';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOADS = [
  {
    id: 1, load_number: '1001', origin_city: 'Chicago', origin_state: 'IL', origin_zip: '',
    dest_city: 'Dallas', dest_state: 'TX', dest_zip: '', equipment: 'V', raw_equipment: 'V', weight: '42000', target_pay: 1500,
    early_pu: new Date(2026, 7, 10, 8, 0).toISOString(), late_pu: new Date(2026, 7, 10, 8, 0).toISOString(),
    late_del: null, stops: 0, commodity: null, temperature: null, comment: '',
  },
];

describe('DatExportSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
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

  test('confirming with rate choice "all" downloads a CSV immediately and shows the anomaly report', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('radio', { name: /include for all loads/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
    expect(screen.getByText(/anomaly report/i)).toBeInTheDocument();
    expect(screen.queryByText(/dat contact method/i)).not.toBeInTheDocument();
  });

  test('confirming with rate choice "some" opens the per-load rate selection modal instead of exporting immediately', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByRole('button', { name: /generate dat export/i }));

    fireEvent.click(screen.getByRole('button', { name: /generate dat export/i }));
    fireEvent.click(screen.getByRole('radio', { name: /choose per load/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText(/choose loads to include a rate on/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generate export/i }));
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded a dat csv with 1 row/i)).toBeInTheDocument();
  });

  test('renders the load lookup panel once loads are ready, and opens the blast modal from it', async () => {
    loadsApi.listLoads.mockResolvedValue(LOADS);
    render(<DatExportSection refreshKey={0} />);
    await waitFor(() => screen.getByLabelText(/search loads/i));

    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    fireEvent.click(screen.getByRole('button', { name: /blast email/i }));

    expect(screen.getByText(/blast email/i, { selector: 'h2' })).toBeInTheDocument();
  });
});
