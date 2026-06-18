import { createRedisAdapter, redisConfigured } from './redis-client.js';
import { randomId } from './utils.js';

export class SessionStore {
  constructor(config) {
    this.config = config;
    this.memory = new Map();
    this.redis = createRedisAdapter(config, 'session store');
  }

  key(sid) {
    return `${this.config.redisPrefix}:session:${sid}`;
  }

  async create(remoteCookie, user) {
    const sid = randomId();
    const now = Date.now();
    const session = {
      sid,
      remoteCookie,
      user,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + this.config.sessionTtlMs
    };
    await this.set(sid, session);
    return session;
  }

  async set(sid, session) {
    if (this.redis && await this.redis.set(this.key(sid), JSON.stringify(session), { px: this.config.sessionTtlMs })) {
      return;
    }
    this.memory.set(sid, session);
  }

  async get(sid) {
    if (!sid) return null;

    if (this.redis && await this.redis.available()) {
      const raw = await this.redis.get(this.key(sid));
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.expiresAt || session.expiresAt <= Date.now()) {
        await this.delete(sid);
        return null;
      }
      session.lastSeenAt = Date.now();
      session.expiresAt = Date.now() + this.config.sessionTtlMs;
      await this.set(sid, session);
      return session;
    }

    const session = this.memory.get(sid);
    if (!session) return null;
    if (!session.expiresAt || session.expiresAt <= Date.now()) {
      this.memory.delete(sid);
      return null;
    }
    session.lastSeenAt = Date.now();
    session.expiresAt = Date.now() + this.config.sessionTtlMs;
    this.memory.set(sid, session);
    return session;
  }

  async delete(sid) {
    if (!sid) return;
    if (this.redis && await this.redis.del(this.key(sid))) {
      return;
    }
    this.memory.delete(sid);
  }

  async update(session) {
    if (!session?.sid) return null;
    session.lastSeenAt = Date.now();
    session.expiresAt = Date.now() + this.config.sessionTtlMs;
    await this.set(session.sid, session);
    return session;
  }

  async status() {
    const redisConnected = this.redis ? await this.redis.available() : false;
    return {
      provider: redisConnected ? this.redis.provider : 'memory',
      redisConfigured: redisConfigured(this.config),
      redisConnected
    };
  }
}
