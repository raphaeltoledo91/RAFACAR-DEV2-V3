import { parseSetCookie } from './utils.js';

export function sanitizeUser(payload, fallbackLogin = '') {
  const user = payload && typeof payload === 'object' ? payload : {};
  return {
    id: user.id ?? null,
    name: user.name || user.email || fallbackLogin,
    email: user.email || fallbackLogin,
    administrator: Boolean(user.administrator),
    readonly: Boolean(user.readonly),
    deviceReadonly: Boolean(user.deviceReadonly),
    disabled: Boolean(user.disabled)
  };
}

export async function loginToTraccar(config, login, password) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const body = new URLSearchParams({ email: login, password });
    const response = await fetch(`${config.traccarUrl}/api/session`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: controller.signal,
      redirect: 'manual'
    });

    const setCookie = parseSetCookie(response.headers);
    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text ? { raw: text } : null;
    }

    if (!response.ok || !setCookie) {
      const message = payload?.message || payload?.error || payload?.raw || `Traccar retornou HTTP ${response.status}`;
      const error = new Error(String(message).slice(0, 500));
      error.status = response.status || 401;
      throw error;
    }

    return {
      remoteCookie: setCookie,
      user: sanitizeUser(payload, login)
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Tempo esgotado ao autenticar no Traccar.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildAuthHeaders(session, extra = {}) {
  if (!session?.remoteCookie) {
    const error = new Error('Sessão Traccar não encontrada. Faça login novamente.');
    error.status = 401;
    throw error;
  }

  return {
    Accept: 'application/json',
    Cookie: session.remoteCookie,
    ...extra
  };
}

export async function traccarFetch(config, session, apiPath, options = {}) {
  if (!apiPath.startsWith('/api/')) {
    throw new Error('Rota interna inválida.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 18000));
  const url = `${config.traccarUrl}${apiPath}`;

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: buildAuthHeaders(session, options.headers),
      body: options.body,
      signal: controller.signal,
      redirect: 'manual'
    });

    const setCookie = parseSetCookie(response.headers);
    if (setCookie) session.remoteCookie = setCookie;

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let payload = null;

    if (contentType.includes('application/json')) {
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text ? { raw: text } : null;
      }
    } else {
      payload = text ? { raw: text } : null;
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error || payload?.raw || `Traccar retornou HTTP ${response.status}`;
      const error = new Error(String(message).slice(0, 500));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Tempo esgotado ao conectar ao Traccar.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
