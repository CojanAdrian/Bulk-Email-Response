import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSettings, updateSettings } from '../api/settings';
import { subscribe } from '../lib/liveSocket';

// Same as the server's defaults, used until the user's own settings load.
export const DEFAULT_SETTINGS = {
  targets: { loadsPerDay: 8, marginPerLoad: 1500, replyMinutes: 10, weeklyGp: 30000 },
  profile: { displayName: '' },
  board: { openingTab: 'loads', sort: 'newest' },
  notifications: { newInquiry: true, waitingTooLong: true, sound: false },
  appearance: { map: true, motion: 'full' },
};

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, loaded: true, update: () => Promise.resolve(), error: null });

function merge(base, change) {
  const next = { ...base };
  for (const [section, values] of Object.entries(change || {})) {
    next[section] = { ...(base[section] || {}), ...values };
  }
  return next;
}

// The signed-in user's settings for every screen. A change shows at once and
// is saved in the background; if saving fails it is rolled back.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState(null);
  // True once the saved settings arrived, or could not be fetched.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;
    Promise.resolve(getSettings())
      .then((data) => {
        if (!ignore && data) setSettings(merge(DEFAULT_SETTINGS, data));
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoaded(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Another window changed them.
  useEffect(() => subscribe('settings:changed', (data) => data && setSettings(merge(DEFAULT_SETTINGS, data))), []);

  const update = useCallback((change) => {
    let previous;
    setSettings((current) => {
      previous = current;
      return merge(current, change);
    });
    setError(null);
    return Promise.resolve(updateSettings(change)).catch((err) => {
      setSettings(previous);
      setError(err?.message || 'Could not save that setting.');
    });
  }, []);

  const value = useMemo(() => ({ settings, loaded, update, error }), [settings, loaded, update, error]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
