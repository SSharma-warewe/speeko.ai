import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppHarnessService } from './whatsapp-harness.service';

/** Same API-owned @Interval/claim/dispatch pattern as QueueDialerService. */
@Injectable()
export class WhatsAppTickerService {
  private readonly logger = new Logger(WhatsAppTickerService.name);
  private ticking = false;
  private lastTickAt: Date | null = null;
  private lastError: string | null = null;
  constructor(
    private readonly config: ConfigService,
    private readonly repository: WhatsAppHarnessRepository,
    private readonly harness: WhatsAppHarnessService,
  ) {}

  health() {
    return {
      enabled: this.harness.isEnabled(),
      ticking: this.ticking,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
    };
  }

  @Interval(1000)
  async tick(): Promise<void> {
    if (!this.harness.isEnabled() || this.ticking) return;
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
      // Bound send work independently of worker capacity. Slow Meta requests
      // must not hold up lease recovery for limit * 15 seconds.
      const sends = await Promise.allSettled(
        Array.from({ length: Math.min(limit, 4) }, () =>
          this.harness.sendOne(),
        ),
      );
      if (sends.some((result) => result.status === 'rejected'))
        throw new Error('outbox_send_failed');
      this.lastTickAt = new Date();
      this.lastError = null;
    } catch {
      this.lastError = 'ticker_error';
      this.logger.error('WhatsApp ticker failed');
    } finally {
      this.ticking = false;
    }
  }
}
