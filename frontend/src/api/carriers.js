import { get, post, patch, del } from './client';

export function listCarriers(query) {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return get(`/api/carriers${q}`);
}

export function getCarrier(id) {
  return get(`/api/carriers/${id}`);
}

export function lookupCarrierByMc(mc) {
  return get(`/api/carriers/lookup?mc=${encodeURIComponent(mc)}`);
}

export function createCarrier(data) {
  return post('/api/carriers', data);
}

export function updateCarrier(id, data) {
  return patch(`/api/carriers/${id}`, data);
}

export function deleteCarrier(id) {
  return del(`/api/carriers/${id}`);
}

export function listCarrierHistory(carrierId) {
  return get(`/api/carriers/${carrierId}/history`);
}

export function createCarrierHistory(carrierId, data) {
  return post(`/api/carriers/${carrierId}/history`, data);
}

export function updateCarrierHistory(historyId, data) {
  return patch(`/api/carriers/history/${historyId}`, data);
}

export function deleteCarrierHistory(historyId) {
  return del(`/api/carriers/history/${historyId}`);
}
