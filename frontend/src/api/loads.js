import { get, post, patch } from './client';

export function listLoads(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return get(`/api/loads${query}`);
}

export function getLoad(id) {
  return get(`/api/loads/${id}`);
}

export function updateLoad(id, data) {
  return patch(`/api/loads/${id}`, data);
}

export function uploadLoads(loads) {
  return post('/api/loads/upload', { loads });
}
