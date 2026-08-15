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

/**
 * Fixed-window throttle for public password endpoints.
 * Forgot is keyed by route + IP + email; set/reset by route + IP (token guessing).
 */
@Injectable()
export class PasswordPublicRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: LoginRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const route = this.routeFromPath(req.path || req.url || '');
    const ip = this.clientIp(req);
    const includeEmail = route.includes('forgot');
    const emailRaw =
      typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
        ? (req.body as { email: string }).email
        : '';
    const email = emailRaw ? normalizeEmail(emailRaw) : '';
    const key = includeEmail ? `${route}:${ip}:${email}` : `${route}:${ip}`;

    const result = this.rateLimit.consume(key);
    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private routeFromPath(path: string): string {
    if (path.includes('admin/forgot-password')) return 'admin-forgot';
    if (path.includes('admin/reset-password')) return 'admin-reset';
    if (path.includes('forgot-password')) return 'user-forgot';
    if (path.includes('reset-password')) return 'user-reset';
    if (path.includes('set-password')) return 'set-password';
    return 'password-public';
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
