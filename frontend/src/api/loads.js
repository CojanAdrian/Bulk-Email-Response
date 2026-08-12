import { get, post, patch, del } from './client';

export function listLoads(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return get(`/api/loads${query}`);
}

export function getLoad(id) {
  return get(`/api/loads/${id}`);
}

export function previewLoadReply(id) {
  return get(`/api/loads/${id}/preview-reply`);
}

export function updateLoad(id, data) {
  return patch(`/api/loads/${id}`, data);
}

export function deleteLoad(id) {
  return del(`/api/loads/${id}`);
}

export function bulkDeleteLoads(ids) {
  return post('/api/loads/bulk-delete', { ids });
}

export function bulkUpdateLoadStatus(ids, status) {
  return post('/api/loads/bulk-status', { ids, status });
}

export function uploadLoads(loads) {
  return post('/api/loads/upload', { loads }, { timeoutMs: 60000 });
}

export function createLoad(data) {
  return post('/api/loads', data);
}

export function bulkSetIncludeRate(ids, includeRate) {
  return post('/api/loads/bulk-include-rate', { ids, includeRate });
}
