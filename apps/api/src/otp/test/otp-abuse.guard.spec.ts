import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMockExecutionContext } from '../../auth/test/helpers/mock-execution-context';
import { OtpAbuseGuard } from '../guards/otp-abuse.guard';
import { OtpRateLimitService } from '../otp-rate-limit.service';

describe('OtpAbuseGuard', () => {
  let consumeSend: jest.Mock;
  let consumeVerify: jest.Mock;
  let guard: OtpAbuseGuard;

  function makeGuard(corsOrigin?: string): OtpAbuseGuard {
    consumeSend = jest.fn();
    consumeVerify = jest.fn();
    return new OtpAbuseGuard(
      {
        get: (key: string) => (key === 'CORS_ORIGIN' ? corsOrigin : undefined),
      } as unknown as ConfigService,
      {
        consumeSend,
        consumeVerify,
      } as unknown as OtpRateLimitService,
    );
  }

  function ctx(opts: {
    url: string;
    headers?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  }) {
    const context = createMockExecutionContext({
      headers: opts.headers ?? {},
    });
    const req = context.switchToHttp().getRequest() as Record<string, unknown>;
    req.url = opts.url;
    req.body = opts.body ?? {};
    return context;
  }

  beforeEach(() => {
    guard = makeGuard(undefined);
  });

  it('rate-limits send by IP and phone digits', () => {
    expect(
      guard.canActivate(
        ctx({
          url: '/api/otp/send',
          headers: { 'x-forwarded-for': '203.0.113.10' },
          body: { phone: '+91 98765 43210' },
        }),
      ),
    ).toBe(true);
    expect(consumeSend).toHaveBeenCalledWith('203.0.113.10', '919876543210');
    expect(consumeVerify).not.toHaveBeenCalled();
  });

  it('rate-limits verify by IP only', () => {
    expect(
      guard.canActivate(
        ctx({
          url: '/api/otp/verify',
          headers: { 'x-forwarded-for': '203.0.113.10' },
          body: { challengeId: 'x', code: '123456' },
        }),
      ),
    ).toBe(true);
    expect(consumeVerify).toHaveBeenCalledWith('203.0.113.10');
    expect(consumeSend).not.toHaveBeenCalled();
  });

  it('rejects an origin outside CORS_ORIGIN', () => {
    guard = makeGuard('https://speeko.ai');
    expect(() =>
      guard.canActivate(
        ctx({
          url: '/api/otp/send',
          headers: { origin: 'https://evil.example' },
          body: { phone: '+919876543210' },
        }),
      ),
    ).toThrow(HttpException);
    try {
      guard.canActivate(
        ctx({
          url: '/api/otp/send',
          headers: { origin: 'https://evil.example' },
        }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });
});
