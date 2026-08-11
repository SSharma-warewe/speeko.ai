import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Shared-secret guard for worker → API callbacks.
 * Header: X-Worker-Secret
 */
@Injectable()
export class WorkerSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('WORKER_CALLBACK_SECRET');
    if (!expected?.trim()) {
      throw new UnauthorizedException(
        'WORKER_CALLBACK_SECRET is not configured on the API',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided =
      (req.headers['x-worker-secret'] as string | undefined) ??
      (req.headers['X-Worker-Secret'] as string | undefined);

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid worker secret');
    }
    return true;
  }
}
