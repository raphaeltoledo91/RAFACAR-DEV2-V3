import crypto from 'node:crypto';
import cookie from 'cookie';

export function clampText(value, maxLength = 300) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function cleanMediaPath(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

export function parseCookies(req) {
  return cookie.parse(req.headers.cookie || '');
}

export function serializeSessionCookie(name, value, options = {}) {
  return cookie.serialize(name, value, options);
}

export function randomId() {
  return crypto.randomBytes(32).toString('base64url');
}

export function redact(value) {
  if (!value) return '';
  const text = String(value);
  return text.length <= 8 ? '********' : `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export function parseSetCookie(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return '';
  return raw
    .split(/,(?=[^;,]+=)/g)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export function recentIso(hoursBack = 24) {
  return new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
}

export function nowIso() {
  return new Date().toISOString();
}

export function cookieOptions(req, config) {
  const isSecureRequest = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSite = ['none', 'lax', 'strict'].includes(config.cookieSameSite) ? config.cookieSameSite : 'lax';
  const secure = config.cookieSecure
    ? String(config.cookieSecure).toLowerCase() === 'true'
    : (sameSite === 'none' || Boolean(isSecureRequest));

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: config.sessionTtlMs
  };
}

export function isAllowedOrigin(origin, config) {
  if (!origin) return false;
  const normalized = String(origin).replace(/\/+$/, '');
  const origins = new Set(config.corsOrigins);
  if (config.publicAppUrl) {
    try {
      origins.add(new URL(config.publicAppUrl).origin);
    } catch {
      // ignore invalid PUBLIC_APP_URL
    }
  }
  return origins.has(normalized);
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
