import IORedis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

function isIORedisReady(redis) {
  return Boolean(redis && ['connect', 'ready'].includes(redis.status));
}

function warn(label, error) {
  console.warn(`[redis] ${label} fallback:`, error?.message || String(error));
}

export function redisConfigured(config) {
  return Boolean(config.redisUrl || (config.upstashRedisRestUrl && config.upstashRedisRestToken));
}

class IORedisAdapter {
  constructor(config, label) {
    this.provider = 'redis';
    this.label = label;
    this.redis = new IORedis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true
    });
    this.redis.on('error', (error) => warn(this.label, error));
  }

  async available() {
    if (isIORedisReady(this.redis)) return true;
    try {
      await this.redis.connect();
    } catch (error) {
      warn(this.label, error);
    }
    return isIORedisReady(this.redis);
  }

  async get(key) {
    if (!await this.available()) return null;
    try {
      return await this.redis.get(key);
    } catch (error) {
      warn(this.label, error);
      return null;
    }
  }

  async set(key, value, options = {}) {
    if (!await this.available()) return false;
    try {
      if (options.px) await this.redis.set(key, value, 'PX', options.px);
      else if (options.ex) await this.redis.set(key, value, 'EX', options.ex);
      else await this.redis.set(key, value);
      return true;
    } catch (error) {
      warn(this.label, error);
      return false;
    }
  }

  async del(key) {
    if (!await this.available()) return false;
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      warn(this.label, error);
      return false;
    }
  }
}

class UpstashAdapter {
  constructor(config, label) {
    this.provider = 'upstash';
    this.label = label;
    this.disabled = false;
    this.redis = new UpstashRedis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
      automaticDeserialization: false
    });
  }

  async available() {
    return !this.disabled;
  }

  async get(key) {
    if (this.disabled) return null;
    try {
      const value = await this.redis.get(key);
      if (value === null || value === undefined) return null;
      return typeof value === 'string' ? value : JSON.stringify(value);
    } catch (error) {
      this.disabled = true;
      warn(this.label, error);
      return null;
    }
  }

  async set(key, value, options = {}) {
    if (this.disabled) return false;
    try {
      await this.redis.set(key, value, options);
      return true;
    } catch (error) {
      this.disabled = true;
      warn(this.label, error);
      return false;
    }
  }

  async del(key) {
    if (this.disabled) return false;
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      this.disabled = true;
      warn(this.label, error);
      return false;
    }
  }
}

export function createRedisAdapter(config, label) {
  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    return new UpstashAdapter(config, label);
  }
  if (config.redisUrl) {
    return new IORedisAdapter(config, label);
  }
  return null;
}
