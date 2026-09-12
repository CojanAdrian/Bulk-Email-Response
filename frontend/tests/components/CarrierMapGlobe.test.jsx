import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
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
const pointOfViewMock = vi.fn();
const controlsStub = { autoRotate: false, autoRotateSpeed: 0 };
vi.mock('react-globe.gl', () => ({
  // A ref-aware mock -- CarrierMapGlobe drives the camera/rotation through
  // the Globe ref's imperative controls()/pointOfView() methods, so the
  // mock has to expose those the same way the real component does.
  default: forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({
      pointOfView: pointOfViewMock,
      controls: () => controlsStub,
    }));
    return globeMock(props);
  }),
}));

beforeEach(() => {
  globeMock.mockClear();
  pointOfViewMock.mockClear();
  controlsStub.autoRotate = false;
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

  test('does not use a photographic texture -- a plain material color instead', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    expect(props.globeImageUrl).toBeUndefined();
    expect(props.globeMaterial).toBeDefined();
    expect(props.globeMaterial.isMaterial).toBe(true);
  });

  test('renders a state polygon per US state and a fill polygon per country', () => {
    render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
    const props = globeMock.mock.calls[0][0];
    const states = props.polygonsData.filter((d) => d._kind === 'state');
    const countries = props.polygonsData.filter((d) => d._kind === 'country');
    expect(states.length).toBeGreaterThan(45);
    expect(states.some((d) => d.properties.name === 'Texas')).toBe(true);
    expect(countries.length).toBeGreaterThan(100);
    expect(props.polygonLabel(states[0])).toBe(states[0].properties.name);
  });

  describe('camera behavior', () => {
    test('eases toward the focused lane\'s midpoint on mount', () => {
      render(<CarrierMapGlobe focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);
      expect(pointOfViewMock).toHaveBeenCalledWith(
        expect.objectContaining({ lat: (FOCUSED_LOAD.originLat + FOCUSED_LOAD.destLat) / 2, lng: (FOCUSED_LOAD.originLng + FOCUSED_LOAD.destLng) / 2 }),
        expect.any(Number)
      );
    });

    test('zooms in tighter on a selected carrier\'s own current-match lane', () => {
      const laneMatches = [{ carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.0, originLng: -96.0, destLat: 40.0, destLng: -88.0 }];
      render(<CarrierMapGlobe focusedLoad={null} laneMatches={laneMatches} regionalMatches={[]} selectedCarrierId={1} selectedCarrierHistory={[]} />);
      const call = pointOfViewMock.mock.calls.find(([, ms]) => true);
      expect(call[0]).toEqual(expect.objectContaining({ lat: 36, lng: -92, altitude: 0.35 }));
    });

    test('auto-rotates when nothing is focused or selected', () => {
      render(<CarrierMapGlobe focusedLoad={null} laneMatches={[]} regionalMatches={[]} />);
      expect(controlsStub.autoRotate).toBe(true);
    });

    test('stops auto-rotating once a lane is focused', () => {
      render(<CarrierMapGlobe focusedLoad={FOCUSED_LOAD} laneMatches={[]} regionalMatches={[]} />);
      expect(controlsStub.autoRotate).toBe(false);
    });
  });

  describe('selected-carrier highlighting', () => {
    const laneMatches = [
      { carrierId: 1, carrierName: 'A', tier: 'perfect', originLat: 32.7767, originLng: -96.797, destLat: 41.8781, destLng: -87.6298 },
      { carrierId: 2, carrierName: 'B', tier: 'weak', originLat: 29.7604, originLng: -95.3698, destLat: 25.7617, destLng: -80.1918 },
    ];
    const history = [
      { origin_lat: 33.0, origin_lng: -97.0, dest_lat: 34.0, dest_lng: -98.0 },
    ];

    test('adds one arc per selected-carrier history entry', () => {
      render(
        <CarrierMapGlobe
          focusedLoad={null}
          laneMatches={laneMatches}
          regionalMatches={[]}
          selectedCarrierId={1}
          selectedCarrierHistory={history}
        />
      );
      const props = globeMock.mock.calls[0][0];
      const historyArcs = props.arcsData.filter((a) => a.isHistory);
      expect(historyArcs).toHaveLength(1);
      expect(historyArcs[0].startLat).toBe(33.0);
    });

    test('dims the arc color of every other carrier while one is selected', () => {
      render(
        <CarrierMapGlobe
          focusedLoad={null}
          laneMatches={laneMatches}
          regionalMatches={[]}
          selectedCarrierId={1}
          selectedCarrierHistory={[]}
        />
      );
      const props = globeMock.mock.calls[0][0];
      const otherArc = props.arcsData.find((a) => a.carrierId === 2);
      const selectedArc = props.arcsData.find((a) => a.carrierId === 1);
      expect(props.arcColor(otherArc)).toMatch(/rgba/);
      expect(props.arcColor(selectedArc)).toBe('#d7ff3d');
    });

    test('a selected carrier\'s history arcs are a distinct color from both the current lane and dimmed arcs', () => {
      render(
        <CarrierMapGlobe
          focusedLoad={FOCUSED_LOAD}
          laneMatches={[]}
          regionalMatches={[]}
          selectedCarrierId={1}
          selectedCarrierHistory={history}
        />
      );
      const props = globeMock.mock.calls[0][0];
      const historyArc = props.arcsData.find((a) => a.isHistory);
      const focusedArc = props.arcsData.find((a) => a.isFocusedLoad);
      expect(props.arcColor(historyArc)).toBe('#22d3ee');
      expect(props.arcColor(historyArc)).not.toBe(props.arcColor(focusedArc));
    });

    test('skips a history entry with no cached coordinates', () => {
      render(
        <CarrierMapGlobe
          focusedLoad={null}
          laneMatches={[]}
          regionalMatches={[]}
          selectedCarrierId={1}
          selectedCarrierHistory={[{ origin_lat: null, origin_lng: null, dest_lat: null, dest_lng: null }]}
        />
      );
      const props = globeMock.mock.calls[0][0];
      expect(props.arcsData.filter((a) => a.isHistory)).toHaveLength(0);
    });
  });
});
