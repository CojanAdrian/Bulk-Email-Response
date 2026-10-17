import { useEffect, useState } from 'react';

function read(key, initialValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? initialValue : JSON.parse(raw);
  } catch {
    return initialValue;
  }
}

// useState that survives a reload (per browser). Storage can be blocked or
// full -- every access is wrapped so the UI still works without it.
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => read(key, initialValue));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not persisted; fine.
    }
  }, [key, value]);

  return [value, setValue];
}
