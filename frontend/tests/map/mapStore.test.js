import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getState, subscribe, setLanes, setFocus, ripple, setDimmed, resetMapStore } from '../../src/map/mapStore';

const CHICAGO = [-87.63, 41.88];
const DALLAS = [-96.8, 32.78];
const OCEAN = [-40, 35];

describe('mapStore', () => {
  beforeEach(() => {
    resetMapStore();
  });

  test('setLanes keeps drawable lanes and precomputes geometry and miles', () => {
    setLanes([
      { id: 1, from: CHICAGO, to: DALLAS, gold: true },
      { id: 2, from: CHICAGO, to: OCEAN },
      { id: 3, from: null, to: DALLAS },
    ]);
    const { lanes } = getState();
    expect(lanes.map((lane) => lane.id)).toEqual([1]);
    expect(lanes[0].gold).toBe(true);
    expect(lanes[0].geometry.length).toBeGreaterThan(0);
    expect(lanes[0].miles).toBeGreaterThan(900);
  });

  test('setFocus notifies subscribers, but not when nothing changed', () => {
    const listener = vi.fn();
    subscribe(listener);
    setFocus(7);
    setFocus(7);
    expect(getState().focusId).toBe(7);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('ripple records a wave at a place on the map and ignores places off it', () => {
    ripple(CHICAGO);
    ripple(OCEAN);
    expect(getState().ripples).toHaveLength(1);
    expect(getState().ripples[0].x).toBeGreaterThan(0);
  });

  test('an unsubscribed listener is not called again', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();
    setDimmed(true);
    expect(listener).not.toHaveBeenCalled();
    expect(getState().dimmed).toBe(true);
  });
});
