import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RefreshTokenStore } from './refresh-token-store.js';

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class RedisRefreshTokenStore
  implements RefreshTokenStore, OnModuleDestroy
{
  private readonly redis: Redis;

  constructor(configService: ConfigService) {
    this.redis = new Redis(
      configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
      {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      },
    );
  }

  async add(userId: string, tokenId: string): Promise<void> {
    await this.redis.set(
      this.key(userId, tokenId),
      '1',
      'EX',
      REFRESH_TOKEN_TTL_SECONDS,
    );
  }

  async consume(userId: string, tokenId: string): Promise<boolean> {
    const consumed = await this.redis.getdel(this.key(userId, tokenId));
    return consumed !== null;
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  private key(userId: string, tokenId: string): string {
    return `auth:refresh:${userId}:${tokenId}`;
  }
}
