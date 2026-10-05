import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { dataScopeContext } from './data-scope.context.js';
import { DataScopeService } from './data-scope.service.js';

interface RequestWithUser {
  user?: { id?: string };
}

@Injectable()
export class DataScopeInterceptor implements NestInterceptor {
  constructor(private readonly dataScopeService: DataScopeService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (!userId) {
      // 公开接口或未注入用户：不建立数据范围，直接透传
      return next.handle();
    }

    const scope = await this.dataScopeService.resolveScope(userId);
    return new Observable<unknown>((subscriber) => {
      dataScopeContext.run(scope, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
