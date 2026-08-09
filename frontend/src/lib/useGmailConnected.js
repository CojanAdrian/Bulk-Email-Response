import { useEffect, useState } from 'react';
import { getGmailStatus } from '../api/gmail';
import { subscribe } from './liveSocket';

// Lightweight, independent of GmailConnectionPanel's own fetch -- used
// anywhere a quick "is an account connected yet?" signal is needed (e.g. a
// sidebar nudge badge) without depending on that panel being mounted.
export function useGmailConnected() {
  const [connected, setConnected] = useState(null); // null = not known yet

  useEffect(() => {
    let ignore = false;
    getGmailStatus()
      .then((data) => {
        if (!ignore) setConnected(Boolean(data.connected));
      })
      .catch(() => {
        if (!ignore) setConnected(null);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return subscribe('gmail:status', (payload) => {
      setConnected(Boolean(payload.connected));
    });
  }, []);

  return connected;
}
