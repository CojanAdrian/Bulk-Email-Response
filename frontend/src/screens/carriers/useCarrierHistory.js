import { useCallback, useRef, useState } from 'react';
import { listCarrierHistory } from '../../api/carriers';
import { laneFromRow } from '../../map/useScreenMap';

// Carriers' lane histories, fetched once each and remembered, so hovering
// a carrier can show where they run without waiting twice.
export function useCarrierHistory() {
  const cache = useRef(new Map());
  const [, setVersion] = useState(0);

  const ensure = useCallback((carrierId) => {
    if (!carrierId || cache.current.has(carrierId)) return;
    cache.current.set(carrierId, null);
    Promise.resolve(listCarrierHistory(carrierId))
      .then((rows) => {
        cache.current.set(carrierId, Array.isArray(rows) ? rows : []);
        setVersion((v) => v + 1);
      })
      .catch(() => cache.current.delete(carrierId));
  }, []);

  const forget = useCallback((carrierId) => {
    cache.current.delete(carrierId);
    setVersion((v) => v + 1);
  }, []);

  const historyOf = useCallback((carrierId) => cache.current.get(carrierId) || null, []);

  return { ensure, forget, historyOf };
}

// Map lanes for a carrier's runs, one per distinct lane.
export function lanesForHistory(history) {
  const seen = new Set();
  const lanes = [];
  for (const run of history || []) {
    const key = `${run.origin_city}|${run.origin_state}|${run.dest_city}|${run.dest_state}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lane = laneFromRow(`run-${run.id}`, run);
    if (lane) lanes.push(lane);
  }
  return lanes;
}
