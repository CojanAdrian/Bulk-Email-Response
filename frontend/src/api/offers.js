import { get, post } from './client';

// Who has already been emailed about a load from "Find trucks on DAT".
export function listOffers(loadId) {
  return get(`/api/offers?load_id=${encodeURIComponent(loadId)}`);
}

// Emails the load to each recipient ({ email, name, mc }), one email each.
export function sendOffers({ loadId, subject, body, recipients }) {
  return post('/api/offers', { load_id: loadId, subject, body, recipients });
}
