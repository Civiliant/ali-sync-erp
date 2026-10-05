import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { LoginDto } from '../auth/dto/login.dto.js';
import { LOGIN_RATE_LIMIT_STORE, RATE_LIMIT_METADATA } from './rate-limit.constants.js';
import type { LoginRateLimitStore, RateLimitOptions } from './rate-limit.constants.js';

type LoginRequest = Request & { body?: Partial<LoginDto> };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(LOGIN_RATE_LIMIT_STORE) private readonly store: LoginRateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
      context.getHandler(), context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<LoginRequest>();
    const account = request.body?.username;
    if (typeof account !== 'string' || account.length < 1 || account.length > 64) {
      throw new HttpException('Login rate limit identity is invalid', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.store.assertAllowed(request.ip || request.socket.remoteAddress || 'unknown', account, options);
    return true;
  }
}
