import { get, post } from './client';

export function listInquiries(replyStatus) {
  const query = replyStatus ? `?reply_status=${encodeURIComponent(replyStatus)}` : '';
  return get(`/api/inquiries${query}`);
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
