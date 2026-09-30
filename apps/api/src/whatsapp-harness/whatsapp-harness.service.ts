import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WHATSAPP_AGENT_TOOL_IDS,
  type WhatsAppAgentToolId,
  type WhatsAppTurnCheckpoint,
  type WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { z } from 'zod';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { listInboundTextMessages } from '../whatsapp-agent/lib/inbound-text';
import { WhatsAppBookingService } from '../whatsapp-agent/whatsapp-booking.service';
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { PlatformWhatsAppConfig } from '../meta-whatsapp/platform-whatsapp.config';
import { RECEPTIONIST_INSTRUCTION } from '../whatsapp-agent/receptionist-instruction';
import { OtpDeliveryService } from './otp-delivery.service';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppConversation } from './whatsapp-conversation.entity';
import { WhatsAppTurn } from './whatsapp-turn.entity';

const toolArgs = {
  lookupGhlContact: z
    .object({ email: z.string().max(255).optional() })
    .strict(),
  upsertGhlContact: z
    .object({
      firstName: z.string().max(120).optional(),
      lastName: z.string().max(120).optional(),
      email: z.string().max(255).optional(),
      company: z.string().max(255).optional(),
      notes: z.string().max(4000).optional(),
    })
    .strict(),
  checkGhlFreeSlots: z
    .object({
      startTime: z.string().max(100),
      endTime: z.string().max(100),
      timezone: z.string().max(100).optional(),
    })
    .strict(),
  scheduleGhlMeeting: z
    .object({
      startTime: z.string().max(100),
      endTime: z.string().max(100).optional(),
      timezone: z.string().max(100).optional(),
      title: z.string().max(255).optional(),
      description: z.string().max(4000).optional(),
    })
    .strict(),
};
const sessionSchema = z
  .object({
    state: z.record(z.unknown()),
    events: z.array(z.record(z.unknown())).max(2000),
  })
  .strict();
export const checkpointSchema = z.object({
  session: sessionSchema,
  reply: z.string().trim().min(1).max(4096).optional(),
});

function stripThoughts(checkpoint: WhatsAppTurnCheckpoint) {
  for (const event of checkpoint.session.events) {
    const content = event.content as
      { parts?: Array<{ thought?: boolean }> } | undefined;
    if (Array.isArray(content?.parts))
      content.parts = content.parts.filter((part) => part && !part.thought);
  }
  return checkpoint;
}

@Injectable()
export class WhatsAppHarnessService {
  constructor(
    private readonly config: ConfigService,
    private readonly repository: WhatsAppHarnessRepository,
    private readonly integrations: OrganizationIntegrationsService,
    private readonly organizations: OrganizationsService,
    private readonly profiles: ToolProfilesService,
    private readonly booking: WhatsAppBookingService,
    private readonly meta: MetaWhatsAppClient,
    private readonly platform: PlatformWhatsAppConfig,
    private readonly otpDelivery: OtpDeliveryService,
  ) {}

  isEnabled() {
    return ['true', '1'].includes(
      String(this.config.get('WHATSAPP_HARNESS_ENABLED') ?? 'false'),
    );
  }

  isPlatformEnabled() {
    return (
      this.isEnabled() &&
      ['true', '1'].includes(
        String(this.config.get('WHATSAPP_PLATFORM_HARNESS_ENABLED') ?? 'false'),
      )
    );
  }

  async ingestWebhook(payload: unknown): Promise<void> {
    if (!this.isEnabled()) return;
    for (const message of listInboundTextMessages(payload)) {
      if (!message.phoneNumberId) continue;
      const connection =
        await this.integrations.findActiveWhatsAppByPhoneNumberId(
          message.phoneNumberId,
        );
      // An active org connection owns the number even with an empty prompt.
      if (!connection) {
        const platform = this.isPlatformEnabled()
          ? this.platform.resolve()
          : null;
        if (platform?.phoneNumberId === message.phoneNumberId)
          await this.repository.ingest({
            scope: 'platform',
            organizationId: null,
            connectionId: null,
            sender: message.from,
            phoneNumberId: message.phoneNumberId,
            messageId: message.id,
            body: message.body,
          });
        continue;
      }
      if (!connection.systemPrompt?.trim()) continue;
      const org = await this.organizations.findById(connection.organizationId);
      if (!org.isActive) continue;
      await this.repository.ingest({
        organizationId: org.id,
        connectionId: connection.id,
        sender: message.from,
        phoneNumberId: message.phoneNumberId,
        messageId: message.id,
        body: message.body,
      });
    }
  }

  private async connection(conversation: WhatsAppConversation) {
    if (
      conversation.scope === 'platform' ||
      !conversation.organizationId ||
      !conversation.connectionId
    )
      throw new ForbiddenException('Platform tools are not connected');
    const org = await this.organizations.findById(conversation.organizationId);
    const connection = await this.integrations.getEntityForOrg(
      conversation.organizationId,
      conversation.connectionId,
    );
    if (
      !org.isActive ||
      !connection.isActive ||
      connection.provider !== 'whatsapp' ||
      !connection.systemPrompt?.trim()
    )
      throw new ForbiddenException('WhatsApp agent is disabled');
    return connection;
  }

