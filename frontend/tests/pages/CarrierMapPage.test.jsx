import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierMapPage from '../../src/pages/CarrierMapPage';
import * as carrierMatchesApi from '../../src/api/carrierMatches';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carrierMatches');
vi.mock('../../src/api/carriers');
const globeMock = vi.fn(() => <div data-testid="globe-mock" />);
vi.mock('../../src/components/CarrierLaneMap', () => ({
  default: (props) => globeMock(props),
}));

const FOCUSED_LOAD = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', origin_lat: 32.7767, origin_lng: -96.797, dest_lat: 41.8781, dest_lng: -87.6298 };

describe('CarrierMapPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globeMock.mockImplementation(() => <div data-testid="globe-mock" />);
  });

  test('with no focused load, shows the manual lane search form', () => {
    render(<CarrierMapPage focusedLoad={null} />);
    expect(screen.getByLabelText(/origin city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination city/i)).toBeInTheDocument();
  });

  test('the manual lane search form stays visible and editable even with a focused load', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({ laneMatches: [], regionalMatches: [] });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalled());

    expect(screen.getByLabelText(/origin city/i)).toHaveValue('Dallas');
    expect(screen.getByLabelText(/destination city/i)).toHaveValue('Chicago');
    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Houston' } });
    expect(screen.getByLabelText(/origin city/i)).toHaveValue('Houston');
  });

  test('with a focused load, fetches and lists its matches automatically', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);

    await waitFor(() => {
      expect(carrierMatchesApi.getCarrierMatchesForLoad).toHaveBeenCalledWith(1);
    });
    expect(screen.getByText('ABC Trucking')).toBeInTheDocument();
  });

  test('submitting the manual lane search calls searchCarrierMatches and lists results', async () => {
    carrierMatchesApi.searchCarrierMatches.mockResolvedValue({
      laneMatches: [{ carrierId: 2, carrierName: 'Regional Trucking', tier: 'strong', originDistanceMiles: 40 }],
      regionalMatches: [],
    });
    render(<CarrierMapPage focusedLoad={null} />);

    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/origin state/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/destination city/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/destination state/i), { target: { value: 'IL' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(carrierMatchesApi.searchCarrierMatches).toHaveBeenCalledWith(expect.objectContaining({
        originCity: 'Dallas', originState: 'TX', destCity: 'Chicago', destState: 'IL',
      }));
    });
    expect(screen.getByText('Regional Trucking')).toBeInTheDocument();
  });

  test('a deep-linked load\'s current lane is drawn on the map using the response\'s geocoded coordinates -- not the load\'s own (always-null) lat/lng columns', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [], regionalMatches: [],
      queryOrigin: { lat: 32.7767, lng: -96.797 }, queryDest: { lat: 41.8781, lng: -87.6298 },
    });
    // A realistic load record: origin_lat/dest_lat are always null in
    // production (see backend/scripts/setup-db.js -- nothing ever writes
    // them), so the fixture intentionally omits them here too.
    const loadWithoutStoredCoords = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL' };
    render(<CarrierMapPage focusedLoad={loadWithoutStoredCoords} />);

    await waitFor(() => {
      expect(globeMock).toHaveBeenCalledWith(expect.objectContaining({
        focusedLoad: { originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 },
      }));
    });
  });

  test('a manual search\'s resolved lane coordinates are passed to the globe to draw and zoom to', async () => {
    carrierMatchesApi.searchCarrierMatches.mockResolvedValue({
      laneMatches: [], regionalMatches: [],
      queryOrigin: { lat: 32.7767, lng: -96.797 }, queryDest: { lat: 41.8781, lng: -87.6298 },
    });
    render(<CarrierMapPage focusedLoad={null} />);

    fireEvent.change(screen.getByLabelText(/origin city/i), { target: { value: 'Dallas' } });
    fireEvent.change(screen.getByLabelText(/origin state/i), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText(/destination city/i), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByLabelText(/destination state/i), { target: { value: 'IL' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(globeMock).toHaveBeenCalledWith(expect.objectContaining({
        focusedLoad: { originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 },
      }));
    });
  });

  test('lists regional matches in a separate group from lane matches', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'Lane Co', tier: 'strong', originDistanceMiles: 40 }],
      regionalMatches: [{ carrierId: 2, carrierName: 'Region Co', tier: 'regional', taggedStates: ['TX'] }],
    });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);

    await waitFor(() => screen.getByText('Lane Co'));
    expect(screen.getByText('Region Co')).toBeInTheDocument();
    expect(screen.getByText(/no booked lanes/i)).toBeInTheDocument();
  });

  test('match cards show MC number and dispatcher phone inline', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10, mc_number: '123456', dispatcher_phone: '555-1234' }],
      regionalMatches: [],
    });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    expect(screen.getByText(/MC 123456/)).toBeInTheDocument();
    expect(screen.getByText('555-1234')).toBeInTheDocument();
  });

  test('clicking a matched carrier opens its read-only detail sheet and highlights its history on the globe', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.getCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    await waitFor(() => {
      expect(carriersApi.getCarrier).toHaveBeenCalledWith(1);
    });
    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();
  });

  test('the detail sheet\'s Edit button opens the edit form', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    carriersApi.getCarrier.mockResolvedValue({ id: 1, company_name: 'ABC Trucking' });
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    await waitFor(() => screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByText(/^edit ABC Trucking$/i)).toBeInTheDocument();
  });
});
