import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config, paths } from './config.js';
import { SessionStore } from './lib/session-store.js';
import { StateStore } from './lib/state-store.js';
import { SnapshotCache } from './lib/snapshot-cache.js';
import {
  clampText,
  cleanMediaPath,
  cookieOptions,
  isAllowedOrigin,
  normalizeArray,
  nowIso,
  parseCookies,
  recentIso,
  redact,
  serializeSessionCookie
} from './lib/utils.js';
import { loginToTraccar, sanitizeUser, traccarFetch } from './lib/traccar.js';

const sessionStore = new SessionStore(config);
const stateStore = new StateStore(config, paths);
const snapshotCache = new SnapshotCache(config);

const app = express();
const COOKIE_NAME = 'rafacar_sid';

const allowedMethods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const endpointAllowList = [
  /^\/api\/server$/,
  /^\/api\/session$/,
  /^\/api\/users(?:\/\d+)?$/,
  /^\/api\/permissions$/,
  /^\/api\/statistics$/,
  /^\/api\/devices(?:\/\d+)?$/,
  /^\/api\/positions(?:\/\d+)?$/,
  /^\/api\/events$/,
  /^\/api\/groups(?:\/\d+)?$/,
  /^\/api\/drivers(?:\/\d+)?$/,
  /^\/api\/geofences(?:\/\d+)?$/,
  /^\/api\/calendars(?:\/\d+)?$/,
  /^\/api\/attributes\/computed(?:\/\d+)?$/,
  /^\/api\/notifications(?:\/\d+)?$/,
  /^\/api\/notifications\/types$/,
  /^\/api\/maintenance(?:\/\d+)?$/,
  /^\/api\/commands(?:\/\d+)?$/,
  /^\/api\/commands\/types$/,
  /^\/api\/commands\/send$/,
  /^\/api\/reports\/(events|route|trips|stops|summary)$/,
  /^\/api\/geocode$/,
  /^\/api\/geocode\/reverse$/
];

function isAllowedEndpoint(urlPath) {
  return endpointAllowList.some((rx) => rx.test(urlPath));
}

function normalizeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['image', 'webrtc', 'hls'].includes(normalized) ? normalized : 'image';
}

function mediaMtxOrigin() {
  try {
    return new URL(config.mediaMtxUrl).origin;
  } catch {
    return '';
  }
}

function monitoringSummary(state, includeMediaUrl = false) {
  const summary = stateStore.summary(state);
  return includeMediaUrl ? { ...summary, mediaMtxUrl: config.mediaMtxUrl } : summary;
}

async function getSession(req) {
  const sid = parseCookies(req)[COOKIE_NAME];
  if (!sid) return null;
  const session = await sessionStore.get(sid);
  if (session) req.rafacarSession = session;
  return session;
}

async function safePublicConfig(req = null) {
  const session = req ? await getSession(req) : null;
  const state = await stateStore.getState();

  return {
    pollingMs: config.pollingMs,
    authenticated: Boolean(session),
    allowUnsafeGoogleTiles: config.allowUnsafeGoogleTiles,
    mobile: {
      installable: true,
      serviceWorker: true,
      appUrl: config.publicAppUrl || ''
    },
    monitoring: monitoringSummary(state, Boolean(session)),
    cache: {
      snapshotTtlMs: config.snapshotCacheTtlMs,
      redisConfigured: Boolean(config.redisUrl)
    }
  };
}

function publicCamera(camera = {}) {
  return {
    id: String(camera.id || camera.deviceId || ''),
    deviceId: Number(camera.deviceId),
    deviceName: clampText(camera.deviceName, 120),
    label: clampText(camera.label || 'Camera principal', 120),
    streamPath: clampText(camera.streamPath, 320),
    snapshotPath: clampText(camera.snapshotPath, 320),
    mode: normalizeMode(camera.mode),
    enabled: camera.enabled !== false,
    autoOpen: camera.autoOpen !== false,
    createdAt: camera.createdAt || null,
    updatedAt: camera.updatedAt || null
  };
}