  async runtime(turn: WhatsAppTurn): Promise<WhatsAppWorkerTurn> {
    const conversation = await this.repository.getConversation(
      turn.conversationId,
    );
    if (conversation.scope === 'platform') {
      const platform = this.platform.resolve();
      if (
        !platform ||
        platform.phoneNumberId !== conversation.platformPhoneNumberId
      )
        throw new ForbiddenException('WhatsApp agent is disabled');
      return {
        id: turn.id,
        conversationId: conversation.id,
        generation: turn.generation,
        leaseToken: turn.leaseToken!,
        sender: conversation.sender,
        body: turn.body,
        prompt: RECEPTIONIST_INSTRUCTION,
        enabledTools: [],
        session: turn.baseSession!,
        checkpoint: turn.checkpoint,
      };
    }
    const connection = await this.connection(conversation);
    let enabledTools: WhatsAppAgentToolId[] = [];
    if (connection.bookingVoiceAgentId && connection.whatsappToolProfileId) {
      try {
        await this.profiles.getResponseForOrganization(
          conversation.organizationId!,
          connection.whatsappToolProfileId,
        );
        const ids = await this.profiles.resolveEnabledToolIds(
          connection.whatsappToolProfileId,
          conversation.organizationId!,
        );
        enabledTools = WHATSAPP_AGENT_TOOL_IDS.filter((id) => ids.includes(id));
      } catch {
        /* A removed profile disables tools, not normal conversation. */
      }
    }
    return {
      id: turn.id,
      conversationId: conversation.id,
      generation: turn.generation,
      leaseToken: turn.leaseToken!,
      sender: conversation.sender,
      body: turn.body,
      prompt: connection.systemPrompt!.trim(),
      enabledTools,
      session: turn.baseSession!,
      checkpoint: turn.checkpoint,
    };
  }

  async checkpoint(id: string, token: string, input: unknown) {
    const checkpoint = checkpointSchema.parse(input);
    // Strip thought parts from the worker payload as well as in the worker.
    return this.repository.checkpoint(id, token, stripThoughts(checkpoint));
  }

  async complete(id: string, token: string, input: unknown) {
    const checkpoint = checkpointSchema.required({ reply: true }).parse(input);
    return this.repository.complete(id, token, stripThoughts(checkpoint));
  }

