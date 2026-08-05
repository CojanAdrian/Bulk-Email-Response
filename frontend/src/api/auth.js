import { get, post } from './client';

export function login(username, password) {
  return post('/api/auth/login', { username, password });
}

export function logout() {
  return post('/api/auth/logout', {});
}

export function me() {
  return get('/api/auth/me');
}
