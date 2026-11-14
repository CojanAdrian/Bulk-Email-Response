import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CarriersScreen from '../../../src/screens/carriers/CarriersScreen';
import { getState, resetMapStore } from '../../../src/map/mapStore';
import * as carriersApi from '../../../src/api/carriers';
import * as carrierMatchesApi from '../../../src/api/carrierMatches';

vi.mock('../../../src/api/carriers');
vi.mock('../../../src/api/carrierMatches');

const REDLINE = { id: 7, company_name: 'Redline Haul', mc_number: '884213', dispatcher_name: 'Marcus', dispatcher_phone: '(312) 555-0142', dispatcher_email: 'marcus@redline.com', equipment_types: ['V', 'R'], operating_states: ['IL', 'TX'] };
const NORTHSTAR = { id: 8, company_name: 'Northstar Carriers', mc_number: null, equipment_types: [] };
const RUNS = [
  { id: 100, origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', origin_lat: 41.88, origin_lng: -87.63, dest_lat: 32.78, dest_lng: -96.8, rate: '1850.00', gp: '400.00', ran_at: '2026-10-28', load_number: 'L1001', effective_customer: 'ALDI, Inc' },
  { id: 101, origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', origin_lat: 41.88, origin_lng: -87.63, dest_lat: 32.78, dest_lng: -96.8, rate: '1900.00', gp: null, ran_at: '2026-09-30' },
];

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderScreen(start = '/carriers', props = {}) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <CarriersScreen {...props} />
      <Where />
    </MemoryRouter>
  );
}

