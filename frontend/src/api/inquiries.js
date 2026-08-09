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
