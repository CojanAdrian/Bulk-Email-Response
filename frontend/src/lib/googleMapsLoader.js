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

// The last 4 characters of the key baked into this build -- safe to show
// (a browser key ships inside the page anyway) and lets you check the
// deploy really has the key you think it has.
export function googleKeyHint() {
  const key = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '');
  return key.length >= 4 ? key.slice(-4) : '';
}

// Google reports *why* it refused (RefererNotAllowedMapError,
// ApiNotActivatedMapError, ...) only as a console message, and calls
// window.gm_authFailure without any detail. Both are captured here so the
// map can show the real reason instead of staying blank.
const authFailureListeners = new Set();
let authFailed = false;
let lastErrorCode = null;
const ERROR_PATTERN = /Google Maps JavaScript API (?:error|warning): (\w+)/;

function notify() {
  authFailureListeners.forEach((listener) => listener(lastErrorCode));
}

if (typeof window !== 'undefined') {
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    notify();
    if (typeof previous === 'function') previous();
  };

  if (typeof console !== 'undefined' && !console.__bulkpostingGoogleTap) {
    const originalError = console.error.bind(console);
    console.error = (...args) => {
      const match = typeof args[0] === 'string' ? ERROR_PATTERN.exec(args[0]) : null;
      if (match && /Error$/.test(match[1])) {
        lastErrorCode = match[1];
        if (authFailed) notify();
      }
      originalError(...args);
    };
    console.__bulkpostingGoogleTap = true;
  }
}

export function getGoogleMapsErrorCode() {
  return lastErrorCode;
}

export function onGoogleAuthFailure(listener) {
  if (authFailed) listener(lastErrorCode);
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}
