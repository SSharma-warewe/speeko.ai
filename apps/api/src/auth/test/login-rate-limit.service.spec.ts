import { ConfigService } from '@nestjs/config';
import { LoginRateLimitService } from '../login-rate-limit.service';

describe('LoginRateLimitService', () => {
  function makeService(maxAttempts = 3, windowMs = 60_000) {
    const config = {
      get: jest.fn((key: string, def?: unknown) => {
        if (key === 'AUTH_LOGIN_MAX_ATTEMPTS') return maxAttempts;
        if (key === 'AUTH_LOGIN_WINDOW_MS') return windowMs;
        return def;
      }),
    } as unknown as ConfigService;
    return new LoginRateLimitService(config);
  }

  it('allows attempts under the max', () => {
    const service = makeService(3);
    expect(service.consume('k').allowed).toBe(true);
    expect(service.consume('k').allowed).toBe(true);
    expect(service.consume('k').allowed).toBe(true);
  });

  it('blocks when max attempts exceeded in window', () => {
    const service = makeService(2);
    expect(service.consume('ip:a@x.com').allowed).toBe(true);
    expect(service.consume('ip:a@x.com').allowed).toBe(true);
    const blocked = service.consume('ip:a@x.com');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const service = makeService(1);
    expect(service.consume('a').allowed).toBe(true);
    expect(service.consume('a').allowed).toBe(false);
    expect(service.consume('b').allowed).toBe(true);
  });

  it('resets after the window expires', () => {
    jest.useFakeTimers();
    const service = makeService(1, 1000);
    expect(service.consume('k').allowed).toBe(true);
    expect(service.consume('k').allowed).toBe(false);

    jest.advanceTimersByTime(1001);
    expect(service.consume('k').allowed).toBe(true);
    jest.useRealTimers();
  });

  it('reset() clears counters', () => {
    const service = makeService(1);
    expect(service.consume('k').allowed).toBe(true);
    expect(service.consume('k').allowed).toBe(false);
    service.reset();
    expect(service.consume('k').allowed).toBe(true);
  });
});
