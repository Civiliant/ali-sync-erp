import { Global, Module } from '@nestjs/common';
import { REFRESH_TOKEN_STORE } from './refresh-token-store.js';
import { RedisRefreshTokenStore } from './redis-refresh-token.store.js';

@Global()
@Module({
  providers: [
    RedisRefreshTokenStore,
    {
      provide: REFRESH_TOKEN_STORE,
      useExisting: RedisRefreshTokenStore,
    },
  ],
  exports: [REFRESH_TOKEN_STORE],
})
export class RedisRefreshTokenModule {}
