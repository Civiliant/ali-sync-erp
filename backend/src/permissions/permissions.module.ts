import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PermissionsService } from './permissions.service.js';
import { PermissionsAuditInterceptor } from './permissions-audit.interceptor.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    PermissionsGuard,
    PermissionsAuditInterceptor,
    {
      provide: APP_GUARD,
      useExisting: PermissionsGuard,
    },
  ],
  exports: [PermissionsService, PermissionsAuditInterceptor],
})
export class PermissionsModule {}
