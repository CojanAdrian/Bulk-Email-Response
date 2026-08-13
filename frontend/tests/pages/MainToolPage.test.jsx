import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Papa from 'papaparse';
import MainToolPage from '../../src/pages/MainToolPage';
import { ToastProvider } from '../../src/components/Toast';
import * as loadsApi from '../../src/api/loads';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/lib/liveSocket');

function renderPage(props) {
  return render(
    <ToastProvider>
      <MainToolPage {...props} />
    </ToastProvider>
  );
}

describe('MainToolPage', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    inquiriesApi.listInquiries.mockResolvedValue([]);
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('renders the upload panel and the loads table by default', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no loads found/i)).toBeInTheDocument();
    });
  });

  test('renders the DAT export section on the Loads tab', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate dat export/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/dat export/i, { selector: 'h2' })).toBeInTheDocument();
  });

  test('does not fetch inquiries data until the Inquiries tab is opened', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalled());
    // the sidebar itself checks Gmail status (for its "not connected" nav
    // nudge badge) regardless of tab, so getGmailStatus is called from mount
    expect(inquiriesApi.listInquiries).not.toHaveBeenCalled();
  });

  test('switches to the Inquiries tab and renders its panels', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));

    await waitFor(() => {
      expect(gmailApi.getGmailStatus).toHaveBeenCalled();
    });
    expect(screen.getByText(/gmail connection/i)).toBeInTheDocument();
    expect(screen.getByText(/review queue/i)).toBeInTheDocument();
    expect(screen.getByText(/inquiry log/i)).toBeInTheDocument();
    // the outgoing Loads content may still be mid-exit-animation briefly
    await waitFor(() => {
      expect(screen.queryByText(/upload loads csv/i)).not.toBeInTheDocument();
    });
  });

  test('the Refresh button on the Inquiries tab re-fetches inquiries', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    // ReviewQueue + InquiriesLog + InquiriesStatsRow each fetch independently on mount
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalledTimes(6));
  });

  test('switching back to Loads keeps the loads table working as before', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    await waitFor(() => screen.getByText(/gmail connection/i));

    fireEvent.click(screen.getByRole('button', { name: /^loads$/i }));
    await waitFor(() => {
      expect(screen.getByText(/upload loads csv/i)).toBeInTheDocument();
    });
    // the outgoing Inquiries content may still be mid-exit-animation briefly
    await waitFor(() => {
      expect(screen.queryByText(/gmail connection/i)).not.toBeInTheDocument();
    });
  });

  test('opens the rate modal when a load row is selected, and refreshes the table on save', async () => {
    const load = {
      id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
    };
    loadsApi.listLoads.mockResolvedValue([load]);
    loadsApi.updateLoad.mockResolvedValue({ ...load, target_pay: '1700', status: 'active' });
    renderPage({ username: 'admin', onLogout: vi.fn() });

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByText(/edit load L1001/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // LoadsStatsRow + LoadsTable + DatExportSection each fetch independently on mount and on refreshKey change
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(6);
    });
  });

  // Regression coverage for the reported request: a new-inquiry
  // notification that's hard to miss no matter which tab is open, and that
  // still gets you to the review queue -- not just the small corner toast.
  test('shows a prominent alert when a live inquiry:new event arrives, and clicking it switches to Inquiries', async () => {
    renderPage({ username: 'admin', onLogout: vi.fn() });
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeTruthy());

    act(() => {
      liveHandlers['inquiry:new']({ from_address: 'dispatch@carrierco.com' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('New inquiry from dispatch@carrierco.com');

    fireEvent.click(screen.getByText(/dispatch@carrierco.com/));
    await waitFor(() => {
      expect(screen.getByText(/gmail connection/i)).toBeInTheDocument();
    });
  });

  test('opens the blast modal from a load row\'s "Blast" button', async () => {
    const load = {
      id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
      dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
    };
    loadsApi.listLoads.mockResolvedValue([load]);
    renderPage({ username: 'admin', onLogout: vi.fn() });

    await waitFor(() => screen.getByText('L1001'));
    fireEvent.click(screen.getByRole('button', { name: /^blast$/i }));

    expect(screen.getByText(/blast email/i, { selector: 'h2' })).toBeInTheDocument();
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

    renderPage({ username: 'admin', onLogout: vi.fn() });
    // LoadsStatsRow + LoadsTable + DatExportSection each fetch independently on mount
    await waitFor(() => expect(loadsApi.listLoads).toHaveBeenCalledTimes(3));

    const file = new File(['irrelevant'], 'loads.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(6);
    });
  });

  test('opens the Add Load modal and refreshes the table after creating a load', async () => {
    loadsApi.createLoad.mockResolvedValue({ id: 9, load_number: 'NEW1' });
    renderPage({ username: 'admin', onLogout: vi.fn() });
    await waitFor(() => screen.getByText(/no loads found/i));

    fireEvent.click(screen.getByRole('button', { name: /\+ add load/i }));
    expect(screen.getByText(/^add a load$/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/load #/i), { target: { value: 'NEW1' } });
    fireEvent.click(screen.getByRole('button', { name: /^add load$/i }));

    // LoadsStatsRow + LoadsTable + DatExportSection each fetch independently on mount and on refreshKey change
    await waitFor(() => {
      expect(loadsApi.listLoads).toHaveBeenCalledTimes(6);
    });
  });
});
