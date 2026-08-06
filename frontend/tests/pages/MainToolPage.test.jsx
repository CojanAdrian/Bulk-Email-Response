import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Papa from 'papaparse';
import MainToolPage from '../../src/pages/MainToolPage';
import * as loadsApi from '../../src/api/loads';

vi.mock('papaparse');
vi.mock('../../src/api/loads');

describe('MainToolPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
  });

  test('renders the upload panel and the loads table', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('opens the rate modal when a load row is selected, and refreshes the table on save', async () => {
    const load = {
      id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
    };
    loadsApi.listLoads.mockResolvedValue([load]);
    loadsApi.updateLoad.mockResolvedValue({ ...load, target_pay: '1700', status: 'active' });
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /edit rate/i }));
    expect(screen.getByText(/edit load L1001/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(2);
    });
  });

  test('refreshes the table when an upload completes', async () => {
    const validFields = [
      'Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State',
      'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt', 'Planning Comment',
    ];
    const validRow = {
      Order: '0078033',
      'Origin City': 'NEWPORT',
      'Origin State': 'AR',
      'Dest City': 'O FALLON',
      'Dest State': 'MO',
      'Equip Type': 'FGT',
      Weight: '12845.0 LB',
      'Target Pay': '$1,100.00',
      'Early P/U Dt': '07/01/2026 1200',
      'Late P/U Dt': '07/01/2026 1200',
      'Planning Comment': '1p1d / $90 LUMP AT DEL',
    };
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: validFields }, data: [validRow] });
    });
    loadsApi.uploadLoads.mockResolvedValue({ inserted: 1, updated: 0 });

    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(1));

    const file = new File(['irrelevant'], 'loads.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(2);
    });
  });
});
