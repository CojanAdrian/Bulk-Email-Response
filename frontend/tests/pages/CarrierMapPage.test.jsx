import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CarrierMapPage from '../../src/pages/CarrierMapPage';
import * as carrierMatchesApi from '../../src/api/carrierMatches';
import * as carriersApi from '../../src/api/carriers';

vi.mock('../../src/api/carrierMatches');
vi.mock('../../src/api/carriers');
vi.mock('../../src/components/CarrierMapGlobe', () => ({
  default: () => <div data-testid="globe-mock" />,
}));

const FOCUSED_LOAD = { id: 1, load_number: 'L1001', origin_city: 'Dallas', origin_state: 'TX', dest_city: 'Chicago', dest_state: 'IL', origin_lat: 32.7767, origin_lng: -96.797, dest_lat: 41.8781, dest_lng: -87.6298 };

describe('CarrierMapPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('with no focused load, shows the manual lane search form', () => {
    render(<CarrierMapPage focusedLoad={null} />);
    expect(screen.getByLabelText(/origin city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination city/i)).toBeInTheDocument();
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

  test('clicking a matched carrier opens its detail sheet', async () => {
    carrierMatchesApi.getCarrierMatchesForLoad.mockResolvedValue({
      laneMatches: [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originDistanceMiles: 10 }],
      regionalMatches: [],
    });
    carriersApi.listCarrierHistory.mockResolvedValue([]);
    render(<CarrierMapPage focusedLoad={FOCUSED_LOAD} />);
    await waitFor(() => screen.getByText('ABC Trucking'));

    fireEvent.click(screen.getByText('ABC Trucking'));
    expect(screen.getByText(/^edit ABC Trucking$/i)).toBeInTheDocument();
  });
});
