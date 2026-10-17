import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let configured = false;
const libraryPromises = {};

// Shared across every component that needs a piece of the Google Maps JS
// API (the carrier map, city/state autocomplete, ...) so the API key is
// only configured once and each library (maps, routes, places, ...) is
// only ever fetched once, no matter how many components ask for it.
export function loadGoogleMapsLibrary(name) {
  if (!configured) {
    setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', v: 'weekly' });
    configured = true;
  }
  if (!libraryPromises[name]) {
    libraryPromises[name] = importLibrary(name);
  }
  return libraryPromises[name];
}

export function hasGoogleMapsKey() {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

// Google calls window.gm_authFailure when it rejects the key (wrong key,
// API not enabled, billing off, or this domain not in the key's allowed
// referrers). Without this the map just stays blank with no explanation.
const authFailureListeners = new Set();
let authFailed = false;

if (typeof window !== 'undefined') {
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((listener) => listener());
    if (typeof previous === 'function') previous();
  };
}

export function onGoogleAuthFailure(listener) {
  if (authFailed) listener();
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}
