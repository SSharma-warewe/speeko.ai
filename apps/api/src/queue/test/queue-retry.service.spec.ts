import {
  Call,
  CallFailureCode,
  CallStatus,
} from '../../calls/call.entity';
import {
  OrganizationQueueSettings,
  QueueBackoffStrategy,
} from '../organization-queue-settings.entity';
import { QueueRetryService } from '../queue-retry.service';

describe('QueueRetryService', () => {
  const service = new QueueRetryService();

  function makeCall(overrides: Partial<Call> = {}): Call {
    return {
      id: 'call-1',
      attemptCount: 1,
      maxAttempts: 3,
      status: CallStatus.DIALING,
      errorMessage: null,
      roomName: 'room-1',
      livekitDispatchId: 'disp-1',
      livekitSipCallId: 'sip-1',
      queueLockedAt: new Date(),
      dialStartedAt: new Date(),
      startedAt: new Date(),
      answeredAt: null,
      endedAt: null,
      nextAttemptAt: null,
      lastFailureCode: null,
      lastFailureAt: null,
      ...overrides,
    } as Call;
  }

  function makeSettings(
    overrides: Partial<OrganizationQueueSettings> = {},
  ): OrganizationQueueSettings {
    return {
      organizationId: 'org-1',
      retryOn: [
        CallFailureCode.NO_ANSWER,
        CallFailureCode.BUSY,
        CallFailureCode.TIMEOUT,
        CallFailureCode.SIP_ERROR,
      ],
      backoffStrategy: QueueBackoffStrategy.FIXED,
      backoffBaseSeconds: 60,
      backoffMaxSeconds: 3600,
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietHoursTimezone: 'UTC',
      ...overrides,
    } as OrganizationQueueSettings;
  }

  // ── decide ──────────────────────────────────────────────────────────

  it('1. cancelled always fails even if listed in retryOn', () => {
    const decision = service.decide({
      call: makeCall({ attemptCount: 1, maxAttempts: 5 }),
      settings: makeSettings({
        retryOn: [CallFailureCode.CANCELLED, CallFailureCode.NO_ANSWER],
      }),
      failureCode: CallFailureCode.CANCELLED,
    });
    expect(decision).toEqual({
      action: 'fail',
      failureCode: CallFailureCode.CANCELLED,
    });
  });

  it('2. code not in retryOn fails', () => {
    const decision = service.decide({
      call: makeCall({ attemptCount: 1, maxAttempts: 5 }),
      settings: makeSettings({ retryOn: [CallFailureCode.NO_ANSWER] }),
      failureCode: CallFailureCode.AGENT_ERROR,
    });
    expect(decision.action).toBe('fail');
    expect(decision.failureCode).toBe(CallFailureCode.AGENT_ERROR);
  });

  it('3. attemptCount >= maxAttempts fails', () => {
    const decision = service.decide({
      call: makeCall({ attemptCount: 3, maxAttempts: 3 }),
      settings: makeSettings(),
      failureCode: CallFailureCode.NO_ANSWER,
    });
    expect(decision.action).toBe('fail');
  });

  it('4. retryable under max requeues with nextAttemptAt = now + backoff', () => {
    const now = new Date('2024-06-15T12:00:00.000Z');
    const decision = service.decide({
      call: makeCall({ attemptCount: 1, maxAttempts: 3 }),
      settings: makeSettings({
        backoffStrategy: QueueBackoffStrategy.FIXED,
        backoffBaseSeconds: 60,
      }),
      failureCode: CallFailureCode.NO_ANSWER,
      now,
    });
    expect(decision.action).toBe('requeue');
    if (decision.action === 'requeue') {
      expect(decision.nextAttemptAt.getTime()).toBe(
        now.getTime() + 60 * 1000,
      );
      expect(decision.failureCode).toBe(CallFailureCode.NO_ANSWER);
    }
  });

  it('5. fixed backoff uses base seconds (capped by max)', () => {
    const now = new Date('2024-06-15T12:00:00.000Z');
    const decision = service.decide({
      call: makeCall({ attemptCount: 2, maxAttempts: 5 }),
      settings: makeSettings({
        backoffStrategy: QueueBackoffStrategy.FIXED,
        backoffBaseSeconds: 90,
        backoffMaxSeconds: 3600,
      }),
      failureCode: CallFailureCode.BUSY,
      now,
    });
    expect(decision.action).toBe('requeue');
    if (decision.action === 'requeue') {
      expect(decision.nextAttemptAt.getTime()).toBe(
        now.getTime() + 90 * 1000,
      );
    }
  });

  it('6. exponential backoff: attempt 1 → base; attempt 3 → base*4', () => {
    const settings = makeSettings({
      backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
      backoffBaseSeconds: 60,
      backoffMaxSeconds: 3600,
    });
    expect(service.computeBackoffSeconds(settings, 1)).toBe(60);
    expect(service.computeBackoffSeconds(settings, 3)).toBe(240); // 60 * 2^2
  });

  it('7. quiet hours push nextAttemptAt when inside window', () => {
    // 02:00 UTC is inside 01:00–05:00 UTC quiet window
    const now = new Date('2024-06-15T02:00:00.000Z');
    const decision = service.decide({
      call: makeCall({ attemptCount: 1, maxAttempts: 3 }),
      settings: makeSettings({
        backoffStrategy: QueueBackoffStrategy.FIXED,
        backoffBaseSeconds: 1, // almost immediate, still inside quiet
        quietHoursEnabled: true,
        quietHoursStart: '01:00',
        quietHoursEnd: '05:00',
        quietHoursTimezone: 'UTC',
      }),
      failureCode: CallFailureCode.TIMEOUT,
      now,
    });
    expect(decision.action).toBe('requeue');
    if (decision.action === 'requeue') {
      // Should be pushed to quiet end (~05:00 UTC same day)
      expect(decision.nextAttemptAt.getTime()).toBeGreaterThan(
        now.getTime() + 1000,
      );
      const hour = decision.nextAttemptAt.getUTCHours();
      expect(hour).toBe(5);
    }
  });

  it('8. outside quiet hours leaves nextAttemptAt as backoff-only', () => {
    const now = new Date('2024-06-15T12:00:00.000Z'); // noon UTC
    const decision = service.decide({
      call: makeCall({ attemptCount: 1, maxAttempts: 3 }),
      settings: makeSettings({
        backoffStrategy: QueueBackoffStrategy.FIXED,
        backoffBaseSeconds: 30,
        quietHoursEnabled: true,
        quietHoursStart: '01:00',
        quietHoursEnd: '05:00',
        quietHoursTimezone: 'UTC',
      }),
      failureCode: CallFailureCode.NO_ANSWER,
      now,
    });
    expect(decision.action).toBe('requeue');
    if (decision.action === 'requeue') {
      expect(decision.nextAttemptAt.getTime()).toBe(
        now.getTime() + 30 * 1000,
      );
    }
  });

  // ── computeBackoffSeconds ───────────────────────────────────────────

  it('9. fixed base=90 max=3600 → 90', () => {
    expect(
      service.computeBackoffSeconds(
        makeSettings({
          backoffStrategy: QueueBackoffStrategy.FIXED,
          backoffBaseSeconds: 90,
          backoffMaxSeconds: 3600,
        }),
        5,
      ),
    ).toBe(90);
  });

  it('10. exponential n=1 base=60 → 60', () => {
    expect(
      service.computeBackoffSeconds(
        makeSettings({
          backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
          backoffBaseSeconds: 60,
          backoffMaxSeconds: 3600,
        }),
        1,
      ),
    ).toBe(60);
  });

  it('11. exponential n=4 base=60 max=3600 → 480', () => {
    // 60 * 2^(4-1) = 60 * 8 = 480
    expect(
      service.computeBackoffSeconds(
        makeSettings({
          backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
          backoffBaseSeconds: 60,
          backoffMaxSeconds: 3600,
        }),
        4,
      ),
    ).toBe(480);
  });

  it('12. exponential capped by max', () => {
    expect(
      service.computeBackoffSeconds(
        makeSettings({
          backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
          backoffBaseSeconds: 60,
          backoffMaxSeconds: 100,
        }),
        5,
      ),
    ).toBe(100);
  });

  it('13. base 0 falsy falls back to 60 then min with max', () => {
    // Implementation: Math.max(1, settings.backoffBaseSeconds || 60)
    expect(
      service.computeBackoffSeconds(
        makeSettings({
          backoffStrategy: QueueBackoffStrategy.FIXED,
          backoffBaseSeconds: 0,
          backoffMaxSeconds: 3600,
        }),
        1,
      ),
    ).toBe(60);
  });

  // ── classifyFromSipError ────────────────────────────────────────────

  it('14. SIP 486 / 600 → busy', () => {
    expect(service.classifyFromSipError('x', 486)).toBe(CallFailureCode.BUSY);
    expect(service.classifyFromSipError('x', 600)).toBe(CallFailureCode.BUSY);
  });

  it('15. SIP 480 / 408 / 487 → no_answer', () => {
    expect(service.classifyFromSipError('x', 480)).toBe(
      CallFailureCode.NO_ANSWER,
    );
    expect(service.classifyFromSipError('x', 408)).toBe(
      CallFailureCode.NO_ANSWER,
    );
    expect(service.classifyFromSipError('x', 487)).toBe(
      CallFailureCode.NO_ANSWER,
    );
  });

  it('16. message keywords map to busy / timeout / no_answer', () => {
    expect(service.classifyFromSipError('User busy')).toBe(
      CallFailureCode.BUSY,
    );
    expect(service.classifyFromSipError('Request timed out')).toBe(
      CallFailureCode.TIMEOUT,
    );
    expect(service.classifyFromSipError('No answer from callee')).toBe(
      CallFailureCode.NO_ANSWER,
    );
  });

  it('17. sip/trunk message or numeric code → sip_error', () => {
    expect(service.classifyFromSipError('SIP trunk rejected', 503)).toBe(
      CallFailureCode.SIP_ERROR,
    );
    expect(service.classifyFromSipError('trunk unavailable')).toBe(
      CallFailureCode.SIP_ERROR,
    );
  });

  it('18. empty message and no code → unknown', () => {
    expect(service.classifyFromSipError('')).toBe(CallFailureCode.UNKNOWN);
  });

  // ── classifyFromWorker ──────────────────────────────────────────────

  it('19. worker failureCode valid enum string is used', () => {
    expect(
      service.classifyFromWorker({ failureCode: 'no_answer' }),
    ).toBe(CallFailureCode.NO_ANSWER);
    expect(
      service.classifyFromWorker({ failureCode: '  BUSY  '.toLowerCase() }),
    ).toBe(CallFailureCode.BUSY);
  });

  it('20. worker message cancel → cancelled; else agent_error / unknown', () => {
    expect(
      service.classifyFromWorker({
        failureCode: null,
        errorMessage: 'user cancelled',
      }),
    ).toBe(CallFailureCode.CANCELLED);
    expect(
      service.classifyFromWorker({
        failureCode: null,
        errorMessage: 'LLM exploded',
      }),
    ).toBe(CallFailureCode.AGENT_ERROR);
    expect(
      service.classifyFromWorker({ failureCode: null, errorMessage: null }),
    ).toBe(CallFailureCode.UNKNOWN);
  });

  // ── mutators ────────────────────────────────────────────────────────

  it('21. resetForRequeue clears LiveKit dial fields and sets pending', () => {
    const call = makeCall({
      status: CallStatus.DIALING,
      roomName: 'r',
      livekitDispatchId: 'd',
      livekitSipCallId: 's',
      queueLockedAt: new Date(),
      dialStartedAt: new Date(),
      startedAt: new Date(),
      answeredAt: new Date(),
      endedAt: new Date(),
    });
    const next = new Date('2024-06-15T13:00:00.000Z');
    service.resetForRequeue(call, {
      action: 'requeue',
      nextAttemptAt: next,
      failureCode: CallFailureCode.NO_ANSWER,
    });
    expect(call.status).toBe(CallStatus.PENDING);
    expect(call.nextAttemptAt).toEqual(next);
    expect(call.lastFailureCode).toBe(CallFailureCode.NO_ANSWER);
    expect(call.lastFailureAt).toBeInstanceOf(Date);
    expect(call.roomName).toBeNull();
    expect(call.livekitDispatchId).toBeNull();
    expect(call.livekitSipCallId).toBeNull();
    expect(call.queueLockedAt).toBeNull();
    expect(call.dialStartedAt).toBeNull();
    expect(call.startedAt).toBeNull();
    expect(call.answeredAt).toBeNull();
    expect(call.endedAt).toBeNull();
  });

  it('22. markTerminalFailed sets failed and clears queue fields', () => {
    const call = makeCall({
      status: CallStatus.DIALING,
      nextAttemptAt: new Date(),
      queueLockedAt: new Date(),
      endedAt: null,
    });
    service.markTerminalFailed(call, CallFailureCode.AGENT_ERROR);
    expect(call.status).toBe(CallStatus.FAILED);
    expect(call.lastFailureCode).toBe(CallFailureCode.AGENT_ERROR);
    expect(call.lastFailureAt).toBeInstanceOf(Date);
    expect(call.endedAt).toBeInstanceOf(Date);
    expect(call.queueLockedAt).toBeNull();
    expect(call.nextAttemptAt).toBeNull();
  });
});
