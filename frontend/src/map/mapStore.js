import { useSyncExternalStore } from 'react';
import { laneGeometry, project, roadMiles } from './geo';

// What the map should show. Screens write here; UsMap draws it. Neither
// side knows about the other.
let state = { lanes: [], focusId: null, ripples: [], dimmed: false };
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// lanes: [{ id, from: [lng, lat], to: [lng, lat], fromLabel, toLabel, gold }]
// A lane with an end outside the map is left out.
export function setLanes(lanes) {
  const drawable = [];
  for (const lane of lanes || []) {
    const geometry = laneGeometry(lane.from, lane.to);
    if (!geometry) continue;
    drawable.push({ ...lane, geometry, miles: roadMiles(lane.from, lane.to) });
  }
  set({ lanes: drawable });
}

export function setFocus(id) {
  if (state.focusId === id) return;
  set({ focusId: id ?? null });
}

// A wave through the dot field from one place, e.g. where a new inquiry's
// load picks up.
export function ripple(lngLat) {
  const point = project(lngLat);
  if (!point) return;
  const now = Date.now();
  const live = state.ripples.filter((r) => now - r.startedAt < RIPPLE_MS);
  set({ ripples: [...live, { x: point[0], y: point[1], startedAt: now }] });
}

export function setDimmed(dimmed) {
  if (state.dimmed === Boolean(dimmed)) return;
  set({ dimmed: Boolean(dimmed) });
}

export function resetMapStore() {
  set({ lanes: [], focusId: null, ripples: [], dimmed: false });
}

export const RIPPLE_MS = 2600;

export function useMapStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
