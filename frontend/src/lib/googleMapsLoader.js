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
