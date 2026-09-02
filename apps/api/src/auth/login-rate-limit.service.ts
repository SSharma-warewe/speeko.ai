import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FixedWindowRateLimit,
  type RateLimitResult,
} from '../common/fixed-window-rate-limit';

/**
 * In-process fixed-window counter for login endpoints.
 * Multi-instance deploys each keep their own counters (Redis would be needed for shared limits).
 */
@Injectable()
export class LoginRateLimitService {
  private readonly limiter = new FixedWindowRateLimit();
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
  consume(key: string): RateLimitResult {
    return this.limiter.consume(key, this.maxAttempts, this.windowMs);
  }

  /** Test helper: clear all counters. */
  reset(): void {
    this.limiter.reset();
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  getWindowMs(): number {
    return this.windowMs;
  }
}
