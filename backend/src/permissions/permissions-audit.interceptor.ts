import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { from, Observable, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthenticatedUser } from '../auth/authenticated-user.interface.js';

type AuditedRequest = Request & {
  user?: AuthenticatedUser;
  params: Record<string, string>;
};

@Injectable()
export class PermissionsAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PermissionsAuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const action =
      method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
    const id = request.params.id;
    const userId = request.user?.id;

    return next.handle().pipe(
      switchMap((result) =>
        from(
          this.prisma.auditEvent.create({
            data: {
              userId: userId ? BigInt(userId) : null,
              action,
              module: 'permissions',
              targetType: request.route?.path ?? request.path,
              targetId: id ?? null,
              ip: request.ip,
            },
            select: { id: true },
          }),
        ).pipe(
          switchMap(() => from([result])),
        ),
      ),
    );
  }
}
