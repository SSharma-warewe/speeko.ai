import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { normalizeEmail } from '../../common/password.util';
import { LoginRateLimitService } from '../login-rate-limit.service';

export type LoginRateLimitRoute = 'user-login' | 'admin-login';

/**
 * Fixed-window login throttle keyed by route + client IP + email.
 * Apply only to POST /auth/login and POST /auth/admin/login.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: LoginRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const route = this.routeFromPath(req.path || req.url || '');
    const ip = this.clientIp(req);
    const emailRaw =
      typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
        ? (req.body as { email: string }).email
        : '';
    const email = emailRaw ? normalizeEmail(emailRaw) : '';
    const key = `${route}:${ip}:${email}`;

    const result = this.rateLimit.consume(key);
    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many login attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private routeFromPath(path: string): LoginRateLimitRoute {
    if (path.includes('admin/login')) {
      return 'admin-login';
    }
    return 'user-login';
  }

  private clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}
