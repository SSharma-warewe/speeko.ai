import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  visibleReplyText,
  withoutThoughtParts,
  type ReplyPart,
} from './lib/visible-reply';
import { RECEPTIONIST_INSTRUCTION } from './receptionist-instruction';
import type {
  ReceptionistReply,
  ReceptionistReplyOpts,
  ReceptionistResetOpts,
} from './receptionist-reply';

const LUNA_MODEL = 'openai/gpt-5.6-luna';
const APP_NAME = 'warewe-receptionist';

type AdkEvent = {
  content?: { parts?: ReplyPart[] };
};

type AdkLlmResponse = {
  content?: { role?: string; parts?: ReplyPart[] };
};

type AdkSessionKey = {
  appName: string;
  userId: string;
  sessionId: string;
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
  LlmAgent: new (config: {
    name: string;
    description: string;
    model: unknown;
    instruction: string;
    afterModelCallback: (params: {
      response: AdkLlmResponse;
    }) => AdkLlmResponse | undefined;
  }) => unknown;
  InMemoryRunner: new (params: { agent: unknown; appName: string }) => AdkRunner;
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
  const load = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<Record<string, unknown>>;
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

  constructor(private readonly config: ConfigService) {}

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
    const runner = await this.runnerFor(apiKey, instruction);
    await runner.sessionService.getOrCreateSession({
      appName: APP_NAME,
      userId: sessionId,
      sessionId,
    });

    const { isFinalResponse } = await this.adk();
    let reply = '';
    for await (const event of runner.runAsync({
      userId: sessionId,
      sessionId,
      newMessage: { role: 'user', parts: [{ text }] },
    })) {
      if (!isFinalResponse(event)) {
        continue;
      }
      const next = visibleReplyText(event);
      if (next) {
        reply = next;
      }
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
  ): Promise<AdkRunner> {
    const key = instructionKey(instruction);
    let pending = this.runners.get(key);
    if (!pending) {
      pending = this.createRunner(apiKey, instruction).catch(
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
  ): Promise<AdkRunner> {
    const adk = await this.adk();
    const bridge = await importEsm('adk-llm-bridge');
    const OpenRouter = bridge.OpenRouter as OpenRouterFactory;
    const agent = new adk.LlmAgent({
      name: 'warewe_receptionist',
      description: 'WhatsApp inbound agent.',
      model: OpenRouter(LUNA_MODEL, { apiKey }),
      instruction,
      afterModelCallback: ({ response }) => withoutThoughtParts(response),
    });
    this.logger.log(`WhatsApp receptionist model=${LUNA_MODEL}`);
    return new adk.InMemoryRunner({ agent, appName: APP_NAME });
  }

  private async adk(): Promise<AdkModule> {
    return (await importEsm('@google/adk')) as unknown as AdkModule;
  }
}
