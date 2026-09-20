import { get, post, patch } from './client';

export function listInquiries(replyStatus, { order } = {}) {
  const params = new URLSearchParams();
  if (replyStatus) params.set('reply_status', replyStatus);
  if (order) params.set('order', order);
  const query = params.toString();
  return get(`/api/inquiries${query ? `?${query}` : ''}`);
}

export function sendInquiryReply(id, body) {
  return post(`/api/inquiries/${id}/send`, body ? { body } : {});
}

export function rejectInquiry(id) {
  return post(`/api/inquiries/${id}/reject`, {});
}

export function bulkSendInquiries(items) {
  return post('/api/inquiries/bulk-send', { items });
}

export function bulkRejectInquiries(ids) {
  return post('/api/inquiries/bulk-reject', { ids });
}

// Re-assigns an inquiry to a different load than whichever tier picked --
// pass null to detach the match entirely. See ReviewQueue's "Change
// match" control.
export function reassignInquiry(id, loadId) {
  return patch(`/api/inquiries/${id}/match`, { matched_load_id: loadId });
}
