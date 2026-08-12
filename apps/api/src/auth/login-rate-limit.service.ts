import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window counter for login endpoints.
 * Multi-instance deploys each keep their own counters (Redis would be needed for shared limits).
 */
@Injectable()
export class LoginRateLimitService {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(config: ConfigService) {
    this.maxAttempts = Number(
      config.get<string | number>('AUTH_LOGIN_MAX_ATTEMPTS', 10),
    );
    this.windowMs = Number(
      config.get<string | number>('AUTH_LOGIN_WINDOW_MS', 60_000),
    );
  }

  /**
   * Record one attempt for the key.
   * @returns whether the attempt is allowed (false → rate limited)
   */
  consume(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    this.evictExpired(now);

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (existing.count >= this.maxAttempts) {
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

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  getWindowMs(): number {
    return this.windowMs;
  }

  private evictExpired(now: number): void {
    // Opportunistic cleanup to avoid unbounded growth under abuse.
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
