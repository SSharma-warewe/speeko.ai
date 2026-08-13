import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMockExecutionContext } from '../../auth/test/helpers/mock-execution-context';
import { DemoRateLimitService } from '../demo-rate-limit.service';
import { DemoAbuseGuard } from '../guards/demo-abuse.guard';

describe('DemoAbuseGuard', () => {
  let rateLimit: { consumeAttempt: jest.Mock };
  let configGet: jest.Mock;
  let guard: DemoAbuseGuard;

  function makeGuard(corsOrigin?: string): DemoAbuseGuard {
    configGet = jest.fn((key: string) => {
      if (key === 'CORS_ORIGIN') return corsOrigin;
      return undefined;
    });
    rateLimit = {
      consumeAttempt: jest
        .fn()
        .mockReturnValue({ allowed: true, retryAfterSec: 0 }),
    };
    return new DemoAbuseGuard(
      { get: configGet } as unknown as ConfigService,
      rateLimit as unknown as DemoRateLimitService,
    );
  }

  function ctx(opts: {
    headers?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
    ip?: string;
  }) {
    const context = createMockExecutionContext({
      headers: opts.headers ?? {},
    });
    const req = context.switchToHttp().getRequest() as Record<string, unknown>;
    req.body = opts.body ?? {
      email: '  Alex@Acme.Health ',
      phone: '+1 555 010 2000',
    };
    req.ip = opts.ip ?? '127.0.0.1';
    return context;
  }

  beforeEach(() => {
    guard = makeGuard(undefined);
  });

  it('allows when under limit and keys IP + digit phone + normalized email', () => {
    const context = ctx({
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(rateLimit.consumeAttempt).toHaveBeenCalledWith({
      ip: '203.0.113.10',
      phoneDigits: '15550102000',
      email: 'alex@acme.health',
    });
  });

  it('skips origin check when CORS_ORIGIN is unset', () => {
    expect(guard.canActivate(ctx({ headers: {} }))).toBe(true);
  });

  it('allows when Origin matches CORS_ORIGIN (trailing slash ignored)', () => {
    guard = makeGuard('https://speeko.ai/');
    expect(
      guard.canActivate(
        ctx({ headers: { origin: 'https://Speeko.ai' } }),
      ),
    ).toBe(true);
  });

  it('allows when Origin is missing but Referer origin matches', () => {
    guard = makeGuard('https://speeko.ai');
    expect(
      guard.canActivate(
        ctx({ headers: { referer: 'https://speeko.ai/get-demo' } }),
      ),
    ).toBe(true);
  });

  it('throws 403 when CORS_ORIGIN is set and Origin does not match', () => {
    guard = makeGuard('https://speeko.ai');
    expect(() =>
      guard.canActivate(ctx({ headers: { origin: 'https://evil.example' } })),
    ).toThrow(HttpException);
    try {
      guard.canActivate(ctx({ headers: { origin: 'https://evil.example' } }));
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
    expect(rateLimit.consumeAttempt).not.toHaveBeenCalled();
  });

  it('throws 403 when CORS_ORIGIN is set and Origin/Referer are missing', () => {
    guard = makeGuard('https://speeko.ai');
    expect(() => guard.canActivate(ctx({ headers: {} }))).toThrow(
      HttpException,
    );
    try {
      guard.canActivate(ctx({ headers: {} }));
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('throws 429 when rate limit service denies', () => {
    rateLimit.consumeAttempt.mockReturnValue({
      allowed: false,
      retryAfterSec: 42,
    });
    expect(() => guard.canActivate(ctx({}))).toThrow(HttpException);
    try {
      guard.canActivate(ctx({}));
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      const body = (err as HttpException).getResponse() as { message: string };
      expect(body.message).toMatch(/too many demo requests/i);
    }
  });

  it('still rate-limits IP + global when phone and email are missing', () => {
    expect(
      guard.canActivate(
        ctx({
          headers: { 'x-forwarded-for': '198.51.100.9' },
          body: {},
        }),
      ),
    ).toBe(true);
    expect(rateLimit.consumeAttempt).toHaveBeenCalledWith({
      ip: '198.51.100.9',
      phoneDigits: '',
      email: '',
    });
  });
});
