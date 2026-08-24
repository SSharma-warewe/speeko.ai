import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentDirection } from '../../agents/agent.entity';
import { LivekitService } from '../../livekit/livekit.service';
import { CallBatchesService } from '../../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../../queue/organization-queue-settings.service';
import { QueueClaimService } from '../../queue/queue-claim.service';
import { QueueRetryService } from '../../queue/queue-retry.service';
import { PriceService } from '../../price/price.service';
import { Call, CallFailureCode, CallStatus } from '../call.entity';
import { priceAttemptSafe } from '../lib/call-price';
import { CallsRepository } from '../calls.repository';

@Injectable()
export class CallFailureService {
  private readonly logger = new Logger(CallFailureService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly priceService: PriceService,
    private readonly livekit: LivekitService,
    @Inject(forwardRef(() => OrganizationQueueSettingsService))
    private readonly queueSettingsService: OrganizationQueueSettingsService,
    @Inject(forwardRef(() => CallBatchesService))
    private readonly callBatchesService: CallBatchesService,
    @Inject(forwardRef(() => QueueRetryService))
    private readonly queueRetryService: QueueRetryService,
    @Inject(forwardRef(() => QueueClaimService))
    private readonly queueClaimService: QueueClaimService,
  ) {}

  /**
   * Fail/requeue dialing|ready rows that never received worker complete.
   * Called once per queue dialer tick (global, all orgs). Frees max_concurrent
   * slots held by zombie sessions after worker hang/death.
   */
  async reapStaleInFlight(): Promise<number> {
    const stale = await this.queueClaimService.findStaleInFlight();
    if (stale.length === 0) {
      return 0;
    }

    const thresholds = this.queueClaimService.getStaleInFlightThresholds();
    let reaped = 0;

    for (const row of stale) {
      try {
        // Re-load so we don't race a late worker complete.
        const call = await this.callsRepository.findById(row.id);
        if (!call) {
          continue;
        }
        if (
          call.status !== CallStatus.DIALING &&
          call.status !== CallStatus.READY
        ) {
          continue;
        }

        const thresholdSecs =
          call.status === CallStatus.READY
            ? thresholds.readySeconds
            : thresholds.dialingSeconds;
        const message =
          `Stale in-flight reclaimed (status=${call.status} after ${thresholdSecs}s without complete)`;

        call.errorMessage = message;
        await this.applyFailure({
          call,
          failureCode: CallFailureCode.TIMEOUT,
        });
        reaped += 1;
      } catch (err) {
        this.logger.error(
          `Stale in-flight reap failed id=${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (reaped > 0) {
      this.logger.warn(
        `Reaped ${reaped} stale in-flight call(s) (dialing>${thresholds.dialingSeconds}s ready>${thresholds.readySeconds}s)`,
      );
    }
    return reaped;
  }

  /**
   * Shared fail/requeue for claimed dial, stale reap, and worker failed complete.
   * Callers set errorMessage / endedAt / classify the code. Complete passes
   * priceBeforeReset so the attempt is priced before resetForRequeue (and on
   * terminal) while timestamps are still present.
   */
  async applyFailure(input: {
    call: Call;
    failureCode: CallFailureCode;
    priceBeforeReset?: boolean;
  }): Promise<Call> {
    const { call, failureCode, priceBeforeReset = false } = input;

    if (this.shouldConsiderQueueRequeue(call)) {
      const settings = await this.queueSettingsService.getOrCreate(
        call.organizationId,
      );
      const decision = this.queueRetryService.decide({
        call,
        settings,
        failureCode,
      });

      if (decision.action === 'requeue') {
        if (call.roomName) {
          await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
        }
        if (priceBeforeReset) {
          await priceAttemptSafe(
            this.priceService,
            this.logger,
            call,
            'append',
          );
        }
        this.queueRetryService.resetForRequeue(call, decision);
        this.logger.warn(
          `Requeued call id=${call.id} code=${failureCode} next=${decision.nextAttemptAt.toISOString()}`,
        );
        return this.callsRepository.save(call);
      }
    }

    if (priceBeforeReset) {
      await priceAttemptSafe(this.priceService, this.logger, call, 'append');
    }
    this.queueRetryService.markTerminalFailed(call, failureCode);
    if (call.roomName) {
      await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
    }
    const saved = await this.callsRepository.save(call);
    if (saved.batchId) {
      await this.callBatchesService.maybeMarkCompleted(saved.batchId);
    }
    this.logger.error(
      `Call failed terminal id=${saved.id} code=${failureCode}` +
        (saved.errorMessage ? `: ${saved.errorMessage}` : ''),
    );
    return saved;
  }

  /** Outbound queue retries only. Inbound rings must never become pending dials. */
  private shouldConsiderQueueRequeue(
    call: Call,
  ): call is Call & { organizationId: string } {
    return (
      !!call.organizationId &&
      call.maxAttempts > 1 &&
      call.direction !== AgentDirection.INBOUND
    );
  }
}
