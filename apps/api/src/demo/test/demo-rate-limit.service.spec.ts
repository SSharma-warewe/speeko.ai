import { ConfigService } from '@nestjs/config';
import { DemoRateLimitService } from '../demo-rate-limit.service';

describe('DemoRateLimitService', () => {
  function makeService(
    overrides: Partial<Record<string, number>> = {},
  ): DemoRateLimitService {
    const defaults: Record<string, number> = {
      DEMO_MAX_PER_IP: 5,
      DEMO_IP_WINDOW_MS: 15 * 60_000,
      DEMO_MAX_PER_PHONE: 1,
      DEMO_PHONE_WINDOW_MS: 60 * 60_000,
      DEMO_MAX_PER_EMAIL: 2,
      DEMO_EMAIL_WINDOW_MS: 60 * 60_000,
      DEMO_MAX_GLOBAL: 30,
      DEMO_GLOBAL_WINDOW_MS: 60 * 60_000,
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string, def?: unknown) =>
        key in defaults ? defaults[key] : def,
      ),
    } as unknown as ConfigService;
    return new DemoRateLimitService(config);
  }

  it('allows attempts under the per-key max', () => {
    const service = makeService();
    expect(service.consume('k', 3, 60_000).allowed).toBe(true);
    expect(service.consume('k', 3, 60_000).allowed).toBe(true);
    expect(service.consume('k', 3, 60_000).allowed).toBe(true);
  });

  it('blocks when max attempts exceeded in window', () => {
    const service = makeService();
    expect(service.consume('ip:a', 2, 60_000).allowed).toBe(true);
    expect(service.consume('ip:a', 2, 60_000).allowed).toBe(true);
    const blocked = service.consume('ip:a', 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const service = makeService();
    expect(service.consume('a', 1, 60_000).allowed).toBe(true);
    expect(service.consume('a', 1, 60_000).allowed).toBe(false);
    expect(service.consume('b', 1, 60_000).allowed).toBe(true);
  });

  it('resets after the window expires', () => {
    jest.useFakeTimers();
    const service = makeService();
    expect(service.consume('k', 1, 1000).allowed).toBe(true);
    expect(service.consume('k', 1, 1000).allowed).toBe(false);

    jest.advanceTimersByTime(1001);
    expect(service.consume('k', 1, 1000).allowed).toBe(true);
    jest.useRealTimers();
  });

  it('reset() clears counters', () => {
    const service = makeService();
    expect(service.consume('k', 1, 60_000).allowed).toBe(true);
    expect(service.consume('k', 1, 60_000).allowed).toBe(false);
    service.reset();
    expect(service.consume('k', 1, 60_000).allowed).toBe(true);
  });

  it('consumeAttempt denies when any bucket is exhausted', () => {
    const service = makeService({
      DEMO_MAX_PER_IP: 1,
      DEMO_MAX_GLOBAL: 10,
      DEMO_MAX_PER_PHONE: 1,
      DEMO_MAX_PER_EMAIL: 2,
    });
    const first = service.consumeAttempt({
      ip: '1.1.1.1',
      phoneDigits: '15550102000',
      email: 'a@b.com',
    });
    expect(first.allowed).toBe(true);

    const second = service.consumeAttempt({
      ip: '1.1.1.1',
      phoneDigits: '19999999999',
      email: 'other@b.com',
    });
    expect(second.allowed).toBe(false);
  });

  it('skips phone and email buckets when empty but still counts IP + global', () => {
    const service = makeService({
      DEMO_MAX_PER_IP: 1,
      DEMO_MAX_GLOBAL: 10,
    });
    expect(
      service.consumeAttempt({ ip: '9.9.9.9', phoneDigits: '', email: '' })
        .allowed,
    ).toBe(true);
    expect(
      service.consumeAttempt({ ip: '9.9.9.9', phoneDigits: '', email: '' })
        .allowed,
    ).toBe(false);
  });
});
