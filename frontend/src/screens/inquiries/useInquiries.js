import { useCallback, useEffect, useMemo, useState } from 'react';
import { listInquiries } from '../../api/inquiries';
import { subscribe } from '../../lib/liveSocket';
import { ripple } from '../../map/mapStore';

// How much history the All tab loads. The full log can be thousands of
// emails; loading all of it made the screen slow.
export const HISTORY_LIMIT = 300;

const newestFirst = (a, b) => String(b.received_at).localeCompare(String(a.received_at)) || b.id - a.id;

// The inquiries, newest first, kept current as emails arrive and replies go
// out. The queue is what still needs a reply (about loads that are still
// active, as the server decides); all is the queue plus recent history.
export function useInquiries(refreshKey) {
  const [byId, setById] = useState(() => new Map());
  const [queueIds, setQueueIds] = useState(() => new Set());
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let ignore = false;
    Promise.all([listInquiries('pending_review'), listInquiries(undefined, { limit: HISTORY_LIMIT })])
      .then(([waiting, recent]) => {
        if (ignore) return;
        const queue = Array.isArray(waiting) ? waiting : [];
        const map = new Map();
        for (const inquiry of Array.isArray(recent) ? recent : []) map.set(inquiry.id, inquiry);
        for (const inquiry of queue) map.set(inquiry.id, inquiry);
        setById(map);
        setQueueIds(new Set(queue.map((inquiry) => inquiry.id)));
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

  // Merges changed fields into an inquiry; one that stops waiting leaves
  // the queue.
  const replace = useCallback((inquiry) => {
    if (!inquiry) return;
    setById((prev) => {
      const next = new Map(prev);
      next.set(inquiry.id, { ...(prev.get(inquiry.id) || {}), ...inquiry });
      return next;
    });
    if (inquiry.reply_status && inquiry.reply_status !== 'pending_review') {
      setQueueIds((prev) => {
        if (!prev.has(inquiry.id)) return prev;
        const next = new Set(prev);
        next.delete(inquiry.id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const offNew = subscribe('inquiry:new', (inquiry) => {
      if (!inquiry) return;
      setById((prev) => (prev.has(inquiry.id) ? prev : new Map(prev).set(inquiry.id, inquiry)));
      if (inquiry.reply_status === 'pending_review') setQueueIds((prev) => new Set(prev).add(inquiry.id));
      // A wave across the map from where the load picks up.
      if (inquiry.matched_load_origin_lng != null) ripple([Number(inquiry.matched_load_origin_lng), Number(inquiry.matched_load_origin_lat)]);
    });
    // Updates carry only the inquiry's own columns, so the load details
    // already shown are kept.
    const offUpdated = subscribe('inquiry:updated', (inquiry) => {
      if (inquiry) replace(inquiry);
    });
    return () => {
      offNew();
      offUpdated();
    };
  }, [replace]);

  const all = useMemo(() => [...byId.values()].sort(newestFirst), [byId]);
  const queue = useMemo(() => all.filter((inquiry) => queueIds.has(inquiry.id) && inquiry.reply_status === 'pending_review'), [all, queueIds]);

  return { all, queue, status, error, reload, replace };
}
