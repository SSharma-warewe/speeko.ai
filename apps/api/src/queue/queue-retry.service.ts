import { Injectable, Logger } from '@nestjs/common';
import {
  Call,
  CallFailureCode,
  CallStatus,
} from '../calls/call.entity';
import {
  OrganizationQueueSettings,
  QueueBackoffStrategy,
} from './organization-queue-settings.entity';

export type RetryDecision =
  | { action: 'requeue'; nextAttemptAt: Date; failureCode: CallFailureCode }
  | { action: 'fail'; failureCode: CallFailureCode };

@Injectable()
export class QueueRetryService {
  private readonly logger = new Logger(QueueRetryService.name);

  /**
   * Decide whether a failed attempt should requeue or terminate.
   * attemptCount is the number of dials already performed (including this failure).
   */
  decide(input: {
    call: Call;
    settings: OrganizationQueueSettings;
    failureCode: CallFailureCode;
    now?: Date;
  }): RetryDecision {
    const { call, settings, failureCode } = input;
    const now = input.now ?? new Date();

    if (failureCode === CallFailureCode.CANCELLED) {
      return { action: 'fail', failureCode };
    }

    const retryOn = new Set(settings.retryOn ?? []);
    if (!retryOn.has(failureCode)) {
      return { action: 'fail', failureCode };
    }

    if (call.attemptCount >= call.maxAttempts) {
      return { action: 'fail', failureCode };
    }

    const delaySec = this.computeBackoffSeconds(
      settings,
      call.attemptCount,
    );
    let next = new Date(now.getTime() + delaySec * 1000);
    next = this.applyQuietHours(next, settings);

    this.logger.debug(
      `Requeue call=${call.id} attempt=${call.attemptCount}/${call.maxAttempts} ` +
        `code=${failureCode} next=${next.toISOString()} delay=${delaySec}s`,
    );

    return { action: 'requeue', nextAttemptAt: next, failureCode };
  }

  computeBackoffSeconds(
    settings: OrganizationQueueSettings,
    attemptCount: number,
  ): number {
    const base = Math.max(1, settings.backoffBaseSeconds || 60);
    const max = Math.max(base, settings.backoffMaxSeconds || 3600);
    // attemptCount is attempts already done; first retry uses attemptCount=1 → base
    const n = Math.max(1, attemptCount);

    if (settings.backoffStrategy === QueueBackoffStrategy.FIXED) {
      return Math.min(max, base);
    }

    const exp = base * Math.pow(2, n - 1);
    return Math.min(max, Math.floor(exp));
  }

