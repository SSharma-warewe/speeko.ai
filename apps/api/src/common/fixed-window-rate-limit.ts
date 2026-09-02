export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window counter. Multi-instance deploys each keep their own map
 * (Redis would be needed for shared limits).
 */
export class FixedWindowRateLimit {
  private readonly windows = new Map<string, WindowEntry>();

  consume(
    key: string,
    maxAttempts: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitResult {
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
