import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CallDialService } from '../calls/services/call-dial.service';
import { CallFailureService } from '../calls/services/call-failure.service';
import { OrganizationQueueSettingsService } from './organization-queue-settings.service';
import { QueueClaimService } from './queue-claim.service';
import { QUEUE_DEFAULTS } from './queue.defaults';

/**
 * In-process outbound dial queue. Claims pending rows and dials via CallDialService.
 * LiveKit voice worker remains voice-only.
 */
@Injectable()
export class QueueDialerService {
  private readonly logger = new Logger(QueueDialerService.name);
  private ticking = false;
  private lastTickAt: Date | null = null;
  private lastClaimCount = 0;
  private lastError: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settingsService: OrganizationQueueSettingsService,
    private readonly claimService: QueueClaimService,
    @Inject(forwardRef(() => CallDialService))
    private readonly callDial: CallDialService,
    @Inject(forwardRef(() => CallFailureService))
    private readonly callFailure: CallFailureService,
  ) {}

  getHealth() {
    return {
      globalEnabled: this.isEnabled(),
      lastTickAt: this.lastTickAt,
      lastClaimCount: this.lastClaimCount,
      lastError: this.lastError,
      ticking: this.ticking,
    };
  }

  @Interval(2000)
  async tick(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    let claimedTotal = 0;
    try {
      // Global: free concurrency held by dialing/ready zombies (worker never completed).
      try {
        await this.callFailure.reapStaleInFlight();
      } catch (err) {
        this.logger.error(
          `Stale in-flight reap failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      const orgs = await this.settingsService.findEnabledAndNotPaused();
      for (const settings of orgs) {
        try {
          await this.claimService.reclaimStale(settings.organizationId);

          const inProgress = await this.claimService.countInProgress(
            settings.organizationId,
          );
          const slots = Math.max(0, settings.maxConcurrent - inProgress);
          if (slots <= 0) {
            continue;
          }

          const dialsLastMin = await this.claimService.countDialsLastMinute(
            settings.organizationId,
          );
          const rateRemaining = Math.max(
            0,
            settings.maxDialsPerMinute - dialsLastMin,
          );
          if (rateRemaining <= 0) {
            continue;
          }

          // Claim only up to free SIP slots. maxConcurrent must match the
          // provider channel limit (e.g. 1). Live calls stay in ready/dialing
          // until hangup, so they keep occupying a slot.
          const limit = Math.min(
            slots,
            rateRemaining,
            settings.claimBatchSize || QUEUE_DEFAULTS.claimBatchSize,
          );
          const claimed = await this.claimService.claimPending(
            settings.organizationId,
            limit,
          );
          claimedTotal += claimed.length;

          // Dial one-by-one. Re-check capacity before each dial: waitUntilAnswered
          // returns after answer, but the call is still live (status=ready) and
          // still holds a SIP channel — do not start the next leg until a slot frees.
          for (const call of claimed) {
            if (!call?.id) {
              this.logger.error('Dial claimed call skipped: missing call id');
              continue;
            }
            try {
              const others = await this.claimService.countInProgressExcluding(
                settings.organizationId,
                call.id,
              );
              if (others >= settings.maxConcurrent) {
                const released =
                  await this.claimService.releaseClaimToPending(call.id);
                this.logger.log(
                  `Deferred dial id=${call.id} to=${call.toNumber}: ` +
                    `${others} in-flight >= maxConcurrent=${settings.maxConcurrent}` +
                    (released ? ' (requeued pending)' : ''),
                );
                continue;
              }

              this.logger.log(
                `Dialing claimed call id=${call.id} to=${call.toNumber} attempt=${call.attemptCount}/${call.maxAttempts}`,
              );
              await this.callDial.dialClaimedCall(call);
            } catch (err) {
              this.logger.error(
                `Dial claimed call failed id=${call.id}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }
        } catch (err) {
          this.logger.error(
            `Queue tick org=${settings.organizationId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      this.lastTickAt = new Date();
      this.lastClaimCount = claimedTotal;
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Queue dialer tick failed: ${this.lastError}`);
    } finally {
      this.ticking = false;
    }
  }

  private isEnabled(): boolean {
    const raw = this.config.get<string>('QUEUE_DIALER_ENABLED');
    if (raw === undefined || raw === null || raw === '') {
      return true;
    }
    return raw !== 'false' && raw !== '0';
  }
}