describe('CarriersScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMapStore();
    carriersApi.listCarriers.mockResolvedValue([REDLINE, NORTHSTAR]);
    carriersApi.getCarrier.mockResolvedValue(REDLINE);
    carriersApi.listCarrierHistory.mockResolvedValue(RUNS);
    carriersApi.deleteCarrier.mockResolvedValue({ ok: true });
  });

  describe('directory', () => {
    test('lists carriers with their contact line', async () => {
      renderScreen();
      expect(await screen.findByText('Redline Haul')).toBeInTheDocument();
      expect(screen.getByText('MC 884213 · Marcus · (312) 555-0142')).toBeInTheDocument();
      expect(screen.getByText('No contact on file')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 carriers on file');
    });

    test('search asks the server', async () => {
      renderScreen();
      await screen.findByText('Redline Haul');
      fireEvent.change(screen.getByLabelText('Search carriers'), { target: { value: 'red' } });
      await waitFor(() => expect(carriersApi.listCarriers).toHaveBeenCalledWith('red'));
    });

    test('hovering a carrier draws the lanes they have run', async () => {
      renderScreen();
      fireEvent.pointerEnter((await screen.findByRole('button', { name: 'Open Redline Haul' })).closest('li'));
      await waitFor(() => expect(carriersApi.listCarrierHistory).toHaveBeenCalledWith(7));
      // Two runs of the same lane are one line.
      await waitFor(() => expect(getState().lanes).toHaveLength(1));
    });

    test('the plus opens a blank carrier form', async () => {
      renderScreen();
      await screen.findByText('Redline Haul');
      fireEvent.click(screen.getByRole('button', { name: 'Add carrier' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('starred carriers', () => {
    test('starring a carrier saves it, lists it first and puts it in the Starred tab', async () => {
      carriersApi.updateCarrier.mockResolvedValue({ ...NORTHSTAR, starred: 1 });
      renderScreen();
      await screen.findByText('Northstar Carriers');
      fireEvent.click(screen.getByRole('button', { name: 'Star Northstar Carriers' }));
      expect(carriersApi.updateCarrier).toHaveBeenCalledWith(8, { starred: true });
      expect(screen.getByRole('button', { name: 'Unstar Northstar Carriers' })).toHaveAttribute('aria-pressed', 'true');
      const names = screen.getAllByRole('button', { name: /^Open / }).map((button) => button.getAttribute('aria-label'));
      expect(names).toEqual(['Open Northstar Carriers', 'Open Redline Haul']);
      fireEvent.click(screen.getByRole('button', { name: /^starred 1$/i }));
      expect(screen.getByTestId('path')).toHaveTextContent('/carriers/starred');
      expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(1);
    });

    test('a failed star goes back', async () => {
      carriersApi.updateCarrier.mockRejectedValue(new Error('Network error'));
      renderScreen();
      await screen.findByText('Northstar Carriers');
      fireEvent.click(screen.getByRole('button', { name: 'Star Northstar Carriers' }));
      expect(await screen.findByRole('button', { name: 'Star Northstar Carriers' })).toHaveAttribute('aria-pressed', 'false');
    });

    test('the Starred tab explains how to star when there are none', async () => {
      renderScreen('/carriers/starred');
      expect(await screen.findByText('No starred carriers yet.')).toBeInTheDocument();
    });

    test('a carrier can be starred from their profile', async () => {
      carriersApi.updateCarrier.mockResolvedValue({ ...REDLINE, starred: 1 });
      renderScreen('/carriers/7');
      const sheet = await screen.findByRole('dialog', { name: 'Redline Haul' });
      fireEvent.click(await within(sheet).findByRole('button', { name: 'Star Redline Haul' }));
      expect(carriersApi.updateCarrier).toHaveBeenCalledWith(7, { starred: true });
      expect(within(sheet).getByRole('button', { name: 'Unstar Redline Haul' })).toBeInTheDocument();
    });
  });

  describe('a carrier', () => {
    test('opens with contacts, equipment, averages and every run', async () => {
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Open Redline Haul' }));
      const sheet = await screen.findByRole('dialog', { name: 'Redline Haul' });
      expect(screen.getByTestId('path')).toHaveTextContent('/carriers/7');
      expect(await within(sheet).findByText('(312) 555-0142')).toBeInTheDocument();
      expect(within(sheet).getByText('Van')).toBeInTheDocument();
      expect(within(sheet).getByText('Reefer')).toBeInTheDocument();
      expect(within(sheet).getByText('IL · TX')).toBeInTheDocument();
      expect(within(sheet).getByText('$1,875')).toBeInTheDocument();
      expect(within(sheet).getAllByText(/Chicago, IL/)).toHaveLength(2);
      expect(within(sheet).getByRole('button', { name: 'Copy load number L1001' })).toBeInTheDocument();
    });

    test('hovering a run focuses it on the map', async () => {
      renderScreen('/carriers/7');
      const sheet = await screen.findByRole('dialog', { name: 'Redline Haul' });
      const runs = await within(sheet).findAllByText(/Chicago, IL/);
      fireEvent.pointerEnter(runs[0].closest('li'));
      await waitFor(() => expect(getState().focusId).toBe('run-100'));
    });

    test('Delete asks first, then deletes and goes back to the directory', async () => {
      renderScreen('/carriers/7');
      const sheet = await screen.findByRole('dialog', { name: 'Redline Haul' });
      fireEvent.click(await within(sheet).findByRole('button', { name: 'Delete' }));
      expect(carriersApi.deleteCarrier).not.toHaveBeenCalled();
      fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(carriersApi.deleteCarrier).toHaveBeenCalledWith(7));
      await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/carriers$/));
    });
  });

  describe('find for a lane', () => {
    const RESULTS = {
      laneMatches: [{ carrierId: 7, carrierName: 'Redline Haul', tier: 'perfect', originDistanceMiles: 4, originLat: 41.88, originLng: -87.63, destLat: 32.78, destLng: -96.8, laneCount: 2, mc_number: '884213' }],
      regionalMatches: [{ carrierId: 8, carrierName: 'Northstar Carriers', tier: 'regional', taggedStates: ['IL', 'IN'] }],
      queryOrigin: { lat: 41.88, lng: -87.63 },
      queryDest: { lat: 32.78, lng: -96.8 },
    };

    test('needs both ends of the lane', async () => {
      renderScreen('/carriers/find');
      fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/origin and destination/i);
      expect(carrierMatchesApi.searchCarrierMatches).not.toHaveBeenCalled();
    });

    test('a load handed over from the board is searched straight away', async () => {
      carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue(RESULTS);
      renderScreen('/carriers/find', { focusedLoad: { id: 1, load_number: 'L1001', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX', equipment: 'V' } });
      await waitFor(() => expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1));
      expect(await screen.findByText('Ran this lane')).toBeInTheDocument();
      expect(screen.getByText('Runs the origin state')).toBeInTheDocument();
      expect(screen.getByText('For load L1001')).toBeInTheDocument();
    });

    test('draws the searched lane and each carrier who ran it', async () => {
      carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue(RESULTS);
      renderScreen('/carriers/find', { focusedLoad: { id: 1, load_number: 'L1001', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX' } });
      await screen.findByText('Ran this lane');
      await waitFor(() => expect(getState().lanes.map((lane) => lane.id)).toEqual(['query', 'match-7']));
      expect(getState().focusId).toBe('query');
      fireEvent.pointerEnter(screen.getAllByRole('button', { name: 'Open Redline Haul' })[0].closest('li'));
      await waitFor(() => expect(getState().focusId).toBe('match-7'));
    });

    test('a match opens that carrier', async () => {
      carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue(RESULTS);
      renderScreen('/carriers/find', { focusedLoad: { id: 1, load_number: 'L1001', origin_city: 'Chicago', origin_state: 'IL', dest_city: 'Dallas', dest_state: 'TX' } });
      await screen.findByText('Ran this lane');
      fireEvent.click(screen.getAllByRole('button', { name: 'Open Redline Haul' })[0]);
      expect(await screen.findByRole('dialog', { name: 'Redline Haul' })).toBeInTheDocument();
    });
  });
});
