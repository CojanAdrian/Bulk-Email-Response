import { get } from './client';

// City suggestions from the bundled list of US and Canadian places:
// [{ city, state }].
export function suggestCities(query, limit = 8) {
  return get(`/api/places/cities?q=${encodeURIComponent(query)}&limit=${limit}`);
}
