import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Papa from 'papaparse';
import MainToolPage from '../../src/pages/MainToolPage';
import * as loadsApi from '../../src/api/loads';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');

describe('MainToolPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    inquiriesApi.listInquiries.mockResolvedValue([]);
  });

  test('renders the upload panel and the loads table by default', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('renders the DAT export section on the Loads tab', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate dat export/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/dat export/i, { selector: 'h2' })).toBeInTheDocument();
  });

  test('does not fetch Gmail/inquiries data until the Inquiries tab is opened', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalled());
    expect(gmailApi.getGmailStatus).not.toHaveBeenCalled();
    expect(inquiriesApi.listInquiries).not.toHaveBeenCalled();
  });

  test('switches to the Inquiries tab and renders its panels', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));

    await waitFor(() => {
      expect(gmailApi.getGmailStatus).toHaveBeenCalled();
    });
    expect(screen.getByText(/gmail connection/i)).toBeInTheDocument();
    expect(screen.getByText(/review queue/i)).toBeInTheDocument();
    expect(screen.getByText(/inquiry log/i)).toBeInTheDocument();
    expect(screen.queryByText(/upload loads csv/i)).not.toBeInTheDocument();
  });

  test('the Refresh button on the Inquiries tab re-fetches inquiries', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(2)); // ReviewQueue + InquiriesLog

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(4));
  });

  test('switching back to Loads keeps the loads table working as before', async () => {
    render(<MainToolPage username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    await waitFor(() => screen.getByText(/gmail connection/i));

    fireEvent.click(screen.getByRole('button', { name: /^loads$/i }));
    await waitFor(() => {
      expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/gmail connection/i)).not.toBeInTheDocument();
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

    // LoadsTable + DatExportSection each fetch independently on mount and on refreshKey change
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(4);
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
    // LoadsTable + DatExportSection each fetch independently on mount
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(2));

    const file = new File(['irrelevant'], 'loads.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(4);
    });
  });
});