  async executeTool(
    id: string,
    token: string,
    toolId: WhatsAppAgentToolId,
    rawArgs: unknown,
  ) {
    const schema = toolArgs[toolId];
    if (!schema) throw new ForbiddenException('WhatsApp tool is not supported');
    const parsed = schema.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, error: 'invalid_arguments' };
    const args = parsed.data as Record<string, string>;
    const loaded = await this.repository.withTurn(
      id,
      token,
      async ({ conversation }) => ({
        conversation,
        connection: await this.connection(conversation),
      }),
    );
    const { conversation, connection } = loaded;
    if (!connection.bookingVoiceAgentId || !connection.whatsappToolProfileId)
      throw new ForbiddenException('WhatsApp tools are not connected');
    await this.profiles.getResponseForOrganization(
      conversation.organizationId!,
      connection.whatsappToolProfileId,
    );
    const ids = await this.profiles.resolveEnabledToolIds(
      connection.whatsappToolProfileId,
      conversation.organizationId!,
    );
    if (!ids.includes(toolId))
      throw new ForbiddenException('WhatsApp tool is no longer assigned');
    const source = {
      organizationId: conversation.organizationId!,
      voiceAgentId: connection.bookingVoiceAgentId,
    };
    const contactId = conversation.toolState.contactId as string | undefined;
    // Calendar writes are deduped across turns; reads are cached only within a
    // turn. The actual customer phone and contact id come from trusted state.
    const keyInput =
      toolId === 'scheduleGhlMeeting'
        ? {
            toolId,
            voiceAgentId: source.voiceAgentId,
            contactId,
            startTime: Number.isFinite(Date.parse(args.startTime))
              ? Date.parse(args.startTime)
              : args.startTime,
          }
        : {
            turnId: id,
            toolId,
            args: Object.fromEntries(
              Object.entries(args).sort(([a], [b]) => a.localeCompare(b)),
            ),
          };
    const key = createHash('sha256')
      .update(JSON.stringify(keyInput))
      .digest('hex');
    let reservation;
    try {
      reservation = await this.repository.reserveTool(
        id,
        token,
        key,
        toolId,
        (current) => {
          if (toolId !== 'scheduleGhlMeeting') return;
          if (!contactId || current.toolState.contactId !== contactId)
            throw new ConflictException('Look up or create the contact first');
          const slots = (current.toolState.offeredSlots ?? []) as string[];
          if (
            !slots.some(
              (slot) =>
                slot === args.startTime ||
                (Number.isFinite(Date.parse(args.startTime)) &&
                  Date.parse(slot) === Date.parse(args.startTime)),
            )
          )
            throw new ConflictException(
              'Check availability and use an exact returned startIso',
            );
        },
      );
    } catch (error) {
      if (
        error instanceof ConflictException &&
        error.message !== 'WhatsApp turn lease expired'
      )
        return {
          ok: false,
          error: contactId ? 'slot_not_checked' : 'missing_contact',
          message: error.message,
        };
      throw error;
    }
    if (!reservation.fresh)
      return reservation.operation.status === 'finished'
        ? reservation.operation.result
        : {
            ok: false,
            error: 'operation_outcome_unknown',
            message:
              'This operation is in progress or its outcome is uncertain. Do not repeat or claim success.',
          };
    let result: Record<string, unknown>;
    try {
      switch (toolId) {
        case 'lookupGhlContact':
          result = await this.booking.lookupContact(source, {
            email: args.email,
            phone: conversation.sender,
          });
          break;
        case 'upsertGhlContact':
          result = await this.booking.upsertContact(source, {
            ...args,
            phone: conversation.sender,
          });
          break;
        case 'checkGhlFreeSlots':
          result = await this.booking.freeSlots(
            source,
            args as { startTime: string; endTime: string; timezone?: string },
          );
          break;
        case 'scheduleGhlMeeting':
          // Returned calendar slots are authoritative instants, not model wall
          // clock guesses. Numeric offsets bypass GHL's Z+timezone heuristic.
          const ends = (conversation.toolState.offeredSlotEnds ?? {}) as Record<
            string,
            string
          >;
          const slot = (
            (conversation.toolState.offeredSlots ?? []) as string[]
          ).find(
            (value) =>
              value === args.startTime ||
              Date.parse(value) === Date.parse(args.startTime),
          )!;
          result = await this.booking.scheduleMeeting(source, {
            title: args.title,
            description: args.description,
            contactId: contactId!,
            startTime: new Date(Date.parse(slot))
              .toISOString()
              .replace(/Z$/, '+00:00'),
            endTime: ends[slot]
              ? new Date(Date.parse(ends[slot]))
                  .toISOString()
                  .replace(/Z$/, '+00:00')
              : undefined,
          });
          break;
      }
    } catch {
      // A reserved write with no result remains uncertain across a restart.
      return { ok: false, error: 'operation_outcome_unknown' };
    }
    if (
      toolId === 'scheduleGhlMeeting' &&
      !result.ok &&
      (result.error === 'network_error' ||
        result.error === 'ghl_appointment_missing_id' ||
        /^ghl_appointment_5\d\d$/.test(String(result.error)))
    )
      return {
        ok: false,
        error: 'operation_outcome_unknown',
        message:
          'The booking outcome is uncertain. Do not repeat or claim success.',
      };
    await this.repository.finishTool(
      reservation.operation,
      result,
      (current) => {
        if (!result.ok) return;
        if (
          (toolId === 'lookupGhlContact' && result.found) ||
          toolId === 'upsertGhlContact'
        )
          current.toolState.contactId = result.contactId;
        if (toolId === 'checkGhlFreeSlots') {
          current.toolState.offeredSlots = (
            result.slots as Array<{ startIso: string }>
          ).map((slot) => slot.startIso);
          current.toolState.offeredSlotEnds = Object.fromEntries(
            (result.slots as Array<{ startIso: string; endIso: string }>).map(
              (slot) => [slot.startIso, slot.endIso],
            ),
          );
        }
      },
    );
    return result;
  }

  async sendOne(): Promise<boolean> {
    const reserved = await this.repository.reserveSend();
    if (!reserved) return false;
    if (reserved.kind === 'otp_template') {
      await this.otpDelivery.sendReserved(reserved.id);
      return true;
    }
    await this.repository.withSend(
      reserved.id,
      async (outbox, conversation, manager) => {
        let source;
        try {
          if (conversation.scope === 'platform') {
            const platform = this.platform.resolve();
            if (
              !platform ||
              platform.phoneNumberId !== conversation.platformPhoneNumberId
            )
              throw new Error('platform_disabled');
            source = platform;
          } else {
            const connection = await this.connection(conversation);
            source = {
              token: connection.apiKey,
              phoneNumberId: connection.phoneNumberId!,
            };
          }
        } catch {
          outbox.status = 'cancelled';
          outbox.errorCode = 'agent_disabled';
          await manager.save(outbox);
          return;
        }
        const sent = await this.meta.sendText({
          ...source,
          to: conversation.sender,
          body: outbox.body!,
        });
        if (sent.ok) {
          outbox.status = 'accepted';
          outbox.wamid = sent.data.wamid;
        } else if (sent.status === 429 && outbox.attemptCount < 3) {
          outbox.status = 'pending';
          outbox.nextAttemptAt = new Date(Date.now() + 30_000);
          outbox.errorCode = 'meta_rate_limited';
        } else {
          outbox.status =
            sent.status === 0 || sent.status >= 500 ? 'uncertain' : 'failed';
          outbox.errorCode =
            outbox.status === 'uncertain'
              ? 'send_outcome_unknown'
              : `meta_http_${sent.status}`;
        }
        await manager.save(outbox);
      },
    );
    return true;
  }
}
