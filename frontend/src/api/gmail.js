import { get, post, patch, API_URL } from './client';

export function getGmailStatus() {
  return get('/api/gmail/status');
}

export function getGmailConnectUrl() {
  return `${API_URL}/api/gmail/connect`;
}

export function disconnectGmail() {
  return post('/api/gmail/disconnect', {});
}

export function setAutoSendEnabled(enabled) {
  return patch('/api/gmail/auto-send', { enabled });
}
