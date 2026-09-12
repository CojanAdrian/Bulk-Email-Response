import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import CarrierMapGlobe from '../../src/components/CarrierMapGlobe';

beforeAll(() => {
  // jsdom has no ResizeObserver implementation -- this is a test-environment
  // shim only, not a runtime dependency change.
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

const globeMock = vi.fn(() => <div data-testid="globe-mock" />);
vi.mock('react-globe.gl', () => ({
  default: (props) => globeMock(props),
}));

beforeEach(() => {
  globeMock.mockClear();
});

const FOCUSED_LOAD = { originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 };

describe('CarrierMapGlobe', () => {
  test('renders without a focused load or matches', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    expect(globeMock).toHaveBeenCalled();
    const props = globeMock.mock.calls[0][0];
    expect(props.arcsData).toEqual([]);
    expect(props.pointsData).toEqual([]);
  });

  test('includes one bold arc for the focused load\'s own lane', () => {
    render(<CarrierMapGlobe focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    const focusedArc = props.arcsData.find((a) => a.isFocusedLoad);
    expect(focusedArc).toBeDefined();
    expect(focusedArc.startLat).toBe(FOCUSED_LOAD.originLat);
    expect(focusedArc.endLat).toBe(FOCUSED_LOAD.destLat);
  });

  test('includes one thinner arc per lane match, colored by tier', () => {
    const laneMatches = [
      { carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 },
      { carrierId: 2, carrierName: 'B', tier: 'weak', originLat: 29.7604, originLng: -95.3698, destLat: 25.7617, destLng: -80.1918 },
    ];
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    const carrierArcs = props.arcsData.filter((a) => !a.isFocusedLoad);
    expect(carrierArcs).toHaveLength(2);
  });

  test('includes one point per regional match, at its tagged state\'s centroid', () => {
    const regionalMatches = [
      { carrierId: 9, carrierName: 'Regional Co', tier: 'regional', stateCentroids: [{ state: 'TX', lat: 31.0, lng: -100.0 }] },
    ];
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={regionalMatches} />);
    const props = globeMock.mock.calls[0][0];
    expect(props.pointsData).toHaveLength(1);
    expect(props.pointsData[0].lat).toBe(31.0);
  });

  test('calls onSelectCarrier when a point representing a lane-matched carrier arc is clicked', () => {
    const laneMatches = [{ carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 }];
    const onSelectCarrier = vi.fn();
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} onSelectCarrier={onSelectCarrier} />);
    const props = globeMock.mock.calls[0][0];
    props.onArcClick(props.arcsData[0]);
    expect(onSelectCarrier).toHaveBeenCalledWith(1);
  });

  test('renders no globeImageUrl (stylized dark sphere, not a fabricated texture URL)', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    expect(props.globeImageUrl).toBeUndefined();
  });
});
