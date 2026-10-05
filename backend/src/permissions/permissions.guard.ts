import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../auth/authenticated-user.interface.js';
import { REQUIRED_PERMISSIONS } from './permissions.constants.js';
import { PermissionsService } from './permissions.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    if (!request.user?.id) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const granted = await this.permissionsService.hasAllPermissions(
      request.user.id,
      requiredPermissions,
    );
    if (!granted) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
