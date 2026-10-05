import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DataScopeInterceptor } from './data-scope.interceptor.js';
import { DataScopeService } from './data-scope.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    DataScopeService,
    DataScopeInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: DataScopeInterceptor,
    },
  ],
  exports: [DataScopeService],
})
export class DataScopeModule {}
