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
import * as carrierMatchesApi from '../../src/api/carrierMatches';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('papaparse');
vi.mock('../../src/api/loads');
vi.mock('../../src/api/gmail');
vi.mock('../../src/api/inquiries');
vi.mock('../../src/api/carriers');
vi.mock('../../src/api/carrierMatches');
vi.mock('../../src/lib/liveSocket');
vi.mock('../../src/components/CarrierLaneMap', () => ({
  default: () => <div data-testid="globe-mock" />,
}));

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

const tab = (name) => screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
const boardFetches = () => loadsApi.listLoads.mock.calls.filter((call) => call[0] === undefined).length;

describe('MainToolPage', () => {
  let liveHandlers;

  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
    gmailApi.getGmailStatus.mockResolvedValue({ connected: false });
    inquiriesApi.listInquiries.mockResolvedValue([]);
    carriersApi.listCarriers.mockResolvedValue([]);
    carrierMatchesApi.bulkCarrierMatches.mockResolvedValue({});
    carrierMatchesApi.getProvenCarriers.mockResolvedValue({});
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

  test('opens on the tab named in the address', async () => {
    renderPage('/inquiries');
    expect(tab('Inquiries')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: 'Load board' })).not.toBeInTheDocument();
  });

  test('on Loads, only inquiries waiting for a reply are fetched, not the whole log', async () => {
    renderPage();
    await waitFor(() => expect(inquiriesApi.listInquiries).toHaveBeenCalled());
    await screen.findByText('No loads found.');
    for (const call of inquiriesApi.listInquiries.mock.calls) {
      expect(call[0]).toBe('pending_review');
    }
  });

  test('switches to the Inquiries tab and renders its panels', async () => {
    renderPage();
    fireEvent.click(tab('Inquiries'));

    await waitFor(() => expect(gmailApi.getGmailStatus).toHaveBeenCalled());
    expect(screen.getByText(/gmail connection/i)).toBeInTheDocument();
    expect(screen.getByText(/review queue/i)).toBeInTheDocument();
    expect(screen.getByText(/inquiry log/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Load board' })).not.toBeInTheDocument();
  });

  test('shows the review queue above the Gmail connection panel on the Inquiries tab', async () => {
    renderPage('/inquiries');
    await waitFor(() => screen.getByText(/gmail connection/i));

    const main = screen.getByText(/gmail connection/i).closest('main');
    const reviewQueueHeading = within(main).getByText(/review queue/i);
    const gmailHeading = within(main).getByText(/gmail connection/i);
    const position = reviewQueueHeading.compareDocumentPosition(gmailHeading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('the Refresh button on the Inquiries tab re-fetches inquiries', async () => {
    renderPage('/inquiries');
    await screen.findByText(/inquiry log/i);
    await waitFor(() => expect(inquiriesApi.listInquiries.mock.calls.some((call) => call[0] === undefined)).toBe(true));
    const before = inquiriesApi.listInquiries.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    // The review queue, the log and the stats row each fetch again.
    await waitFor(() => expect(inquiriesApi.listInquiries.mock.calls.length).toBe(before + 3));
  });

  test('switching back to Loads shows the board again', async () => {
    renderPage('/inquiries');
    await waitFor(() => screen.getByText(/gmail connection/i));

    fireEvent.click(tab('Loads'));
    expect(await screen.findByRole('region', { name: 'Load board' })).toBeInTheDocument();
    // the outgoing Inquiries content may still be mid-exit-animation briefly
    await waitFor(() => expect(screen.queryByText(/gmail connection/i)).not.toBeInTheDocument());
  });

  test('a new inquiry opens the island, and clicking it switches to Inquiries', async () => {
    renderPage();
    await waitFor(() => expect(liveHandlers['inquiry:new']).toBeTruthy());

    act(() => {
      liveHandlers['inquiry:new']({ from_address: 'dispatch@carrierco.com' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('New inquiry from dispatch@carrierco.com');

    fireEvent.click(screen.getByText(/dispatch@carrierco.com/));
    await waitFor(() => expect(screen.getByText(/gmail connection/i)).toBeInTheDocument());
  });

  test('switches to the Carriers tab and shows the find-matches view by default', async () => {
    renderPage();
    fireEvent.click(tab('Carriers'));

    expect(await screen.findByTestId('globe-mock')).toBeInTheDocument();
    expect(screen.getByLabelText(/origin city/i)).toBeInTheDocument();
    expect(carriersApi.listCarriers).not.toHaveBeenCalled();
  });

  test('the "All carriers" toggle switches to the plain carrier list', async () => {
    renderPage('/carriers');
    fireEvent.click(screen.getByRole('button', { name: /^all carriers$/i }));

    await waitFor(() => expect(carriersApi.listCarriers).toHaveBeenCalled());
    expect(screen.getByText(/^carriers$/i, { selector: 'h2' })).toBeInTheDocument();
  });

  test('"Find carriers" on an open load switches to Carriers with that load focused', async () => {
    loadsApi.listLoads.mockResolvedValue([LOAD]);
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({ laneMatches: [], regionalMatches: [] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^open load L1001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Find carriers' }));

    await waitFor(() => expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1));
    expect(screen.getByText(/^carriers$/i, { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText(/matched carriers/i)).toBeInTheDocument();
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
