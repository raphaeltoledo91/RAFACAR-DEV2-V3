const API_TIMEOUT_MS = 18000;
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function buildApiUrl(path) {
  const raw = String(path || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${API_BASE_URL}${raw}`;
}

export async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || API_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || payload?.raw || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo esgotado ao conectar com o servidor.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  getConfig: () => request('/api/config'),
  login: (email, password) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  authMe: () => request('/api/auth/me'),
  bootstrap: () => request('/api/bootstrap'),
  snapshot: () => request('/api/snapshot'),
  getCameras: () => request('/api/monitoring/cameras'),
  getEvidence: () => request('/api/monitoring/evidence'),
  saveCamera: (payload) => request('/api/monitoring/cameras', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteCamera: (deviceId) => request(`/api/monitoring/cameras/${deviceId}`, { method: 'DELETE' }),
  captureSnapshot: (payload) => request('/api/monitoring/evidence/snapshot', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  saveEvidence: (payload) => request('/api/monitoring/evidence', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteEvidence: (id) => request(`/api/monitoring/evidence/${id}`, { method: 'DELETE' }),
  getCommandTypes: (deviceId) => request(`/api/command-types?deviceId=${encodeURIComponent(deviceId)}`),
  sendCommand: (payload) => request('/api/send-command', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  askAssistant: (payload) => request('/api/assistant/ask', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};

export function imageProxyUrl({ path = '', url = '' } = {}) {
  const query = new URLSearchParams();
  if (path) query.set('path', path);
  if (url) query.set('url', url);
  return buildApiUrl(`/api/monitoring/media/image?${query.toString()}`);
}
