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
  whatsAppSenderTimeZone,
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
  if (turn.task?.status === 'completed' && turn.task.result) {
    const checkpoint = {
      session: turn.session,
      reply: bookingConfirmation(turn.task.result, turn.sender),
    };
    await api.post(turn, 'checkpoint', checkpoint, signal);
    return checkpoint;
  }
  const lifecycle: {
    booking?: Record<string, unknown>;
    decline?: { evidence: string };
  } = {};
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
        `${turn.prompt}\n\n${capabilities}${turn.task ? `\n\nTASK (primary objective): ${turn.task.objective}\nSuccess requires the scheduleGhlMeeting tool to return ok=true with an appointmentId. Contact capture and text alone never finish the task. Offer only checked slots and book only after the customer agrees. If the customer explicitly refuses booking, call declineBooking with their exact current-message quote, then politely acknowledge. Do not request cancellation because of a tool error.` : ''}`,
        turn.sender,
      ),
    tools: buildTools(turn, api, signal, lifecycle),
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
    sessionId: turn.task?.sessionId ?? turn.conversationId,
  });
  let reply = '';
  for await (const event of runner.runAsync({
    userId: turn.sender,
    sessionId: turn.task?.sessionId ?? turn.conversationId,
    newMessage: { role: 'user', parts: [{ text: turn.body }] },
    abortSignal: signal,
    runConfig: { maxLlmCalls: 12 },
  })) {
    if (event.errorCode) throw new Error('model_error');
    if (lifecycle.booking) {
      reply = bookingConfirmation(lifecycle.booking, turn.sender);
      break;
    }
    if (lifecycle.decline) {
      reply =
        'Understood. I won’t proceed with a booking. Thank you! This session has ended.';
      break;
    }
    if (isFinalResponse(event)) reply = visibleText(event) || reply;
  }
  if (!reply) throw new Error('empty_reply');
  const checkpoint: WhatsAppTurnCheckpoint = {
    session: store.snapshot(),
    reply: reply.slice(0, 4096),
    ...(lifecycle.decline && !lifecycle.booking
      ? { decline: lifecycle.decline }
      : {}),
  };
  await api.post(turn, 'checkpoint', checkpoint, signal);
  return checkpoint;
}

function bookingConfirmation(
  result: Record<string, unknown>,
  sender: string,
): string {
  const closing =
    'Thank you! Your booking is complete. This session has ended.';
  if (typeof result.appointmentId !== 'string' || !result.appointmentId.trim())
    throw new Error('invalid_booking_receipt');
  if (
    typeof result.startTime !== 'string' ||
    !Number.isFinite(Date.parse(result.startTime))
  )
    return `Your appointment is booked. ${closing}`;
  let timeZone =
    typeof result.timezone === 'string'
      ? result.timezone
      : whatsAppSenderTimeZone(sender);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = whatsAppSenderTimeZone(sender);
  }
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(result.startTime));
  return `Your appointment is booked for ${when}. ${closing}`;
}
