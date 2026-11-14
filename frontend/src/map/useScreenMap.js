import { useEffect } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';
import { setLanes, setFocus, setInsets } from './mapStore';

// Panel widths plus their margins. The map fits between them.
const LEFT = 606;
const LEFT_WITH_SHEET = 760;
const RIGHT = 366;

// Puts a screen's lanes on the map and keeps the map clear of its panels.
// lanes: see mapStore.setLanes. rightColumn: whether the screen shows its
// right-hand column. sheetOpen: a sheet wider than the panel is open.
export function useScreenMap({ lanes, focusId = null, rightColumn = false, sheetOpen = false }) {
  const wide = useMediaQuery('(min-width: 768px)');
  const widest = useMediaQuery('(min-width: 1180px)');

  useEffect(() => {
    setLanes(lanes);
  }, [lanes]);

  useEffect(() => {
    setFocus(focusId);
  }, [focusId]);

  useEffect(() => {
    const left = !wide ? 0 : sheetOpen ? LEFT_WITH_SHEET : LEFT;
    setInsets({ left, right: widest && rightColumn ? RIGHT : 0 });
  }, [wide, widest, rightColumn, sheetOpen]);

  useEffect(
    () => () => {
      setLanes([]);
      setFocus(null);
      setInsets({ left: 0, right: 0 });
    },
    []
  );

  return { widest };
}

function coordinate(lng, lat) {
  if (lng === null || lng === undefined || lat === null || lat === undefined) return null;
  const pair = [Number(lng), Number(lat)];
  return pair.every(Number.isFinite) ? pair : null;
}

// A map lane from any row with origin/dest city and coordinates. prefix is
// '' for loads and lane history, 'matched_load_' for inquiries.
export function laneFromRow(id, row, { prefix = '', gold = false } = {}) {
  const from = coordinate(row[`${prefix}origin_lng`], row[`${prefix}origin_lat`]);
  const to = coordinate(row[`${prefix}dest_lng`], row[`${prefix}dest_lat`]);
  if (!from || !to) return null;
  return { id, from, to, fromLabel: row[`${prefix}origin_city`], toLabel: row[`${prefix}dest_city`], gold };
}
