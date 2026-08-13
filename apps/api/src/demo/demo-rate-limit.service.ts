import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface DemoRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * In-process fixed-window counters for the public get-demo route.
 * Multi-instance deploys each keep their own counters (same caveat as login).
 */
@Injectable()
export class DemoRateLimitService {
  private readonly windows = new Map<string, WindowEntry>();

  readonly ipMax: number;
  readonly ipWindowMs: number;
  readonly phoneMax: number;
  readonly phoneWindowMs: number;
  readonly emailMax: number;
  readonly emailWindowMs: number;
  readonly globalMax: number;
  readonly globalWindowMs: number;

  constructor(config: ConfigService) {
    this.ipMax = Number(config.get<string | number>('DEMO_MAX_PER_IP', 5));
    this.ipWindowMs = Number(
      config.get<string | number>('DEMO_IP_WINDOW_MS', 15 * 60_000),
    );
    this.phoneMax = Number(config.get<string | number>('DEMO_MAX_PER_PHONE', 1));
    this.phoneWindowMs = Number(
      config.get<string | number>('DEMO_PHONE_WINDOW_MS', 60 * 60_000),
    );
    this.emailMax = Number(config.get<string | number>('DEMO_MAX_PER_EMAIL', 2));
    this.emailWindowMs = Number(
      config.get<string | number>('DEMO_EMAIL_WINDOW_MS', 60 * 60_000),
    );
    this.globalMax = Number(config.get<string | number>('DEMO_MAX_GLOBAL', 30));
    this.globalWindowMs = Number(
      config.get<string | number>('DEMO_GLOBAL_WINDOW_MS', 60 * 60_000),
    );
  }

  consumeAttempt(input: {
    ip: string;
    phoneDigits: string;
    email: string;
  }): DemoRateLimitResult {
    const results: DemoRateLimitResult[] = [
      this.consume(`demo:ip:${input.ip}`, this.ipMax, this.ipWindowMs),
      this.consume('demo:global', this.globalMax, this.globalWindowMs),
    ];
    if (input.phoneDigits) {
      results.push(
        this.consume(
          `demo:phone:${input.phoneDigits}`,
          this.phoneMax,
          this.phoneWindowMs,
        ),
      );
    }
    if (input.email) {
      results.push(
        this.consume(
          `demo:email:${input.email}`,
          this.emailMax,
          this.emailWindowMs,
        ),
      );
    }
    return results.find((r) => !r.allowed) ?? { allowed: true, retryAfterSec: 0 };
  }

  consume(
    key: string,
    maxAttempts: number,
    windowMs: number,
  ): DemoRateLimitResult {
    const now = Date.now();
    this.evictExpired(now);

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (existing.count >= maxAttempts) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Test helper: clear all counters. */
  reset(): void {
    this.windows.clear();
  }

  private evictExpired(now: number): void {
    if (this.windows.size < 500) {
      return;
    }
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
