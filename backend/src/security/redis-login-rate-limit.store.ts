import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import type { LoginRateLimitStore, RateLimitOptions } from './rate-limit.constants.js';

function rateLimited(message: string): HttpException {
  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class RedisLoginRateLimitStore implements LoginRateLimitStore, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    this.redis = new Redis(configService.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async assertAllowed(ip: string, account: string, options: RateLimitOptions): Promise<void> {
    try {
      const keys = this.keys(ip, account);
      const blocked = await this.redis.mget(...keys.map((key) => `${key}:blocked`));
      if (blocked.some((value) => value !== null)) throw rateLimited('Too many login attempts');
      const counts = await this.redis.mget(...keys);
      if (counts.some((value) => Number(value ?? 0) >= options.limit)) {
        await Promise.all(keys.map((key) => this.redis.set(`${key}:blocked`, '1', 'EX', options.blockSeconds)));
        throw rateLimited('Too many login attempts');
      }
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
      throw rateLimited('Login rate limiter is unavailable');
    }
  }

  async recordFailure(ip: string, account: string, options: RateLimitOptions): Promise<void> {
    try {
      await Promise.all(this.keys(ip, account).map(async (key) => {
        await this.redis.set(key, '0', 'EX', options.windowSeconds, 'NX');
        const count = await this.redis.incr(key);
        if (count >= options.limit) await this.redis.set(`${key}:blocked`, '1', 'EX', options.blockSeconds);
      }));
    } catch {
      throw rateLimited('Login rate limiter is unavailable');
    }
  }

  async clearFailures(ip: string, account: string): Promise<void> {
    try {
      const accountKey = this.keys(ip, account)[1];
      await this.redis.del(accountKey);
    } catch {
      throw rateLimited('Login rate limiter is unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  private keys(ip: string, account: string): [string, string] {
    return [
      `auth:login:ip:${this.digest(ip)}`,
      `auth:login:account:${this.digest(account.toLowerCase())}`,
    ];
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