function cameraFromBody(body = {}, existing = {}) {
  const deviceId = Number(body.deviceId);
  if (!Number.isFinite(deviceId) || deviceId <= 0) {
    const error = new Error('deviceId inválido para câmera.');
    error.status = 400;
    throw error;
  }

  const streamPath = clampText(body.streamPath, 320).replace(/^\/+/, '');
  const snapshotPath = clampText(body.snapshotPath, 320).replace(/^\/+/, '');
  const enabled = body.enabled !== false;

  if (enabled && !streamPath && !snapshotPath) {
    const error = new Error('Informe o caminho de streaming ou snapshot do MediaMTX.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  return {
    id: String(deviceId),
    deviceId,
    deviceName: clampText(body.deviceName, 120),
    label: clampText(body.label || existing.label || 'Camera principal', 120),
    streamPath,
    snapshotPath,
    mode: normalizeMode(body.mode || existing.mode),
    enabled,
    autoOpen: body.autoOpen !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function mediaUrlFromInput(value) {
  const raw = clampText(value, 600);
  if (!raw) return '';
  const url = new URL(raw, `${config.mediaMtxUrl}/`);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('URL de mídia inválida.');
  }
  const allowedOrigin = mediaMtxOrigin();
  if (!allowedOrigin || url.origin !== allowedOrigin) {
    throw new Error('A evidência deve usar o servidor MediaMTX configurado.');
  }
  return url.href;
}

function mediaUrlFromPathOrUrl({ path: mediaPath = '', url: mediaUrl = '' } = {}) {
  if (mediaUrl) return mediaUrlFromInput(mediaUrl);

  const pathValue = cleanMediaPath(mediaPath);
  if (!pathValue) {
    const error = new Error('Informe o caminho da imagem no MediaMTX.');
    error.status = 400;
    throw error;
  }

  return new URL(pathValue, `${config.mediaMtxUrl}/`).href;
}

function publicEvidence(record = {}) {
  const sourceUrl = clampText(record.sourceUrl || record.imageUrl, 700);
  return {
    id: String(record.id || ''),
    deviceId: Number(record.deviceId || 0) || null,
    deviceName: clampText(record.deviceName, 120),
    title: clampText(record.title || 'Evidência RAFACAR', 160),
    note: clampText(record.note, 1000),
    streamPath: clampText(record.streamPath, 320),
    imageUrl: record.localFile
      ? `/api/monitoring/evidence/${encodeURIComponent(record.id)}/image`
      : (sourceUrl ? `/api/monitoring/media/image?url=${encodeURIComponent(sourceUrl)}` : ''),
    sourceUrl,
    capturedAt: record.capturedAt || record.createdAt || null,
    createdAt: record.createdAt || null,
    createdBy: clampText(record.createdBy, 120)
  };
}

function evidenceFromBody(body = {}, user = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const imageUrl = body.imageUrl ? mediaUrlFromInput(body.imageUrl) : '';
  const snapshotPath = clampText(body.snapshotPath, 320).replace(/^\/+/, '');

  return {
    id,
    deviceId: Number(body.deviceId || 0) || null,
    deviceName: clampText(body.deviceName, 120),
    title: clampText(body.title || `Evidência ${now}`, 160),
    note: clampText(body.note, 1000),
    streamPath: clampText(body.streamPath, 320),
    snapshotPath,
    imageUrl,
    sourceUrl: imageUrl,
    capturedAt: clampText(body.capturedAt || now, 80),
    createdAt: now,
    createdBy: clampText(user.name || user.email || 'usuario', 120),
    localFile: ''
  };
}

async function saveSnapshotEvidence(body = {}, user = {}) {
  const record = evidenceFromBody(body, user);
  const targetUrl = record.imageUrl || mediaUrlFromPathOrUrl({ path: record.snapshotPath, url: body.imageUrl });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(targetUrl, { signal: controller.signal, redirect: 'manual' });
    const type = response.headers.get('content-type') || '';

    if (!response.ok) {
      const error = new Error(`MediaMTX retornou HTTP ${response.status} ao buscar snapshot.`);
      error.status = 502;
      throw error;
    }

    if (!type.startsWith('image/')) {
      const error = new Error('A URL informada não retornou uma imagem.');
      error.status = 415;
      throw error;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 6 * 1024 * 1024) {
      const error = new Error('Imagem maior que 6MB.');
      error.status = 413;
      throw error;
    }

    const saved = await stateStore.saveEvidenceImage(record.id, buffer, type);
    return {
      ...record,
      sourceUrl: targetUrl,
      localFile: saved.localFile || '',
      imageStorage: saved.storage
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Tempo esgotado ao buscar snapshot do MediaMTX.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeProfilePayload(body = {}, currentUser = {}) {
  const payload = { ...(currentUser && typeof currentUser === 'object' ? currentUser : {}) };

  for (const key of ['password', 'token', 'hashedPassword', 'salt']) delete payload[key];

  for (const key of ['name', 'email', 'phone', 'latitude', 'longitude', 'zoom', 'coordinateFormat']) {
    if (body[key] !== undefined) payload[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  }

  if (body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes)) {
    payload.attributes = { ...(currentUser.attributes || {}), ...body.attributes };
  }

  payload.id = currentUser.id;
  return payload;
}

async function requireAuth(req, res, next) {
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Login necessário. Entre com as credenciais do Traccar.' });
  }
  req.rafacarSession = session;
  return next();
}

async function createLocalSession(req, res, remoteCookie, user) {
  const session = await sessionStore.create(remoteCookie, user);
  res.setHeader('Set-Cookie', serializeSessionCookie(COOKIE_NAME, session.sid, cookieOptions(req, config)));
  req.rafacarSession = session;
  return session;
}

async function destroyLocalSession(req, res) {
  const sid = parseCookies(req)[COOKIE_NAME];
  if (sid) await sessionStore.delete(sid);

  const opts = cookieOptions(req, config);
  res.setHeader('Set-Cookie', serializeSessionCookie(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: '/',
    maxAge: 0
  }));
}

async function buildSnapshot(req, { force = false } = {}) {
  const session = req.rafacarSession || await getSession(req);
  if (!session) {
    const error = new Error('Sessão expirada.');
    error.status = 401;
    throw error;
  }

  const scope = session.sid || session.user?.id || session.user?.email || 'default';
  if (!force) {
    const cached = await snapshotCache.get(scope);
    if (cached) return cached;
  }

  const eventsPath = `/api/reports/events?from=${encodeURIComponent(recentIso(config.eventLookbackHours))}&to=${encodeURIComponent(nowIso())}`;

  const [server, devices, positions, events] = await Promise.allSettled([
    traccarFetch(config, session, '/api/server'),
    traccarFetch(config, session, '/api/devices'),
    traccarFetch(config, session, '/api/positions'),
    traccarFetch(config, session, eventsPath)
  ]);

  await sessionStore.update(session);

  const payload = {
    ok: true,
    user: session.user || null,
    server: server.status === 'fulfilled' ? server.value : null,
    devices: devices.status === 'fulfilled' && Array.isArray(devices.value) ? devices.value : [],
    positions: positions.status === 'fulfilled' && Array.isArray(positions.value) ? positions.value : [],
    events: events.status === 'fulfilled' && Array.isArray(events.value) ? events.value : [],
    errors: [server, devices, positions, events]
      .filter((item) => item.status === 'rejected')
      .map((item) => item.reason?.message || String(item.reason)),
    config: await safePublicConfig(req)
  };

  await snapshotCache.set(scope, payload);
  return payload;
}

function sanitizeAskPayload(body = {}) {
  const question = clampText(body.question, 400);
  const vehicles = normalizeArray(body.vehicles).slice(0, 10).map((item) => ({
    id: Number(item.id || 0),
    name: clampText(item.name, 80),
    uniqueId: clampText(item.uniqueId, 80),
    status: clampText(item.status, 40),
    speed: Number(item.speed || 0)
  }));
  const events = normalizeArray(body.events).slice(0, 20).map((item) => ({
    deviceId: Number(item.deviceId || 0),
    type: clampText(item.type, 80),
    eventTime: item.eventTime || null
  }));
  return { question, vehicles, events };
}

async function askAssistant(body = {}) {
  const context = sanitizeAskPayload(body);
  if (!context.question) {
    const error = new Error('Pergunta obrigatória.');
    error.status = 400;
    throw error;
  }

  if (!config.geminiApiKey) {
    const names = context.vehicles.map((item) => item.name).filter(Boolean).join(', ');
    return `IA externa não configurada. Resumo local: veículos no contexto: ${names || 'nenhum'}. Pergunta recebida: ${context.question}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: [
                'Você é um assistente operacional do RAFACAR.',
                'Responda em português do Brasil, de forma objetiva.',
                `Pergunta: ${context.question}`,
                `Veículos: ${JSON.stringify(context.vehicles)}`,
                `Eventos: ${JSON.stringify(context.events)}`
              ].join('\n')
            }]
          }]
        })
      }
    );

    const payload = await response.json();
    const answer = payload?.candidates?.[0]?.content?.parts?.map((item) => item.text).join('\n').trim();

    if (!response.ok || !answer) {
      const error = new Error(payload?.error?.message || 'Falha ao consultar IA.');
      error.status = response.status || 502;
      throw error;
    }
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin, config)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-rafacar-webhook-secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

const connectSrc = ["'self'", 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com', 'https://server.arcgisonline.com'];
const imgSrc = ["'self'", 'data:', 'blob:', 'https:'];
const frameSrc = ["'self'"];
const mediaSrc = ["'self'", 'blob:'];
const mediaOrigin = mediaMtxOrigin();

if (mediaOrigin) {
  connectSrc.push(mediaOrigin);
  imgSrc.push(mediaOrigin);
  frameSrc.push(mediaOrigin);
  mediaSrc.push(mediaOrigin);
}

if (config.allowUnsafeGoogleTiles) {
  connectSrc.push('https://mt0.google.com', 'https://mt1.google.com', 'https://mt2.google.com', 'https://mt3.google.com');
  imgSrc.push('https://mt0.google.com', 'https://mt1.google.com', 'https://mt2.google.com', 'https://mt3.google.com');
}

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "connect-src": connectSrc,
      "img-src": imgSrc,
      "frame-src": frameSrc,
      "media-src": mediaSrc,
      "style-src": ["'self'", "'unsafe-inline'", 'https:'],
      "script-src": ["'self'"],
      "font-src": ["'self'", 'data:'],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "upgrade-insecure-requests": null
    }
  }
}));

app.use(compression());
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(morgan('combined'));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas tentativas de login. Aguarde alguns minutos.' }
});

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 24,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas consultas de IA. Aguarde um momento.' }
});

app.get('/api/health', async (req, res) => {
  const session = await getSession(req);
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'rafacar-dev2-v3',
    authenticated: Boolean(session),
    user: session?.user ? redact(session.user.email || session.user.name) : '',
    redis: await sessionStore.status()
  });
});

app.get('/api/config', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, config: await safePublicConfig(req) });
});

app.get('/api/mobile/status', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, mobile: (await safePublicConfig(req)).mobile });
});

app.post('/api/assistant/ask', requireAuth, assistantLimiter, async (req, res) => {
  try {
    const answer = await askAssistant(req.body || {});
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, answer });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao consultar IA.' });
  }
});

app.get('/api/monitoring/cameras', requireAuth, async (_req, res) => {
  const state = await stateStore.getState();
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    mediaMtxUrl: config.mediaMtxUrl,
    cameras: state.cameras.map(publicCamera).filter((camera) => Number.isFinite(camera.deviceId) && camera.deviceId > 0)
  });
});

app.post('/api/monitoring/cameras', requireAuth, async (req, res) => {
  try {
    const state = await stateStore.getState();
    const deviceId = Number(req.body?.deviceId);
    const current = state.cameras.find((item) => Number(item.deviceId) === deviceId) || {};
    const nextCamera = cameraFromBody(req.body || {}, current);
    const cameras = state.cameras.filter((item) => Number(item.deviceId) !== deviceId);
    cameras.unshift(nextCamera);
    await stateStore.saveState({ ...state, cameras });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, camera: publicCamera(nextCamera), cameras: cameras.map(publicCamera) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Falha ao salvar câmera.' });
  }
});

app.delete('/api/monitoring/cameras/:deviceId', requireAuth, async (req, res) => {
  const state = await stateStore.getState();
  const deviceId = Number(req.params.deviceId);
  const cameras = state.cameras.filter((camera) => Number(camera.deviceId) !== deviceId);
  await stateStore.saveState({ ...state, cameras });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, cameras: cameras.map(publicCamera) });
});

app.get('/api/monitoring/media/image', requireAuth, async (req, res) => {
  try {
    const targetUrl = mediaUrlFromPathOrUrl({ path: req.query.path, url: req.query.url });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(targetUrl, { signal: controller.signal, redirect: 'manual' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok) {
        return res.status(502).json({ ok: false, error: `MediaMTX retornou HTTP ${response.status}.` });
      }
      if (!type.startsWith('image/')) {
        return res.status(415).json({ ok: false, error: 'Mídia não é imagem.' });
      }
      res.set('Cache-Control', 'private, no-store');
      res.set('Content-Type', type);
      res.send(Buffer.from(await response.arrayBuffer()));
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao buscar imagem do MediaMTX.' });
  }
});

app.get('/api/monitoring/evidence', requireAuth, async (_req, res) => {
  const state = await stateStore.getState();
  const evidence = state.evidence
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(publicEvidence);

  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, evidence });
});

app.post('/api/monitoring/evidence', requireAuth, async (req, res) => {
  try {
    const state = await stateStore.getState();
    const record = evidenceFromBody(req.body || {}, req.rafacarSession?.user || {});
    const evidence = [record, ...state.evidence].slice(0, 1000);
    await stateStore.saveState({ ...state, evidence });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, evidence: publicEvidence(record) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Falha ao salvar evidência.' });
  }
});

app.post('/api/monitoring/evidence/snapshot', requireAuth, async (req, res) => {
  try {
    const state = await stateStore.getState();
    const record = await saveSnapshotEvidence(req.body || {}, req.rafacarSession?.user || {});
    const evidence = [record, ...state.evidence].slice(0, 1000);
    await stateStore.saveState({ ...state, evidence });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, evidence: publicEvidence(record) });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao capturar snapshot.' });
  }
});

app.get('/api/monitoring/evidence/:id/image', requireAuth, async (req, res) => {
  const state = await stateStore.getState();
  const record = state.evidence.find((item) => String(item.id) === String(req.params.id));
  if (!record) return res.status(404).json({ ok: false, error: 'Imagem de evidência não encontrada.' });

  const image = await stateStore.getEvidenceImage(record);
  if (!image) return res.status(404).json({ ok: false, error: 'Arquivo de evidência não encontrado.' });

  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', image.contentType || 'image/jpeg');
  res.send(image.buffer);
});

app.delete('/api/monitoring/evidence/:id', requireAuth, async (req, res) => {
  const state = await stateStore.getState();
  const record = state.evidence.find((item) => String(item.id) === String(req.params.id));
  const evidence = state.evidence.filter((item) => String(item.id) !== String(req.params.id));
  await stateStore.saveState({ ...state, evidence });
  if (record) await stateStore.deleteEvidenceImage(record);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, evidence: evidence.map(publicEvidence) });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const login = String(body.email || body.user || body.username || '').trim();
    const password = String(body.password || '');

    if (!login || login.length > 180) {
      return res.status(400).json({ ok: false, error: 'Usuário/e-mail inválido.' });
    }
    if (!password || password.length > 300) {
      return res.status(400).json({ ok: false, error: 'Senha inválida.' });
    }

    const { remoteCookie, user } = await loginToTraccar(config, login, password);
    await createLocalSession(req, res, remoteCookie, user);

    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, user, config: await safePublicConfig(req) });
  } catch (error) {
    return res.status(error.status || 401).json({ ok: false, error: error.message || 'Login inválido no Traccar.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await destroyLocalSession(req, res);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const remoteUser = await traccarFetch(config, req.rafacarSession, '/api/session');
    req.rafacarSession.user = sanitizeUser(remoteUser, req.rafacarSession.user?.email || '');
    await sessionStore.update(req.rafacarSession);

    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      authenticated: true,
      user: req.rafacarSession.user,
      config: await safePublicConfig(req)
    });
  } catch {
    await destroyLocalSession(req, res);
    res.status(401).json({ ok: false, authenticated: false, error: 'Sessão expirada. Faça login novamente.' });
  }
});

app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.rafacarSession?.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'Usuário logado sem ID válido no Traccar.' });
    }

    const profile = await traccarFetch(config, req.rafacarSession, `/api/users/${userId}`);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, user: profile });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao carregar usuário logado.' });
  }
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.rafacarSession?.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'Usuário logado sem ID válido no Traccar.' });
    }

    const currentUser = await traccarFetch(config, req.rafacarSession, `/api/users/${userId}`);
    const payload = sanitizeProfilePayload(req.body || {}, currentUser || {});
    const updated = await traccarFetch(config, req.rafacarSession, `/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    req.rafacarSession.user = sanitizeUser(updated || payload, req.rafacarSession.user?.email || '');
    await sessionStore.update(req.rafacarSession);

    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, user: updated || payload });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao atualizar usuário logado.' });
  }
});

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await buildSnapshot(req));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao carregar dados iniciais.' });
  }
});

