import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  WhatsAppBookingService,
  type BookingSource,
} from './whatsapp-booking.service';
import {
  visibleReplyText,
  withoutThoughtParts,
  type ReplyPart,
} from './lib/visible-reply';
import { RECEPTIONIST_INSTRUCTION } from './receptionist-instruction';
import { buildWhatsAppInstruction } from './whatsapp-clock';
import type {
  ReceptionistReply,
  ReceptionistReplyOpts,
  ReceptionistResetOpts,
} from './receptionist-reply';

const LUNA_MODEL = 'openai/gpt-5.6-luna';
const APP_NAME = 'warewe-receptionist';
type BookingToolSource = BookingSource & { toolIds: string[] };

type AdkEvent = {
  content?: { parts?: ReplyPart[] };
  errorCode?: string;
  finishReason?: string;
};

type AdkLlmResponse = {
  content?: { role?: string; parts?: ReplyPart[] };
};

type AdkSessionKey = {
  appName: string;
  userId: string;
  sessionId: string;
};

type BookingToolContext = {
  sessionId: string;
  state: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
};

type AdkRunner = {
  sessionService: {
    getOrCreateSession(request: AdkSessionKey): Promise<unknown>;
    deleteSession(request: AdkSessionKey): Promise<void>;
  };
  runAsync(params: {
    userId: string;
    sessionId: string;
    newMessage: { role: 'user'; parts: Array<{ text: string }> };
  }): AsyncIterable<AdkEvent>;
};

type AdkModule = {
  FunctionTool: new (config: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (
      args: Record<string, string>,
      context?: BookingToolContext,
    ) => Promise<unknown>;
  }) => { name: string };
  LlmAgent: new (config: {
    name: string;
    description: string;
    model: unknown;
    instruction: (context: { sessionId: string }) => string;
    tools?: unknown[];
    afterModelCallback: (params: {
      response: AdkLlmResponse;
    }) => AdkLlmResponse | undefined;
  }) => unknown;
  InMemoryRunner: new (params: {
    agent: unknown;
    appName: string;
  }) => AdkRunner;
  isFinalResponse: (event: AdkEvent) => boolean;
};

type OpenRouterFactory = (
  model: string,
  options?: { apiKey?: string },
) => unknown;

/**
 * Webpack bundles Nest as CommonJS. A static import() is rewritten to
 * require(), which cannot load these ESM packages. A runtime import keeps
 * Node's native loader.
 */
function importEsm(specifier: string): Promise<Record<string, unknown>> {
  const load = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  return load(specifier);
}

function instructionKey(instruction: string): string {
  return createHash('sha256').update(instruction).digest('hex');
}

/**
 * Google ADK receptionist on OpenRouter GPT-5.6 Luna.
 * Runners are cached by instruction hash; sessions stay in memory keyed by
 * sessionKey (platform: sender digits; org: `{orgId}:{from}`).
 */
@Injectable()
export class WhatsAppLunaRunner implements ReceptionistReply {
  private readonly logger = new Logger(WhatsAppLunaRunner.name);
  private readonly runners = new Map<string, Promise<AdkRunner>>();

  constructor(
    private readonly config: ConfigService,
    private readonly booking: WhatsAppBookingService,
  ) {}

  async reply(
    from: string,
    text: string,
    opts?: ReceptionistReplyOpts,
  ): Promise<string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';
    if (!apiKey) {
      return '';
    }
    const instruction = opts?.instruction?.trim() || RECEPTIONIST_INSTRUCTION;
    const sessionId = opts?.sessionKey?.trim() || from;
    const source = opts?.bookingSource;
    const runtimeInstruction = source
      ? `${instruction}\n\nEnabled GHL tools from the selected tool profile: ${source.toolIds.join(', ')}. Use only these tools. Confirm a meeting only after scheduleGhlMeeting returns ok=true.`
      : `${instruction}\n\nBooking tools are not connected. Do not claim a contact was saved or a meeting booked.`;
    const runner = await this.runnerFor(apiKey, runtimeInstruction, source);
    await runner.sessionService.getOrCreateSession({
      appName: APP_NAME,
      userId: sessionId,
      sessionId,
    });

