import { useEffect, useState } from 'react';
import { listInquiries } from '../api/inquiries';
import { subscribe } from './liveSocket';

// Lightweight, independent of ReviewQueue's own fetch -- used anywhere a
// quick "how many inquiries need a reply right now" signal is needed (e.g.
// the Inquiries nav tab badge) without depending on that queue being mounted.
export function usePendingReviewCount() {
  const [count, setCount] = useState(null); // null = not known yet
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    listInquiries('pending_review')
      .then((data) => {
        if (!ignore) setCount(data.length);
      })
      .catch(() => {
        if (!ignore) setCount(null);
      });
    return () => {
      ignore = true;
    };
  }, [liveTick]);

  useEffect(() => {
    const unsubscribeNew = subscribe('inquiry:new', () => setLiveTick((t) => t + 1));
    const unsubscribeUpdated = subscribe('inquiry:updated', () => setLiveTick((t) => t + 1));
    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
    };
  }, []);

  return count;
}
