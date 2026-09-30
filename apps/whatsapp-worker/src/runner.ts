import {
  LlmAgent,
  Runner,
  isFinalResponse,
  type Event,
  type BaseLlm,
} from '@google/adk';
import { OpenRouter } from 'adk-llm-bridge';
import {
  WHATSAPP_AGENT_MODEL,
  type WhatsAppTurnCheckpoint,
  type WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { HarnessApiClient } from './api-client.js';
import { ApiSessionStore } from './session-store.js';
import { buildTools } from './tools.js';
import { buildWhatsAppInstruction } from './clock.js';

export function visibleText(event: Event): string {
  return (event.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

export async function runTurn(
  turn: WhatsAppWorkerTurn,
  api: HarnessApiClient,
  apiKey: string,
  signal: AbortSignal,
  model?: BaseLlm,
): Promise<WhatsAppTurnCheckpoint> {
  // Crash between final checkpoint and complete: use the persisted answer.
  if (turn.checkpoint?.reply) return turn.checkpoint;
  const store = new ApiSessionStore(turn, api, signal);
  const capabilities = turn.enabledTools.length
    ? `Enabled tools: ${turn.enabledTools.join(', ')}. Confirm booking or contact changes only after the tool returns ok=true.`
    : 'Booking tools are not connected. Do not claim a contact was saved or a meeting booked.';
  const agent = new LlmAgent({
    name: 'warewe_receptionist',
    model:
      model ??
      OpenRouter(WHATSAPP_AGENT_MODEL, {
        apiKey,
        timeout: 45_000,
        maxRetries: 0,
      }),
    instruction: () =>
      buildWhatsAppInstruction(
        `${turn.prompt}\n\n${capabilities}`,
        turn.sender,
      ),
    tools: buildTools(turn, api, signal),
    afterModelCallback: ({ response }) => {
      if (response.content?.parts?.some((part) => part.thought))
        return {
          ...response,
          content: {
            ...response.content,
            parts: response.content.parts.filter((part) => !part.thought),
          },
        };
      return undefined;
    },
  });
  const runner = new Runner({
    appName: 'warewe-receptionist',
    agent,
    sessionService: store,
  });
  await store.getOrCreateSession({
    appName: runner.appName,
    userId: turn.sender,
    sessionId: turn.conversationId,
  });
  let reply = '';
  for await (const event of runner.runAsync({
    userId: turn.sender,
    sessionId: turn.conversationId,
    newMessage: { role: 'user', parts: [{ text: turn.body }] },
    abortSignal: signal,
    runConfig: { maxLlmCalls: 12 },
  })) {
    if (event.errorCode) throw new Error('model_error');
    if (isFinalResponse(event)) reply = visibleText(event) || reply;
  }
  if (!reply) throw new Error('empty_reply');
  const checkpoint = { session: store.snapshot(), reply: reply.slice(0, 4096) };
  await api.post(turn, 'checkpoint', checkpoint, signal);
  return checkpoint;
}
