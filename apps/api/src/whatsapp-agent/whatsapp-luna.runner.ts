import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  visibleReplyText,
  withoutThoughtParts,
  type ReplyPart,
} from './lib/visible-reply';
import { RECEPTIONIST_INSTRUCTION } from './receptionist-instruction';
import type { ReceptionistReply } from './receptionist-reply';

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

/**
 * Google ADK receptionist on OpenRouter GPT-5.6 Luna.
 * Sessions stay in memory, keyed by the sender's WhatsApp digits.
 */
@Injectable()
export class WhatsAppLunaRunner implements ReceptionistReply {
  private readonly logger = new Logger(WhatsAppLunaRunner.name);
  private runnerPromise: Promise<AdkRunner> | null = null;

  constructor(private readonly config: ConfigService) {}

  async reply(from: string, text: string): Promise<string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';
    if (!apiKey) {
      return '';
    }
    const runner = await this.runner(apiKey);
    await runner.sessionService.getOrCreateSession({
      appName: APP_NAME,
      userId: from,
      sessionId: from,
    });

    const { isFinalResponse } = await this.adk();
    let reply = '';
    for await (const event of runner.runAsync({
      userId: from,
      sessionId: from,
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

  async reset(from: string): Promise<void> {
    if (!this.runnerPromise) {
      return;
    }
    const runner = await this.runnerPromise;
    await runner.sessionService.deleteSession({
      appName: APP_NAME,
      userId: from,
      sessionId: from,
    });
  }

  private runner(apiKey: string): Promise<AdkRunner> {
    if (!this.runnerPromise) {
      this.runnerPromise = this.createRunner(apiKey).catch((error: unknown) => {
        this.runnerPromise = null;
        throw error;
      });
    }
    return this.runnerPromise;
  }

  private async createRunner(apiKey: string): Promise<AdkRunner> {
    const adk = await this.adk();
    const bridge = await importEsm('adk-llm-bridge');
    const OpenRouter = bridge.OpenRouter as OpenRouterFactory;
    const agent = new adk.LlmAgent({
      name: 'warewe_receptionist',
      description:
        'WhatsApp receptionist for Warewe AI, AgentsHub.ai, and Speeko.ai.',
      model: OpenRouter(LUNA_MODEL, { apiKey }),
      instruction: RECEPTIONIST_INSTRUCTION,
      afterModelCallback: ({ response }) => withoutThoughtParts(response),
    });
    this.logger.log(`WhatsApp receptionist model=${LUNA_MODEL}`);
    return new adk.InMemoryRunner({ agent, appName: APP_NAME });
  }

  private async adk(): Promise<AdkModule> {
    return (await importEsm('@google/adk')) as unknown as AdkModule;
  }
}
