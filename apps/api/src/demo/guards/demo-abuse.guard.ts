import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { clientIp } from '../../common/client-ip';
import {
  normalizeOrigin,
  parseCorsOriginAllowlist,
} from '../../common/cors-origin';
import { throwTooManyRequests } from '../../common/http-too-many-requests';
import { normalizeEmail } from '../../common/password.util';
import { demoPhoneDigits } from '../demo-form.constants';
import { DemoRateLimitService } from '../demo-rate-limit.service';

/**
 * Public get-demo abuse controls: optional Origin allowlist + multi-key rate limit.
 */
@Injectable()
export class DemoAbuseGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly rateLimit: DemoRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    this.assertAllowedOrigin(req);

    const body = (req.body ?? {}) as { phone?: unknown; email?: unknown };
    const phoneDigits =
      typeof body.phone === 'string' ? demoPhoneDigits(body.phone) : '';
    const email =
      typeof body.email === 'string' && body.email.trim()
        ? normalizeEmail(body.email)
        : '';

    const result = this.rateLimit.consumeAttempt({
      ip: clientIp(req),
      phoneDigits,
      email,
    });
    if (!result.allowed) {
      throwTooManyRequests('Too many demo requests. Try again later.');
    }
    return true;
  }

  private assertAllowedOrigin(req: Request): void {
    const allowlist = this.originAllowlist();
    if (allowlist.length === 0) {
      return;
    }

    const originHeader = headerValue(req.headers.origin);
    const refererHeader = headerValue(req.headers.referer);
    const requestOrigin = originHeader
      ? normalizeOrigin(originHeader)
      : originFromReferer(refererHeader);

    if (!requestOrigin || !allowlist.includes(requestOrigin)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
          error: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private originAllowlist(): string[] {
    return parseCorsOriginAllowlist(this.config.get<string>('CORS_ORIGIN'));
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value) && value[0]) {
    return String(value[0]).trim();
  }
  return '';
}

function originFromReferer(referer: string): string {
  if (!referer) {
    return '';
  }
  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return '';
  }
}
