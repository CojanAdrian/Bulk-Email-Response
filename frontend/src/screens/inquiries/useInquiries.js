import { useCallback, useEffect, useState } from 'react';
import { listInquiries } from '../../api/inquiries';
import { subscribe } from '../../lib/liveSocket';
import { ripple } from '../../map/mapStore';

// Every inquiry, newest first, kept current as emails arrive and replies go
// out. The queue (waiting for a reply) is derived from it, also newest
// first, so a new email lands on top.
export function useInquiries(refreshKey) {
  const [all, setAll] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(listInquiries())
      .then((data) => {
        if (ignore) return;
        setAll(Array.isArray(data) ? data : []);
        setError(null);
        setStatus('ready');
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message || 'Failed to load inquiries.');
        setStatus('error');
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, tick]);

  useEffect(() => {
    const offNew = subscribe('inquiry:new', (inquiry) => {
      if (!inquiry) return;
      setAll((prev) => (prev.some((item) => item.id === inquiry.id) ? prev : [inquiry, ...prev]));
      // A wave across the map from where the load picks up.
      if (inquiry.matched_load_origin_lng != null) ripple([Number(inquiry.matched_load_origin_lng), Number(inquiry.matched_load_origin_lat)]);
    });
    // Updates carry only the inquiry's own columns, so the load details
    // already shown are kept.
    const offUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (!inquiry) return;
      setAll((prev) => prev.map((item) => (item.id === inquiry.id ? { ...item, ...inquiry } : item)));
    });
    return () => {
      offNew();
      offUpdated();
    };
  }, []);

  const replace = useCallback((inquiry) => {
    setAll((prev) => prev.map((item) => (item.id === inquiry.id ? { ...item, ...inquiry } : item)));
  }, []);

  const newestFirst = (a, b) => String(b.received_at).localeCompare(String(a.received_at)) || b.id - a.id;
  const sorted = [...all].sort(newestFirst);
  const queue = sorted.filter((inquiry) => inquiry.reply_status === 'pending_review');

  return { all: sorted, queue, status, error, reload, replace };
}
