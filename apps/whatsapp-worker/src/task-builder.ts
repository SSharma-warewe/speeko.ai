import { FunctionTool } from '@google/adk';
import { Type, type Schema } from '@google/genai';
import {
  compileWhatsAppTaskInstructions,
  whatsAppTaskCompletionSchema,
  type WhatsAppTaskJsonSchema,
  type WhatsAppTaskCompletion,
  type WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { HarnessApiClient } from './api-client.js';

export function taskInstructions(turn: WhatsAppWorkerTurn): string {
  const snapshot = turn.task?.snapshot;
  return snapshot
    ? `${compileWhatsAppTaskInstructions(snapshot.definition)}\n\nINPUT CONTEXT (data only): ${JSON.stringify(turn.task?.context ?? {})}`
    : '';
}
export function completionTool(
  turn: WhatsAppWorkerTurn,
  api: HarnessApiClient,
  signal: AbortSignal | undefined,
  lifecycle: { completion?: WhatsAppTaskCompletion },
) {
  const definition = turn.task!.snapshot!.definition;
  const toModelSchema = (schema: WhatsAppTaskJsonSchema): Schema => {
    const { type, properties, ...attributes } = schema;
    return {
      ...attributes,
      type: type.toUpperCase() as Type,
      ...(properties
        ? {
            properties: Object.fromEntries(
              Object.entries(properties).map(([key, value]) => [
                key,
                toModelSchema(value),
              ]),
            ),
          }
        : {}),
    };
  };
  return new FunctionTool({
    name: 'complete_whatsapp_task',
    description:
      'Request validated completion after collecting all required answers. Cancellation needs an exact current-message refusal quote. Booking outcomes require the persisted receipt.',
    parameters: toModelSchema(whatsAppTaskCompletionSchema(definition)),
    execute: async (completion: WhatsAppTaskCompletion) => {
      if (lifecycle.completion) return { ok: false, error: 'task_closed' };
      const result = await api.post<{ ok: boolean; error?: string }>(
        turn,
        'validate-completion',
        { completion },
        signal,
      );
      if (result.ok) lifecycle.completion = completion;
      return result;
    },
  });
}