    const { isFinalResponse } = await this.adk();
    let reply = '';
    let finalEvents = 0;
    let lastFinishReason = 'none';
    for await (const event of runner.runAsync({
      userId: sessionId,
      sessionId,
      newMessage: { role: 'user', parts: [{ text }] },
    })) {
      if (event.errorCode) {
        throw new Error(`WhatsApp model failed (${event.errorCode})`);
      }
      if (!isFinalResponse(event)) {
        continue;
      }
      finalEvents += 1;
      lastFinishReason = event.finishReason ?? 'none';
      const next = visibleReplyText(event);
      if (next) {
        reply = next;
      }
    }
    if (!reply) {
      this.logger.warn(
        `WhatsApp model produced no visible reply finalEvents=${finalEvents} finishReason=${lastFinishReason}`,
      );
    }
    return reply;
  }

  async reset(from: string, opts?: ReceptionistResetOpts): Promise<void> {
    const sessionId = opts?.sessionKey?.trim() || from;
    if (this.runners.size === 0) {
      return;
    }
    // Delete the session on every cached runner — sessions are per runner.
    for (const runnerPromise of this.runners.values()) {
      const runner = await runnerPromise.catch(() => null);
      if (!runner) continue;
      await runner.sessionService
        .deleteSession({
          appName: APP_NAME,
          userId: sessionId,
          sessionId,
        })
        .catch(() => undefined);
    }
  }

  private runnerFor(
    apiKey: string,
    instruction: string,
    source?: BookingToolSource,
  ): Promise<AdkRunner> {
    const key = instructionKey(
      `${instruction}:${source?.organizationId ?? ''}:${source?.voiceAgentId ?? ''}:${source?.toolIds.join(',') ?? ''}`,
    );
    let pending = this.runners.get(key);
    if (!pending) {
      pending = this.createRunner(apiKey, instruction, source).catch(
        (error: unknown) => {
          this.runners.delete(key);
          throw error;
        },
      );
      this.runners.set(key, pending);
    }
    return pending;
  }

  private async createRunner(
    apiKey: string,
    instruction: string,
    source?: BookingToolSource,
  ): Promise<AdkRunner> {
    const adk = await this.adk();
    const bridge = await importEsm('adk-llm-bridge');
    const OpenRouter = bridge.OpenRouter as OpenRouterFactory;
    const agent = new adk.LlmAgent({
      name: 'warewe_receptionist',
      description: 'WhatsApp inbound agent.',
      model: OpenRouter(LUNA_MODEL, { apiKey }),
      instruction: ({ sessionId }) =>
        buildWhatsAppInstruction(instruction, sessionId),
      tools: source ? this.bookingTools(adk, source) : [],
      afterModelCallback: ({ response }) => withoutThoughtParts(response),
    });
    this.logger.log(`WhatsApp receptionist model=${LUNA_MODEL}`);
    return new adk.InMemoryRunner({ agent, appName: APP_NAME });
  }

  private bookingTools(adk: AdkModule, source: BookingToolSource): unknown[] {
    // ADK serializes Zod max() as a string maxLength. OpenRouter's OpenAI
    // tool schema requires a number and rejects the whole request with 400.
    // Advertise provider-compatible schemas and enforce lengths on execution.
    const lookupArgs = z.object({ email: z.string().max(255).optional() });
    const upsertArgs = z.object({
      firstName: z.string().max(120).optional(),
      lastName: z.string().max(120).optional(),
      email: z.string().max(255).optional(),
      company: z.string().max(255).optional(),
      notes: z.string().max(4000).optional(),
    });
    const tool = (
      name: string,
      description: string,
      parameters: unknown,
      execute: (
        args: Record<string, string>,
        context?: BookingToolContext,
      ) => Promise<unknown>,
    ) => new adk.FunctionTool({ name, description, parameters, execute });
    const available = [
      tool(
        'checkGhlFreeSlots',
        'Find open meeting slots. Offer only returned startIso times. Specify an IANA timezone for local times.',
        z.object({
          startTime: z.string(),
          endTime: z.string(),
          timezone: z.string().optional(),
        }),
        async (args, context) => {
          const result = await this.booking.freeSlots(
            source,
            args as { startTime: string; endTime: string; timezone?: string },
          );
          if (result.ok)
            context?.state.set(
              'wa:offeredSlots',
              result.slots.map((slot) => slot.startIso),
            );
          return result;
        },
      ),
      tool(
        'lookupGhlContact',
        'Look up an existing customer in the linked voice agent GHL account by the WhatsApp sender phone and optional email.',
        z.object({ email: z.string().optional() }),
        async (args, context) => {
          const parsed = lookupArgs.safeParse(args);
          if (!parsed.success)
            return {
              ok: false,
              error: 'invalid_arguments',
              message: 'Contact email must be at most 255 characters.',
            };
          const phone = context?.sessionId.startsWith(
            `${source.organizationId}:`,
          )
            ? context.sessionId.slice(source.organizationId.length + 1)
            : undefined;
          if (!phone)
            return {
              ok: false,
              error: 'missing_sender',
              message: 'WhatsApp sender phone is unavailable.',
            };
          const result = await this.booking.lookupContact(source, {
            email: parsed.data.email,
            phone,
          });
          if (result.ok && result.found)
            context?.state.set('wa:ghlContactId', result.contactId);
          return result;
        },
      ),
      tool(
        'upsertGhlContact',
        'Create or update the customer in the linked voice agent GHL account. Get their name and email. The WhatsApp sender number is supplied automatically.',
        z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          company: z.string().optional(),
          notes: z.string().optional(),
        }),
        async (args, context) => {
          const parsed = upsertArgs.safeParse(args);
          if (!parsed.success)
            return {
              ok: false,
              error: 'invalid_arguments',
              message: 'Contact details exceed the allowed length.',
            };
          const phone = context?.sessionId.startsWith(
            `${source.organizationId}:`,
          )
            ? context.sessionId.slice(source.organizationId.length + 1)
            : undefined;
          if (!phone)
            return {
              ok: false,
              error: 'missing_sender',
              message: 'WhatsApp sender phone is unavailable.',
            };
          const result = await this.booking.upsertContact(source, {
            ...parsed.data,
            phone,
          });
          if (result.ok)
            context?.state.set('wa:ghlContactId', result.contactId);
          return result;
        },
      ),
      tool(
        'scheduleGhlMeeting',
        'Book an agreed open slot for a contact found or created by the GHL contact tools. Never claim success when ok=false.',
        z.object({
          startTime: z.string(),
          endTime: z.string().optional(),
          timezone: z.string().optional(),
          title: z.string().optional(),
          description: z.string().optional(),
        }),
        async (args, context) => {
          const contactId = context?.state.get<string>('wa:ghlContactId');
          if (!contactId)
            return {
              ok: false,
              error: 'missing_contact',
              message: 'Look up or create the contact first.',
            };
          const previous = context?.state.get<{
            contactId: string;
            startTime: string;
            result: unknown;
          }>('wa:lastBooking');
          if (
            previous?.contactId === contactId &&
            previous.startTime === args.startTime
          )
            return previous.result;
          const slots = context?.state.get<string[]>('wa:offeredSlots') ?? [];
          const requested = Date.parse(args.startTime);
          if (
            !slots.some(
              (slot) =>
                slot === args.startTime ||
                (Number.isFinite(requested) && Date.parse(slot) === requested),
            )
          )
            return {
              ok: false,
              error: 'slot_not_checked',
              message:
                'Check availability and use an exact returned startIso before booking.',
            };
          const result = await this.booking.scheduleMeeting(source, {
            ...args,
            contactId,
            startTime: args.startTime,
          });
          if (result.ok)
            context?.state.set('wa:lastBooking', {
              contactId,
              startTime: args.startTime,
              result,
            });
          return result;
        },
      ),
    ];
    const selected = new Set(source.toolIds);
    return available.filter((item) => selected.has(item.name));
  }

  private async adk(): Promise<AdkModule> {
    return (await importEsm('@google/adk')) as unknown as AdkModule;
  }
}
