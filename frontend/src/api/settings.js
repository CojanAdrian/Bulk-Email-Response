import { get, patch } from './client';

export function getSettings() {
  return get('/api/settings');
}

// Sends only what changed, e.g. { targets: { loadsPerDay: 9 } }.
export function updateSettings(change) {
  return patch('/api/settings', change);
}
