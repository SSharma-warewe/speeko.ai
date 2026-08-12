import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { LoginRateLimitService } from '../login-rate-limit.service';
import { createMockExecutionContext } from './helpers/mock-execution-context';

describe('LoginRateLimitGuard', () => {
  let rateLimit: { consume: jest.Mock };
  let guard: LoginRateLimitGuard;

  beforeEach(() => {
    rateLimit = {
      consume: jest.fn().mockReturnValue({ allowed: true, retryAfterSec: 0 }),
    };
    guard = new LoginRateLimitGuard(
      rateLimit as unknown as LoginRateLimitService,
    );
  });

  it('allows when under limit and keys by route + IP + normalized email', () => {
    const ctx = createMockExecutionContext({
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    // extend mock request with path/body/ip
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/login';
    req.body = { email: '  Agent@Acme.COM ' };
    req.ip = '127.0.0.1';

    expect(guard.canActivate(ctx)).toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith(
      'user-login:203.0.113.10:agent@acme.com',
    );
  });

  it('keys admin login route separately', () => {
    const ctx = createMockExecutionContext({
      headers: {},
    });
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/admin/login';
    req.body = { email: 'admin@local.dev' };
    req.ip = '10.0.0.1';

    guard.canActivate(ctx);
    expect(rateLimit.consume).toHaveBeenCalledWith(
      'admin-login:10.0.0.1:admin@local.dev',
    );
  });

  it('throws 429 when rate limit service denies', () => {
    rateLimit.consume.mockReturnValue({ allowed: false, retryAfterSec: 42 });
    const ctx = createMockExecutionContext({ headers: {} });
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    req.path = '/auth/login';
    req.body = { email: 'a@b.com' };
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
