import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const evidenceDir = path.join(dataDir, 'evidence-media');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

function truthy(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['false', '0', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

export const paths = {
  rootDir,
  dataDir,
  evidenceDir,
  distDir: path.join(rootDir, 'dist'),
  monitoringStateFile: path.join(dataDir, 'monitoring.local.json')
};

export const config = {
  port: Number(process.env.PORT || 3000),
  traccarUrl: String(process.env.TRACCAR_URL || 'https://gps2.rafacarrastreadores.com.br').replace(/\/+$/, ''),
  mediaMtxUrl: String(process.env.MEDIA_MTX_URL || process.env.MEDIAMTX_URL || 'http://mtx.getautoflow.com.br').replace(/\/+$/, ''),
  publicAppUrl: String(process.env.PUBLIC_APP_URL || '').replace(/\/+$/, ''),
  pollingMs: Number(process.env.POLLING_MS || 30000),
  snapshotCacheTtlMs: Number(process.env.SNAPSHOT_CACHE_TTL_MS || 5000),
  eventLookbackHours: Number(process.env.EVENT_LOOKBACK_HOURS || 24),
  allowUnsafeGoogleTiles: truthy(process.env.ALLOW_UNSAFE_GOOGLE_TILES, true),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000),
  cookieSameSite: String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  cookieSecure: process.env.COOKIE_SECURE ?? '',
  corsOrigins: String(process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim().replace(/\/+$/, '')).filter(Boolean),
  redisUrl: String(process.env.REDIS_URL || '').trim(),
  upstashRedisRestUrl: String(process.env.UPSTASH_REDIS_REST_URL || '').trim(),
  upstashRedisRestToken: String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_READ_WRITE_TOKEN || '').trim(),
  redisPrefix: String(process.env.REDIS_PREFIX || 'rafacar:v3').trim(),
  geminiApiKey: String(process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: String(process.env.GEMINI_MODEL || 'gemini-flash-latest').replace(/^models\//, ''),
  traccarWebhookSecret: String(process.env.TRACCAR_WEBHOOK_SECRET || '').trim()
};
