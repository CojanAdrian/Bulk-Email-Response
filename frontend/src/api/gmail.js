import { get, post, API_URL } from './client';

export function getGmailStatus() {
  return get('/api/gmail/status');
}

export function getGmailConnectUrl() {
  return `${API_URL}/api/gmail/connect`;
}

export function disconnectGmail() {
  return post('/api/gmail/disconnect', {});
}
