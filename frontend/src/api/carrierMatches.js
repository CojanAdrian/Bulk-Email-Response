import { get, post } from './client';

export function getCarrierMatchesForLoad(loadId) {
  return get(`/api/carrier-matches?loadId=${encodeURIComponent(loadId)}`);
}

export function searchCarrierMatches(lane) {
  return post('/api/carrier-matches', lane);
}

export function bulkCarrierMatches(loadIds) {
  return post('/api/carrier-matches/bulk', { loadIds });
}

// Carriers who already ran each load's exact lane (gold "proven" rows).
export function getProvenCarriers(loadIds) {
  return post('/api/carrier-matches/proven', { loadIds });
}
