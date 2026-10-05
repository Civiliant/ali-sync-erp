import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_METADATA } from './rate-limit.constants.js';
import type { LoginRateLimitStore, RateLimitOptions } from './rate-limit.constants.js';
import { RateLimitGuard } from './rate-limit.guard.js';

describe('RateLimitGuard', () => {
  const options: RateLimitOptions = { limit: 5, windowSeconds: 60, blockSeconds: 300 };
  const getAllAndOverride = vi.fn();
  const assertAllowed = vi.fn();
  const store: LoginRateLimitStore = {
    assertAllowed,
    recordFailure: vi.fn(),
    clearFailures: vi.fn(),
  };
  const guard = new RateLimitGuard(
    { getAllAndOverride } as unknown as Reflector,
    store,
  );

  function context(username = 'operator') {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => ({ body: { username }, ip: '8.8.8.8' }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue(options);
    assertAllowed.mockResolvedValue(undefined);
  });

  it('checks IP and account against the configured rate window', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(RATE_LIMIT_METADATA, expect.any(Array));
    expect(assertAllowed).toHaveBeenCalledWith('8.8.8.8', 'operator', options);
  });

  it('propagates HTTP 429 when the threshold has been reached', async () => {
    assertAllowed.mockRejectedValue(new HttpException('limited', HttpStatus.TOO_MANY_REQUESTS));
    await expect(guard.canActivate(context())).rejects.toMatchObject({ status: 429 });
  });

  it('does not limit routes without rate-limit metadata', async () => {
    getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('rejects invalid account identities before Redis access', async () => {
    await expect(guard.canActivate(context(''))).rejects.toMatchObject({ status: 429 });
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('uses only the account identity from the body and passes the remote IP', async () => {
    const request = {
      body: { username: 'owner', ip: 'spoofed' },
      ip: '8.8.4.4',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const ctx = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(assertAllowed).toHaveBeenCalledWith('8.8.4.4', 'owner', options);
  });
});
