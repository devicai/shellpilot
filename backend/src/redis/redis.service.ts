import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIG } from '../config/config.loader';
import { ShellpilotModuleConfig } from '../config/config.types';

const GET_DEL_SCRIPT = `
  local v = redis.call('GET', KEYS[1])
  if v then redis.call('DEL', KEYS[1]) end
  return v
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(@Inject(CONFIG) private readonly config: ShellpilotModuleConfig) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password || undefined,
      db: this.config.redis.db ?? 0,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /** Atomically GET and DEL a key. Returns null if key did not exist. */
  async getDel(key: string): Promise<string | null> {
    const result = await this.client.eval(GET_DEL_SCRIPT, 1, key);
    return result as string | null;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }
}
