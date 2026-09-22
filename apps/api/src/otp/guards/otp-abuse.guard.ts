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
import { demoPhoneDigits } from '../../demo/demo-form.constants';
import { OtpRateLimitService } from '../otp-rate-limit.service';

/**
 * Public OTP abuse controls: same origin allowlist as get-demo, plus send/verify windows.
 */
@Injectable()
export class OtpAbuseGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly rateLimit: OtpRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    this.assertAllowedOrigin(req);

    const ip = clientIp(req);
    if (this.isVerify(req)) {
      this.rateLimit.consumeVerify(ip);
      return true;
    }

    const body = (req.body ?? {}) as { phone?: unknown };
    const phoneDigits =
      typeof body.phone === 'string' ? demoPhoneDigits(body.phone) : '';
    this.rateLimit.consumeSend(ip, phoneDigits);
    return true;
  }

  private isVerify(req: Request): boolean {
    const url = req.originalUrl || req.url || '';
    return url.includes('/otp/verify');
  }

  private assertAllowedOrigin(req: Request): void {
    const allowlist = parseCorsOriginAllowlist(
      this.config.get<string>('CORS_ORIGIN'),
    );
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
