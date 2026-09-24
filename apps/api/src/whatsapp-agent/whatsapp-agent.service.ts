import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  listInboundTextMessages,
  phoneNumberIdFromMessagesUrl,
} from './lib/inbound-text';
import {
  RECEPTIONIST_REPLY,
  type ReceptionistReply,
} from './receptionist-reply';
import { WhatsAppTextClient } from './whatsapp-text.client';

const SEEN_LIMIT = 500;

/**
 * Answers inbound WhatsApp texts saved by the webhook.
 * Never throws for a missing key or a Graph failure — the webhook must stay 200.
 */
@Injectable()
export class WhatsAppAgentService {
  private readonly logger = new Logger(WhatsAppAgentService.name);
  private readonly seenIds: string[] = [];
  private readonly seen = new Set<string>();
  private readonly inflight = new Set<string>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly text: WhatsAppTextClient,
    @Inject(RECEPTIONIST_REPLY)
    private readonly receptionist: ReceptionistReply,
  ) {}

  async replyToWebhook(payload: unknown): Promise<void> {
    const messages = listInboundTextMessages(payload);
    if (messages.length === 0) {
      return;
    }

    const openRouterKey =
      this.config.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';
    if (!openRouterKey) {
      this.warnOnce('OPENROUTER_API_KEY is not set');
      return;
    }
    if (!this.text.isConfigured()) {
      this.warnOnce('WHATSAPP_URL or WHATSAPP_API_KEY is not set');
      return;
    }

    const configuredPhone = phoneNumberIdFromMessagesUrl(
      this.config.get<string>('WHATSAPP_URL')?.trim() ?? '',
    );
    if (!configuredPhone) {
      this.warnOnce('WHATSAPP_URL has no phone number id');
      return;
    }

    for (const message of messages) {
      if (message.phoneNumberId !== configuredPhone) {
        this.warnOnce(
          `phone_number_id does not match WHATSAPP_URL (${message.phoneNumberId ?? 'none'})`,
        );
        continue;
      }
      if (this.seen.has(message.id) || this.inflight.has(message.id)) {
        continue;
      }
      this.inflight.add(message.id);
      try {
        const reply = (
          await this.receptionist.reply(message.from, message.body)
        ).trim();
        if (!reply) {
          this.logger.warn('WhatsApp receptionist returned an empty reply');
          continue;
        }
        const sent = await this.text.sendText(message.from, reply);
        if (sent) {
          this.remember(message.id);
          this.logger.log(
            `WhatsApp receptionist sent to=…${message.from.slice(-4)}`,
          );
        }
      } finally {
        this.inflight.delete(message.id);
      }
    }
  }

  private remember(id: string): void {
    this.seen.add(id);
    this.seenIds.push(id);
    if (this.seenIds.length <= SEEN_LIMIT) {
      return;
    }
    const expired = this.seenIds.shift();
    if (expired) {
      this.seen.delete(expired);
    }
  }

  private warnOnce(reason: string): void {
    if (this.warned.has(reason)) {
      return;
    }
    this.warned.add(reason);
    this.logger.warn(`WhatsApp receptionist skipped: ${reason}`);
  }
}
