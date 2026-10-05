import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { REFRESH_TOKEN_STORE } from './refresh-token-store.js';
import { RedisRefreshTokenModule } from './redis-refresh-token.module.js';

@Module({
  imports: [
    JwtModule.register({}),
    PrismaModule,
    RedisRefreshTokenModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
