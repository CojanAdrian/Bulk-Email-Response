import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Papa from 'papaparse';
import MainToolPage from '../../src/pages/MainToolPage';
import { ToastProvider } from '../../src/components/Toast';
import * as loadsApi from '../../src/api/loads';
import * as gmailApi from '../../src/api/gmail';
import * as inquiriesApi from '../../src/api/inquiries';
import * as carriersApi from '../../src/api/carriers';
import * as customersApi from '../../src/api/customers';
import * as carrierMatchesApi from '../../src/api/carrierMatches';
import * as settingsApi from '../../src/api/settings';
import * as statsApi from '../../src/api/stats';
import * as liveSocket from '../../src/lib/liveSocket';
import { DEFAULT_SETTINGS } from '../../src/shell/SettingsContext';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/api/carriers');
vi.mock('../../src/api/customers');
vi.mock('../../src/api/carrierMatches');
vi.mock('../../src/api/settings');
vi.mock('../../src/api/stats');
vi.mock('../../src/lib/liveSocket');

const LOAD = {
  id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX',
  dest_city: 'Chicago', dest_state: 'IL', equipment: 'V', target_pay: '1500.00', status: 'active',
};

function renderPage(start = '/loads') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ToastProvider>
        <MainToolPage username="admin" onLogout={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>
  );
}

const tab = (name) => within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
const boardFetches = () => loadsApi.listLoads.mock.calls.filter((call) => call[0] === undefined).length;

describe('MainToolPage', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    inquiriesApi.listInquiries.mockResolvedValue([]);
    carriersApi.listCarriers.mockResolvedValue([]);
    customersApi.listCustomers.mockResolvedValue([]);
    carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});
    carrierMatchesApi.getProvenCarriers.mockResolvedValue({});
    settingsApi.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    settingsApi.updateSettings.mockImplementation((change) => Promise.resolve(change));
    statsApi.getToday.mockResolvedValue(null);
    loadsApi.getLoadsStats.mockResolvedValue({ loads: [], totals: { count: 0, totalGp: 0, totalRate: 0, totalTargetPay: 0 } });
    liveHandlers = {};
    liveSocket.subscribe.mockImplementation((event, handler) => {
      liveHandlers[event] = handler;
      return () => {
        delete liveHandlers[event];
      };
    });
  });

  test('opens on the Loads board', async () => {
    renderPage('/');
    expect(await screen.findByText('No loads found.')).toBeInTheDocument();
    expect(tab('Loads')).toHaveAttribute('aria-current', 'page');
  });

  test('the bare address opens the screen chosen in settings', async () => {
    settingsApi.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, board: { ...DEFAULT_SETTINGS.board, openingTab: 'stats' } });
    renderPage('/');
    await waitFor(() => expect(tab('Stats')).toHaveAttribute('aria-current', 'page'));
  });

  test.each([
    ['Inquiries', 'region', 'Inquiries'],
    ['Carriers', 'region', 'Carriers'],
    ['Customers', 'region', 'Customers'],
    ['Stats', 'region', 'Stats'],
  ])('the %s tab shows its screen', async (name, role, label) => {
    renderPage();
    fireEvent.click(tab(name));
    expect(await screen.findByRole(role, { name: label })).toBeInTheDocument();
    expect(tab(name)).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: 'Load board' })).not.toBeInTheDocument();
  });

  test('a new inquiry opens the island, and View switches to Inquiries', async () => {
    renderPage();
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeTruthy());

    act(() => {
      liveHandlers['inquiry:new']({ id: 9, from_address: 'dispatch@carrierco.com', subject: 'L1001?', reply_status: 'pending_review' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('New inquiry from dispatch@carrierco.com');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('region', { name: 'Inquiries' })).toBeInTheDocument();
  });

  test('"Find carriers" on an open load searches carriers for that lane', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD]);
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({ laneMatches: [], regionalMatches: [] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^open load L1001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Find carriers' }));

    await waitFor(() => expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1));
    expect(screen.getByText('For load L1001')).toBeInTheDocument();
    expect(screen.getByLabelText('Origin city')).toHaveValue('Dallas');
  });

  test('the account pill opens Settings over the current screen, and closing returns to it', async () => {
    renderPage('/inquiries');
    await screen.findByRole('region', { name: 'Inquiries' });
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inquiries', hidden: true })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(tab('Inquiries')).toHaveAttribute('aria-current', 'page');
  });

  test('Ctrl K opens search, and choosing a load opens it', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD]);
    renderPage('/stats');
    await screen.findByRole('region', { name: 'Stats' });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const field = await screen.findByLabelText('Search loads, carriers and customers');
    fireEvent.change(field, { target: { value: 'L1001' } });
    await screen.findByRole('option', { name: /Dallas, TX → Chicago, IL/ });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Load L1001' })).toBeInTheDocument();
  });

  test('importing a CSV from the board uploads it and reloads the board', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({
        meta: { fields: ['Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State', 'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt', 'Planning Comment'] },
        data: [{
          Order: '0078033', 'Origin City': 'NEWPORT', 'Origin State': 'AR', 'Dest City': 'O FALLON', 'Dest State': 'MO', 'Equip Type': 'FGT',
          Weight: '12845.0 LB', 'Target Pay': '$1,100.00', 'Early P/U Dt': '07/01/2026 1200', 'Late P/U Dt': '07/01/2026 1200', 'Planning Comment': '1p1d',
        }],
      });
    });
    loadsApi.uploadLoads.mockResolvedValue({ inserted: 1, updated: 0 });

    renderPage();
    await screen.findByText('No loads found.');
    const before = boardFetches();

    const file = new File(['irrelevant'], 'loads.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Upload loads CSV'), { target: { files: [file] } });

    await waitFor(() => expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(boardFetches()).toBeGreaterThan(before));
    expect(await screen.findByText('loads.csv imported')).toBeInTheDocument();
  });
});
