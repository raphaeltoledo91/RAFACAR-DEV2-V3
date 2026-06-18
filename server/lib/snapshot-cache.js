import { createRedisAdapter } from './redis-client.js';

export class SnapshotCache {
  constructor(config) {
    this.config = config;
    this.memory = new Map();
    this.redis = createRedisAdapter(config, 'snapshot cache');
  }

  key(scope) {
    return `${this.config.redisPrefix}:snapshot:${scope}`;
  }

  async get(scope) {
    if (this.redis && await this.redis.available()) {
      const raw = await this.redis.get(this.key(scope));
      return raw ? JSON.parse(raw) : null;
    }
    const entry = this.memory.get(scope);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.memory.delete(scope);
      return null;
    }
    return entry.payload;
  }

  async set(scope, payload) {
    const ttl = Math.max(1000, this.config.snapshotCacheTtlMs);
    if (this.redis && await this.redis.set(this.key(scope), JSON.stringify(payload), { px: ttl })) {
      return;
    }
    this.memory.set(scope, {
      payload,
      expiresAt: Date.now() + ttl
    });
  }

  async delete(scope) {
    if (this.redis && await this.redis.del(this.key(scope))) {
      return;
    }
    this.memory.delete(scope);
  }
}
