import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppHarnessService } from './whatsapp-harness.service';
import { OtpDeliveryRepository } from './otp-delivery.repository';

/** Same API-owned @Interval/claim/dispatch pattern as QueueDialerService. */
@Injectable()
export class WhatsAppTickerService {
  private readonly logger = new Logger(WhatsAppTickerService.name);
  private ticking = false;
  private lastTickAt: Date | null = null;
  private lastError: string | null = null;
  private sending = false;
  private lastSendAt: Date | null = null;
  private lastSendError: string | null = null;
  constructor(
    private readonly config: ConfigService,
    private readonly repository: WhatsAppHarnessRepository,
    private readonly harness: WhatsAppHarnessService,
    private readonly otp: OtpDeliveryRepository,
  ) {}

  health() {
    return {
      enabled: true,
      ...this.harness.readiness(),
      ticking: this.ticking,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
      sending: this.sending,
      lastSendAt: this.lastSendAt,
      lastSendError: this.lastSendError,
    };
  }

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.repository.reap();
      const url = this.config
        .get<string>('WHATSAPP_WORKER_URL')
        ?.replace(/\/$/, '');
      const secret = this.config.get<string>('WORKER_CALLBACK_SECRET');
      if (!url || !secret) throw new Error('worker_configuration_missing');
      const limit =
        Number(this.config.get('WHATSAPP_TICKER_MAX_CONCURRENT')) || 4;
      const turns = await this.repository.claim(limit);
      await Promise.all(
        turns.map(async (turn) => {
          try {
            const runtime = await this.harness.runtime(turn);
            if (runtime.task) {
              const health = await fetch(`${url}/health`, {
                redirect: 'error',
                signal: AbortSignal.timeout(3000),
              });
              const protocol = health.ok
                ? ((await health.json()) as {
                    taskProtocolVersion?: number;
                    supportedTaskProtocolVersions?: number[];
                  })
                : null;
              if (
                runtime.taskProtocolVersion === 2
                  ? !protocol?.supportedTaskProtocolVersions?.includes(2)
                  : protocol?.taskProtocolVersion !== 1
              ) {
                await this.repository.fail(
                  turn.id,
                  turn.leaseToken!,
                  'worker_task_protocol_unavailable',
                  true,
                );
                return;
              }
            }
            const response = await fetch(`${url}/turns`, {
              method: 'POST',
              redirect: 'error',
              headers: {
                'Content-Type': 'application/json',
                'X-Worker-Secret': secret,
              },
              body: JSON.stringify(runtime),
              signal: AbortSignal.timeout(8000),
            });
            if (response.status === 202) return;
            await this.repository.fail(
              turn.id,
              turn.leaseToken!,
              `dispatch_http_${response.status}`,
              response.status === 429 || response.status === 503,
            );
          } catch {
            // Network acceptance may be ambiguous: leave the lease to heartbeat
            // or expire. Never dispatch a second execution immediately.
            this.logger.warn(`WhatsApp dispatch unavailable turn=${turn.id}`);
          }
        }),
      );
      this.lastTickAt = new Date();
      this.lastError = null;
    } catch {
      this.lastError = 'ticker_error';
      this.logger.error('WhatsApp ticker failed');
    } finally {
      this.ticking = false;
    }
  }

  /** Delivery is independent of dispatch/model capacity and worker configuration. */
  @Interval(1000)
  async sendTick(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      await this.otp.reap();
      const limit =
        Number(this.config.get('WHATSAPP_TICKER_MAX_CONCURRENT')) || 4;
      const sends = await Promise.allSettled(
        Array.from({ length: Math.min(limit, 4) }, () =>
          this.harness.sendOne(),
        ),
      );
      if (sends.some((result) => result.status === 'rejected'))
        throw new Error('outbox_send_failed');
      this.lastSendAt = new Date();
      this.lastSendError = null;
    } catch {
      this.lastSendError = 'outbox_send_failed';
      this.logger.error('WhatsApp outbox ticker failed');
    } finally {
      this.sending = false;
    }
  }
}
