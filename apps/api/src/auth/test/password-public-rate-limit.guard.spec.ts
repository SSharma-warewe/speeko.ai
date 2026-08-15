import { HttpException, HttpStatus } from '@nestjs/common';
import { PasswordPublicRateLimitGuard } from '../guards/password-public-rate-limit.guard';
import { LoginRateLimitService } from '../login-rate-limit.service';
import { createMockExecutionContext } from './helpers/mock-execution-context';

describe('PasswordPublicRateLimitGuard', () => {
  let rateLimit: { consume: jest.Mock };
  let guard: PasswordPublicRateLimitGuard;

  beforeEach(() => {
    rateLimit = {
      consume: jest.fn().mockReturnValue({ allowed: true, retryAfterSec: 0 }),
    };
    guard = new PasswordPublicRateLimitGuard(
      rateLimit as unknown as LoginRateLimitService,
    );
  });

  it('keys forgot by route + IP + email', () => {
    const ctx = createMockExecutionContext({
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/forgot-password';
    req.body = { email: '  Agent@Acme.COM ' };
    req.ip = '127.0.0.1';

    expect(guard.canActivate(ctx)).toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith(
      'user-forgot:203.0.113.10:agent@acme.com',
    );
  });

  it('keys set/reset by route + IP only', () => {
    const ctx = createMockExecutionContext({ headers: {} });
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/set-password';
    req.body = { email: 'agent@acme.com', token: 'abc' };
    req.ip = '10.0.0.2';

    guard.canActivate(ctx);
    expect(rateLimit.consume).toHaveBeenCalledWith('set-password:10.0.0.2');
  });

  it('throws 429 when denied', () => {
    rateLimit.consume.mockReturnValue({ allowed: false, retryAfterSec: 10 });
    const ctx = createMockExecutionContext({ headers: {} });
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/reset-password';
    req.body = {};
    req.ip = '1.2.3.4';

    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    try {
      guard.canActivate(ctx);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });
});
