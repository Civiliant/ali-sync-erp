import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user.interface.js';
import { IS_PUBLIC_KEY } from './auth.constants.js';
import { AuthService } from './auth.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    request.user = await this.authService.verifyAccessToken(match[1]);
    return true;
  }
}
