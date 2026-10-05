import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { DataScopeModule } from './data-scope/data-scope.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    AuthModule,
    PermissionsModule,
    DataScopeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