app.get('/api/snapshot', requireAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await buildSnapshot(req));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao atualizar dados.' });
  }
});

app.get('/api/command-types', requireAuth, async (req, res) => {
  try {
    const deviceId = Number(req.query.deviceId);
    const query = Number.isFinite(deviceId) && deviceId > 0 ? `?deviceId=${deviceId}` : '';
    const payload = await traccarFetch(config, req.rafacarSession, `/api/commands/types${query}`);
    res.set('Cache-Control', 'no-store');
    res.json(Array.isArray(payload) ? payload : []);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao carregar comandos.' });
  }
});

app.post('/api/send-command', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const deviceId = Number(body.deviceId);
    const type = String(body.type || '').trim();

    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      return res.status(400).json({ ok: false, error: 'deviceId inválido.' });
    }
    if (!type || type.length > 80) {
      return res.status(400).json({ ok: false, error: 'Tipo de comando inválido.' });
    }

    const attributes = body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes)
      ? body.attributes
      : {};
    const command = { id: 0, deviceId, type, attributes };

    const payload = await traccarFetch(config, req.rafacarSession, '/api/commands/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });

    res.json({ ok: true, command: payload });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao enviar comando.' });
  }
});

app.all('/api/traccar/*', requireAuth, async (req, res) => {
  try {
    if (!allowedMethods.has(req.method)) {
      return res.status(405).json({ ok: false, error: 'Método não permitido.' });
    }

    const rawPath = `/${req.params[0] || ''}`.replace(/\/+/g, '/');
    const apiPath = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`;

    if (!isAllowedEndpoint(apiPath)) {
      return res.status(403).json({ ok: false, error: 'Endpoint não autorizado.', apiPath });
    }

    const query = new URLSearchParams(req.query).toString();
    const finalPath = query ? `${apiPath}?${query}` : apiPath;
    const hasBody = !['GET', 'HEAD'].includes(req.method);

    const payload = await traccarFetch(config, req.rafacarSession, finalPath, {
      method: req.method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : {},
      body: hasBody ? JSON.stringify(req.body || {}) : undefined
    });

    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || 'Falha ao conectar ao Traccar.' });
  }
});

app.use(express.static(paths.distDir, {
  etag: true,
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('*', (_req, res) => {
  const file = path.join(paths.distDir, 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return res.status(503).send('Frontend não compilado. Execute npm run build.');
});

app.use((error, _req, res, _next) => {
  console.error('[server]', error);
  res.status(500).json({ ok: false, error: 'Erro interno no RAFACAR.' });
});

export default app;
