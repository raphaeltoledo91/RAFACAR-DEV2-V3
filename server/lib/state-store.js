import fs from 'node:fs';
import path from 'node:path';
import { createRedisAdapter } from './redis-client.js';
import { clampText } from './utils.js';

export class StateStore {
  constructor(config, paths) {
    this.config = config;
    this.paths = paths;
    this.redis = createRedisAdapter(config, 'state store');
    this.imageTtlSeconds = 30 * 24 * 60 * 60;
  }

  stateKey() {
    return `${this.config.redisPrefix}:monitoring:state`;
  }

  imageKey(id) {
    return `${this.config.redisPrefix}:monitoring:evidence:${id}:image`;
  }

  initialState() {
    return { mediaMtxUrl: this.config.mediaMtxUrl, cameras: [], evidence: [] };
  }

  readLocalState() {
    try {
      if (!fs.existsSync(this.paths.monitoringStateFile)) {
        const initial = this.initialState();
        fs.writeFileSync(this.paths.monitoringStateFile, `${JSON.stringify(initial, null, 2)}\n`);
        return initial;
      }
      return JSON.parse(fs.readFileSync(this.paths.monitoringStateFile, 'utf8'));
    } catch {
      return this.initialState();
    }
  }

  writeLocalState(state) {
    fs.writeFileSync(this.paths.monitoringStateFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  normalizeState(state = {}) {
    return {
      mediaMtxUrl: clampText(state.mediaMtxUrl || this.config.mediaMtxUrl, 300).replace(/\/+$/, ''),
      cameras: Array.isArray(state.cameras) ? state.cameras : [],
      evidence: Array.isArray(state.evidence) ? state.evidence : []
    };
  }

  async getState() {
    if (this.redis && await this.redis.available()) {
      const raw = await this.redis.get(this.stateKey());
      if (raw) return this.normalizeState(JSON.parse(raw));
      const local = this.normalizeState(this.initialState());
      await this.redis.set(this.stateKey(), JSON.stringify(local));
      return local;
    }
    return this.normalizeState(this.readLocalState());
  }

  async saveState(nextState) {
    const state = this.normalizeState(nextState);
    if (this.redis && await this.redis.set(this.stateKey(), JSON.stringify(state))) {
      return state;
    }
    this.writeLocalState(state);
    return state;
  }

  summary(state) {
    const current = this.normalizeState(state);
    return {
      mediaMtxUrl: current.mediaMtxUrl,
      camerasConfigured: current.cameras.length,
      evidenceCount: current.evidence.length
    };
  }

  async saveEvidenceImage(recordId, buffer, contentType = 'image/jpeg') {
    if (this.redis && await this.redis.available()) {
      const payload = JSON.stringify({
        contentType,
        body: buffer.toString('base64')
      });
      if (await this.redis.set(this.imageKey(recordId), payload, { ex: this.imageTtlSeconds })) {
        return { storage: this.redis.provider, localFile: '' };
      }
    }

    const extension = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
    const filename = `${recordId}${extension}`;
    const absolute = path.join(this.paths.evidenceDir, filename);
    fs.writeFileSync(absolute, buffer);
    return { storage: 'file', localFile: filename };
  }

  async getEvidenceImage(record) {
    if (!record?.id) return null;
    if (this.redis && await this.redis.available()) {
      const raw = await this.redis.get(this.imageKey(record.id));
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return {
        contentType: payload.contentType || 'image/jpeg',
        buffer: Buffer.from(payload.body || '', 'base64')
      };
    }

    if (!record.localFile) return null;
    const absolute = path.join(this.paths.evidenceDir, record.localFile);
    if (!fs.existsSync(absolute)) return null;
    const ext = path.extname(absolute).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      contentType,
      buffer: fs.readFileSync(absolute)
    };
  }

  async deleteEvidenceImage(record) {
    if (!record?.id) return;
    if (this.redis && await this.redis.del(this.imageKey(record.id))) {
      return;
    }
    if (!record.localFile) return;
    const absolute = path.join(this.paths.evidenceDir, record.localFile);
    if (fs.existsSync(absolute)) {
      try {
        fs.unlinkSync(absolute);
      } catch {
        // ignore
      }
    }
  }
}
