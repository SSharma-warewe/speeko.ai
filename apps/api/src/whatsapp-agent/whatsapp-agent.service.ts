import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import {
  listInboundTextMessages,
  phoneNumberIdFromMessagesUrl,
} from './lib/inbound-text';
import { isNewSessionCommand, NEW_SESSION_REPLY } from './lib/session-command';
import { RECEPTIONIST_INSTRUCTION } from './receptionist-instruction';
import {
  RECEPTIONIST_REPLY,
  type ReceptionistReply,
  type ReceptionistReplyOpts,
} from './receptionist-reply';
import { WhatsAppTextClient } from './whatsapp-text.client';
import { whatsappGhlToolIds } from './whatsapp-booking-tool-ids';

const SEEN_LIMIT = 500;
const UNAVAILABLE_REPLY =
  "Sorry, I'm having trouble responding right now. Please try again in a moment.";

/**
 * Answers inbound WhatsApp texts saved by the webhook.
 * Org lines: active whatsapp integration + non-empty systemPrompt → Meta token.
 * Platform WHATSAPP_URL line: hardcoded receptionist (fallback when no org match).
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
    private readonly meta: MetaWhatsAppClient,
    private readonly integrations: OrganizationIntegrationsService,
    private readonly toolProfiles: ToolProfilesService,
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
    const configuredPhone = phoneNumberIdFromMessagesUrl(
      this.config.get<string>('WHATSAPP_URL')?.trim() ?? '',
    );

    for (const message of messages) {
      if (this.seen.has(message.id) || this.inflight.has(message.id)) {
        continue;
      }
      this.inflight.add(message.id);
      try {
        const phoneNumberId = message.phoneNumberId?.trim() ?? '';
        if (!phoneNumberId) {
          continue;
        }

        const orgConnection =
          await this.integrations.findActiveWhatsAppByPhoneNumberId(
            phoneNumberId,
          );

        if (orgConnection) {
          // The webhook already persisted this org turn for the API ticker.
          if (
            ['true', '1'].includes(
              String(this.config.get('WHATSAPP_HARNESS_ENABLED') ?? 'false'),
            )
          )
            continue;
          const prompt = orgConnection.systemPrompt?.trim() ?? '';
          if (!prompt) {
            this.warnOnce(
              `org WhatsApp agent prompt empty (${orgConnection.organizationId})`,
            );
            continue;
          }
          const sessionKey = `${orgConnection.organizationId}:${message.from}`;
          if (isNewSessionCommand(message.body)) {
            await this.receptionist.reset(message.from, { sessionKey });
            const sent = await this.meta.sendText({
              token: orgConnection.apiKey,
              phoneNumberId: orgConnection.phoneNumberId ?? phoneNumberId,
              to: message.from,
              body: NEW_SESSION_REPLY,
            });
            if (sent.ok) {
              this.remember(message.id);
              this.logger.log(
                `WhatsApp org agent new session to=…${message.from.slice(-4)}`,
              );
            }
            continue;
          }
          if (!openRouterKey) {
            this.warnOnce('OPENROUTER_API_KEY is not set');
            continue;
          }
          let bookingSource:
            | {
                organizationId: string;
                voiceAgentId: string;
                toolIds: string[];
              }
            | undefined;
          if (
            orgConnection.bookingVoiceAgentId &&
            orgConnection.whatsappToolProfileId
          ) {
            try {
              await this.toolProfiles.getResponseForOrganization(
                orgConnection.organizationId,
                orgConnection.whatsappToolProfileId,
              );
              const ids = await this.toolProfiles.resolveEnabledToolIds(
                orgConnection.whatsappToolProfileId,
                orgConnection.organizationId,
              );
              const toolIds = whatsappGhlToolIds(ids);
              if (toolIds.length) {
                bookingSource = {
                  organizationId: orgConnection.organizationId,
                  voiceAgentId: orgConnection.bookingVoiceAgentId,
                  toolIds,
                };
              }
            } catch {
              this.warnOnce(
                `org WhatsApp tool profile unavailable (${orgConnection.organizationId})`,
              );
            }
          }
          const reply = await this.generateReply(message.from, message.body, {
            instruction: prompt,
            sessionKey,
            bookingSource,
          });
          const sent = await this.meta.sendText({
            token: orgConnection.apiKey,
            phoneNumberId: orgConnection.phoneNumberId ?? phoneNumberId,
            to: message.from,
            body: reply,
          });
          if (sent.ok) {
            this.remember(message.id);
            this.logger.log(
              `WhatsApp org agent sent to=…${message.from.slice(-4)}`,
            );
          }
          continue;
        }

        // Platform Speeko line (WHATSAPP_URL) — only when no org connection matched.
        if (!this.text.isConfigured()) {
          this.warnOnce('WHATSAPP_URL or WHATSAPP_API_KEY is not set');
          continue;
        }
        if (!configuredPhone) {
          this.warnOnce('WHATSAPP_URL has no phone number id');
          continue;
        }
        if (phoneNumberId !== configuredPhone) {
          this.warnOnce(
            `phone_number_id does not match WHATSAPP_URL (${phoneNumberId})`,
          );
          continue;
        }
        if (isNewSessionCommand(message.body)) {
          await this.receptionist.reset(message.from);
          const sent = await this.text.sendText(
            message.from,
            NEW_SESSION_REPLY,
          );
          if (sent) {
            this.remember(message.id);
            this.logger.log(
              `WhatsApp receptionist new session to=…${message.from.slice(-4)}`,
            );
          }
          continue;
        }
        if (!openRouterKey) {
          this.warnOnce('OPENROUTER_API_KEY is not set');
          continue;
        }
        const reply = await this.generateReply(message.from, message.body, {
          instruction: RECEPTIONIST_INSTRUCTION,
        });
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

  private async generateReply(
    from: string,
    body: string,
    options: ReceptionistReplyOpts,
  ): Promise<string> {
    try {
      const reply = (await this.receptionist.reply(from, body, options)).trim();
      if (reply) return reply;
      this.logger.warn('WhatsApp agent returned an empty reply');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`WhatsApp agent generation failed: ${reason}`);
    }
    return UNAVAILABLE_REPLY;
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