  /**
   * If quiet hours enabled and `at` falls inside the window, push to quiet end.
   */
  applyQuietHours(at: Date, settings: OrganizationQueueSettings): Date {
    if (
      !settings.quietHoursEnabled ||
      !settings.quietHoursStart ||
      !settings.quietHoursEnd
    ) {
      return at;
    }

    try {
      const tz = settings.quietHoursTimezone || 'UTC';
      const localParts = this.localTimeParts(at, tz);
      const minutes = localParts.hour * 60 + localParts.minute;
      const start = this.parseHhMm(settings.quietHoursStart);
      const end = this.parseHhMm(settings.quietHoursEnd);
      if (start === null || end === null) {
        return at;
      }

      const inQuiet =
        start < end
          ? minutes >= start && minutes < end
          : minutes >= start || minutes < end; // overnight window

      if (!inQuiet) {
        return at;
      }

      // Push to quiet end on the same local calendar day (or next if overnight).
      const endHour = Math.floor(end / 60);
      const endMin = end % 60;
      const targetLocal = new Date(
        Date.UTC(
          localParts.year,
          localParts.month - 1,
          localParts.day,
          endHour,
          endMin,
          0,
          0,
        ),
      );

      // Convert "wall time in tz" approximate: use formatter inverse via offset.
      const pushed = this.wallTimeInZoneToUtc(
        {
          year: localParts.year,
          month: localParts.month,
          day: localParts.day,
          hour: endHour,
          minute: endMin,
        },
        tz,
      );

      // Overnight quiet ending after midnight: if end < start and now past midnight portion
      if (start > end && minutes < end) {
        return pushed > at ? pushed : at;
      }
      if (start > end && minutes >= start) {
        // quiet continues past midnight → end is tomorrow
        const tomorrow = this.wallTimeInZoneToUtc(
          {
            year: localParts.year,
            month: localParts.month,
            day: localParts.day + 1,
            hour: endHour,
            minute: endMin,
          },
          tz,
        );
        return tomorrow > at ? tomorrow : at;
      }

      return pushed > at ? pushed : at;
    } catch (err) {
      this.logger.warn(
        `Quiet hours adjust failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return at;
    }
  }

  classifyFromSipError(message: string, sipStatusCode?: number | string): CallFailureCode {
    const code =
      typeof sipStatusCode === 'string'
        ? Number.parseInt(sipStatusCode, 10)
        : sipStatusCode;

    if (code === 486 || code === 600) {
      return CallFailureCode.BUSY;
    }
    if (code === 480 || code === 408 || code === 487) {
      return CallFailureCode.NO_ANSWER;
    }
    if (code === 504 || code === 408) {
      return CallFailureCode.TIMEOUT;
    }

    const lower = (message || '').toLowerCase();
    if (lower.includes('busy')) return CallFailureCode.BUSY;
    if (
      lower.includes('no answer') ||
      lower.includes('no_answer') ||
      lower.includes('not answered') ||
      lower.includes('temporarily unavailable')
    ) {
      return CallFailureCode.NO_ANSWER;
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return CallFailureCode.TIMEOUT;
    }
    if (lower.includes('sip') || lower.includes('trunk') || code) {
      return CallFailureCode.SIP_ERROR;
    }
    return CallFailureCode.UNKNOWN;
  }

  classifyFromWorker(input: {
    failureCode?: string | null;
    errorMessage?: string | null;
  }): CallFailureCode {
    const raw = (input.failureCode || '').trim().toLowerCase();
    if (raw && Object.values(CallFailureCode).includes(raw as CallFailureCode)) {
      return raw as CallFailureCode;
    }
    const msg = (input.errorMessage || '').toLowerCase();
    if (msg.includes('busy')) return CallFailureCode.BUSY;
    if (msg.includes('no answer') || msg.includes('no_answer')) {
      return CallFailureCode.NO_ANSWER;
    }
    if (msg.includes('timeout')) return CallFailureCode.TIMEOUT;
    if (msg.includes('cancel')) return CallFailureCode.CANCELLED;
    if (msg) return CallFailureCode.AGENT_ERROR;
    return CallFailureCode.UNKNOWN;
  }

  /** Clear LiveKit dial fields so a requeue can create a fresh room. */
  resetForRequeue(
    call: Call,
    decision: Extract<RetryDecision, { action: 'requeue' }>,
  ): void {
    call.status = CallStatus.PENDING;
    call.nextAttemptAt = decision.nextAttemptAt;
    call.lastFailureCode = decision.failureCode;
    call.lastFailureAt = new Date();
    call.errorMessage = call.errorMessage ?? decision.failureCode;
    call.roomName = null;
    call.livekitDispatchId = null;
    call.livekitSipCallId = null;
    call.queueLockedAt = null;
    call.dialStartedAt = null;
    call.startedAt = null;
    call.answeredAt = null;
    call.endedAt = null;
  }

  markTerminalFailed(call: Call, failureCode: CallFailureCode): void {
    call.status = CallStatus.FAILED;
    call.lastFailureCode = failureCode;
    call.lastFailureAt = new Date();
    call.endedAt = call.endedAt ?? new Date();
    call.queueLockedAt = null;
    call.nextAttemptAt = null;
  }

  private parseHhMm(value: string): number | null {
    const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  private localTimeParts(
    date: Date,
    timeZone: string,
  ): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  } {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  }

  /**
   * Approximate conversion of a wall-clock time in `timeZone` to UTC Date.
   */
  private wallTimeInZoneToUtc(
    wall: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    },
    timeZone: string,
  ): Date {
    // Iterative approach: guess UTC = wall as UTC, measure offset, correct.
    let guess = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      0,
      0,
    );
    for (let i = 0; i < 3; i++) {
      const asDate = new Date(guess);
      const parts = this.localTimeParts(asDate, timeZone);
      const localAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        0,
        0,
      );
      const desired = Date.UTC(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        0,
        0,
      );
      const delta = desired - localAsUtc;
      if (delta === 0) break;
      guess += delta;
    }
    return new Date(guess);
  }
}
