import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisLoginRateLimitStore } from './redis-login-rate-limit.store.js';
import type { RateLimitOptions } from './rate-limit.constants.js';

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}));

describe('RedisLoginRateLimitStore', () => {
  const options: RateLimitOptions = { limit: 5, windowSeconds: 60, blockSeconds: 300 };
  let redis: {
    mget: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let store: RedisLoginRateLimitStore;

  beforeEach(() => {
    redis = {
      mget: vi.fn().mockResolvedValue([null, null]),
      set: vi.fn().mockResolvedValue('OK'),
      incr: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      disconnect: vi.fn(),
    };
    vi.mocked(Redis).mockImplementation(function () {
      return redis as unknown as Redis;
    } as unknown as typeof Redis);
    store = new RedisLoginRateLimitStore({
      get: (_key: string, fallback?: string) => fallback,
    } as ConfigService);
  });

  it('allows attempts below threshold and checks both IP and account counters', async () => {
    await expect(store.assertAllowed('203.0.113.7', 'buyer', options)).resolves.toBeUndefined();
    expect(redis.mget).toHaveBeenCalledTimes(2);
    expect(redis.mget.mock.calls[1][0]).toMatch(/^auth:login:ip:[a-f\d]{64}$/);
    expect(redis.mget.mock.calls[1][1]).toMatch(/^auth:login:account:[a-f\d]{64}$/);
  });

  it('returns 429 when either dimension reaches the configured threshold', async () => {
    redis.mget.mockResolvedValueOnce([null, null]).mockResolvedValueOnce(['5', '0']);
    await expect(store.assertAllowed('203.0.113.7', 'buyer', options)).rejects.toMatchObject({
      status: 429,
    });
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/:blocked$/), '1', 'EX', 300);
  });

  it('increments both counters, applies an expiry window, and blocks at threshold', async () => {
    redis.incr.mockResolvedValue(5);
    await store.recordFailure('203.0.113.7', 'buyer', options);
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:login:ip:/), '0', 'EX', 60, 'NX');
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^auth:login:account:/), '0', 'EX', 60, 'NX');
    expect(redis.incr).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/:blocked$/), '1', 'EX', 300);
  });

  it('clears only the successful account counter, preserving IP budget and any active lock', async () => {
    await store.clearFailures('203.0.113.7', 'buyer');
    expect(redis.del).toHaveBeenCalledOnce();
    expect(redis.del.mock.calls[0]).toHaveLength(1);
    expect(redis.del.mock.calls[0][0]).toMatch(/^auth:login:account:/);
  });
});
