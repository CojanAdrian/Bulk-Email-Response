const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 10000;

async function request(path, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const error = new Error(err.name === 'TimeoutError' || err.name === 'AbortError' ? 'Request timed out' : 'Network error');
    error.status = null;
    throw error;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && body.error) || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return body;
}

export function get(path) {
  return request(path);
}

export function post(path, data, options = {}) {
  return request(path, { ...options, method: 'POST', body: JSON.stringify(data) });
}

export function patch(path, data) {
  return request(path, { method: 'PATCH', body: JSON.stringify(data) });
}
