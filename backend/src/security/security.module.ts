import { Global, Module } from '@nestjs/common';
import { LOGIN_RATE_LIMIT_STORE } from './rate-limit.constants.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RedisLoginRateLimitStore } from './redis-login-rate-limit.store.js';
import { SSRF_DNS_RESOLVER, SsrfGuard } from './ssrf.guard.js';
import { lookup } from 'node:dns/promises';

@Global()
@Module({
  providers: [
    SsrfGuard,
    {
      provide: SSRF_DNS_RESOLVER,
      useValue: async (hostname: string) => lookup(hostname, { all: true, verbatim: true }),
    },
    RateLimitGuard,
    RedisLoginRateLimitStore,
    { provide: LOGIN_RATE_LIMIT_STORE, useExisting: RedisLoginRateLimitStore },
  ],
  exports: [SsrfGuard, RateLimitGuard, LOGIN_RATE_LIMIT_STORE],
})
export class SecurityModule {}
