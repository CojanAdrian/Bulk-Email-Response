import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mapInstance = { fitBounds: vi.fn() };
const MapMock = vi.fn(() => mapInstance);

const directionsServiceInstance = { route: vi.fn() };
const DirectionsServiceMock = vi.fn(() => directionsServiceInstance);

const directionsRendererInstances = [];
const DirectionsRendererMock = vi.fn(function DirectionsRenderer(opts) {
  const instance = { ...opts, setMap: vi.fn(), setDirections: vi.fn() };
  directionsRendererInstances.push(instance);
  return instance;
});

const boundsInstance = { extend: vi.fn(), isEmpty: vi.fn(() => false) };
const LatLngBoundsMock = vi.fn(() => boundsInstance);

const markerInstances = [];
const MarkerMock = vi.fn(function Marker(opts) {
  const instance = { ...opts, setMap: vi.fn(), addListener: vi.fn() };
  markerInstances.push(instance);
  return instance;
});

const setOptionsMock = vi.fn();
const importLibraryMock = vi.fn((name) => {
  if (name === 'maps') return Promise.resolve({ Map: MapMock });
  if (name === 'routes') return Promise.resolve({ DirectionsService: DirectionsServiceMock });
  return Promise.resolve({});
});

vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: (...args) => setOptionsMock(...args),
  importLibrary: (...args) => importLibraryMock(...args),
}));

const FOCUSED_LOAD = { originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 };

function routeResult(distanceText = '100 mi', durationText = '2 hours') {
  return { routes: [{ legs: [{ distance: { text: distanceText }, duration: { text: durationText } }] }] };
}

describe('CarrierLaneMap', () => {
  let CarrierLaneMap;

  beforeEach(async () => {
    vi.resetModules();
    global.google = { maps: { DirectionsRenderer: DirectionsRendererMock, LatLngBounds: LatLngBoundsMock, Marker: MarkerMock } };
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    directionsServiceInstance.route.mockReset();
    directionsServiceInstance.route.mockResolvedValue(routeResult());
    MapMock.mockClear();
    DirectionsServiceMock.mockClear();
    DirectionsRendererMock.mockClear();
    MarkerMock.mockClear();
    setOptionsMock.mockClear();
    importLibraryMock.mockClear();
    directionsRendererInstances.length = 0;
    markerInstances.length = 0;
    ({ default: CarrierLaneMap } = await import('../../src/components/CarrierLaneMap'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete global.google;
  });

  test('shows a message instead of a blank map when no API key is configured', async () => {
    vi.unstubAllEnvs();
    render(<CarrierLaneMap focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    expect(await screen.findByText(/VITE_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    expect(importLibraryMock).not.toHaveBeenCalled();
  });

  test('initializes a satellite/hybrid Google Map once the API loads', async () => {
    render(<CarrierLaneMap focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    await waitFor(() => expect(MapMock).toHaveBeenCalled());
    expect(MapMock.mock.calls[0][1]).toEqual(expect.objectContaining({ mapTypeId: 'hybrid' }));
  });

  test('draws a real driving route for the focused/searched lane, in the current-lane color', async () => {
    render(<CarrierLaneMap focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);

    await waitFor(() => {
      expect(directionsServiceInstance.route).toHaveBeenCalledWith(expect.objectContaining({
        origin: { lat: FOCUSED_LOAD.originLat, lng: FOCUSED_LOAD.originLng },
        destination: { lat: FOCUSED_LOAD.destLat, lng: FOCUSED_LOAD.destLng },
        travelMode: 'DRIVING',
      }));
    });
    await waitFor(() => {
      expect(DirectionsRendererMock).toHaveBeenCalledWith(expect.objectContaining({
        polylineOptions: expect.objectContaining({ strokeColor: '#d7ff3d' }),
      }));
    });
  });

  test('shows the current lane\'s distance/duration once the route resolves', async () => {
    directionsServiceInstance.route.mockResolvedValue(routeResult('812 mi', '12 hours 30 mins'));
    render(<CarrierLaneMap focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);

    expect(await screen.findByText(/812 mi/)).toBeInTheDocument();
    expect(screen.getByText(/12 hours 30 mins/)).toBeInTheDocument();
  });

  test('draws a real driving route per selected-carrier history entry, in the history color', async () => {
    const history = [
      { origin_lat: 40.6, origin_lng: -105.1, dest_lat: 39.7, dest_lng: -105.0 },
    ];
    render(
      <CarrierLaneMap
        focusedLoad={null}
        laneMatches={[]}
        regionalMatches={[]}
        selectedCarrierId={1}
        selectedCarrierHistory={history}
      />
    );

    await waitFor(() => {
      expect(directionsServiceInstance.route).toHaveBeenCalledWith(expect.objectContaining({
        origin: { lat: 40.6, lng: -105.1 },
        destination: { lat: 39.7, lng: -105.0 },
      }));
    });
    await waitFor(() => {
      expect(DirectionsRendererMock).toHaveBeenCalledWith(expect.objectContaining({
        polylineOptions: expect.objectContaining({ strokeColor: '#22d3ee' }),
      }));
    });
  });

  test('skips a history entry with no cached coordinates instead of requesting a route for it', async () => {
    const history = [{ origin_lat: null, origin_lng: null, dest_lat: null, dest_lng: null }];
    render(
      <CarrierLaneMap
        focusedLoad={null}
        laneMatches={[]}
        regionalMatches={[]}
        selectedCarrierId={1}
        selectedCarrierHistory={history}
      />
    );
    await waitFor(() => expect(MapMock).toHaveBeenCalled());
    expect(directionsServiceInstance.route).not.toHaveBeenCalled();
  });

  test('places a plain marker (no billed route request) for every other unselected match', async () => {
    const laneMatches = [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originLat: 32.0, originLng: -96.0, destLat: 40.0, destLng: -88.0 }];
    render(<CarrierLaneMap focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} />);

    await waitFor(() => expect(MarkerMock).toHaveBeenCalled());
    expect(MarkerMock.mock.calls[0][0]).toEqual(expect.objectContaining({ title: 'ABC Trucking' }));
    expect(directionsServiceInstance.route).not.toHaveBeenCalled();
  });

  test('clicking a match marker calls onSelectCarrier', async () => {
    const laneMatches = [{ carrierId: 1, carrierName: 'ABC Trucking', tier: 'perfect', originLat: 32.0, originLng: -96.0, destLat: 40.0, destLng: -88.0 }];
    const onSelectCarrier = vi.fn();
    render(<CarrierLaneMap focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} onSelectCarrier={onSelectCarrier} />);

    await waitFor(() => expect(MarkerMock).toHaveBeenCalled());
    const clickHandler = markerInstances[0].addListener.mock.calls.find(([event]) => event === 'click')[1];
    clickHandler();
    expect(onSelectCarrier).toHaveBeenCalledWith(1);
  });
});
