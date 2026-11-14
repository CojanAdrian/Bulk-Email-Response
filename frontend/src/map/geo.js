import { geoAlbersUsa, geoDistance } from 'd3-geo';

// The us-atlas "albers" files are pre-projected with exactly this
// projection into a 975 x 610 frame, so points projected here line up with
// the state shapes.
export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;
const projection = geoAlbersUsa().scale(1300).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);

const EARTH_RADIUS_MILES = 3958.8;
// Roads are longer than the straight line; 17% is the usual planning figure.
const ROAD_FACTOR = 1.17;
const CURVE = 0.2;

function isCoordinate(point) {
  return Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === 'number' && Number.isFinite(n));
}

// [lng, lat] -> [x, y] in map units, or null outside the United States.
export function project(lngLat) {
  if (!isCoordinate(lngLat)) return null;
  return projection(lngLat);
}

// A lane is drawn as a quadratic curve that always bows upward.
export function laneGeometry(from, to) {
  const A = project(from);
  const B = project(to);
  if (!A || !B) return null;
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return { A, B, C: A, length };
  const side = dx >= 0 ? 1 : -1;
  const C = [
    (A[0] + B[0]) / 2 + (dy / length) * length * CURVE * side,
    (A[1] + B[1]) / 2 - (dx / length) * length * CURVE * side,
  ];
  return { A, B, C, length };
}

export function pointOnLane({ A, B, C }, t) {
  const u = 1 - t;
  return [u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]];
}

export function roadMiles(from, to) {
  if (!isCoordinate(from) || !isCoordinate(to)) return null;
  return Math.round((geoDistance(from, to) * EARTH_RADIUS_MILES * ROAD_FACTOR) / 10) * 10;
}
