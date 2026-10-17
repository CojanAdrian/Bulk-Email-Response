import { useEffect, useState } from 'react';

function matches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

// Live boolean for a CSS media query. Falls back to false where matchMedia
// doesn't exist (jsdom), which means "desktop layout" in tests.
export function useMediaQuery(query) {
  const [isMatch, setIsMatch] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setIsMatch(list.matches);
    onChange();
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    return undefined;
  }, [query]);

  return isMatch;
}

// Phones get the bottom tab bar; tablets and up keep the top bar tabs.
export const PHONE_QUERY = '(max-width: 767px)';

export function useIsPhone() {
  return useMediaQuery(PHONE_QUERY);
}
