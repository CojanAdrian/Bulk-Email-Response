import { useCallback, useEffect, useMemo, useState } from 'react';
import { listLoads } from '../../api/loads';
import { listInquiries } from '../../api/inquiries';
import { bulkCarrierMatches, getProvenCarriers } from '../../api/carrierMatches';
import { subscribe } from '../../lib/liveSocket';

// Everything the Loads board shows, kept fresh: every load, the carriers
// who already ran each lane, how many carriers match it, and the inquiries
// waiting on a reply. One request for loads serves the list, the counts
// and the map.
export function useBoard(refreshKey) {
  const [loads, setLoads] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [matches, setMatches] = useState({});
  const [proven, setProven] = useState({});
  const [waiting, setWaiting] = useState([]);
  const [tick, setTick] = useState(0);
  const [inquiryTick, setInquiryTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let ignore = false;
    listLoads()
      .then((data) => {
        if (ignore) return;
        setLoads(data);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message || 'Failed to load loads.');
        setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, tick]);

  useEffect(() => subscribe('load:changed', () => setTick((t) => t + 1)), []);

  // Only refetch the per-load extras when the set of loads changes, not on
  // every edit to one of them.
  const idKey = useMemo(() => loads.map((load) => load.id).join(','), [loads]);

  useEffect(() => {
    if (idKey === '') {
      setMatches({});
      setProven({});
      return undefined;
    }
    const ids = idKey.split(',').map(Number);
    let ignore = false;
    // Both are extras: if one fails the board still works without it.
    Promise.resolve(bulkCarrierMatches(ids))
      .then((data) => {
        if (!ignore) setMatches(data || {});
      })
      .catch(() => {});
    Promise.resolve(getProvenCarriers(ids))
      .then((data) => {
        if (!ignore) setProven(data || {});
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [idKey]);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(listInquiries('pending_review', { order: 'oldest' }))
      .then((data) => {
        if (!ignore) setWaiting(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [inquiryTick]);

  useEffect(() => {
    const bump = () => setInquiryTick((t) => t + 1);
    const offNew = subscribe('inquiry:new', bump);
    const offUpdated = subscribe('inquiry:updated', bump);
    return () => {
      offNew();
      offUpdated();
    };
  }, []);

  // How many waiting emails ask about each load, and the newest of them
  // (what "N asking" opens).
  const { asking, askingNewest } = useMemo(() => {
    const counts = {};
    const newest = {};
    for (const inquiry of waiting) {
      const id = inquiry.matched_load_id;
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
      if (!newest[id] || String(inquiry.received_at) > String(newest[id].received_at)) newest[id] = inquiry;
    }
    return { asking: counts, askingNewest: newest };
  }, [waiting]);

  return { loads, status, error, matches, proven, waiting, asking, askingNewest, reload };
}
