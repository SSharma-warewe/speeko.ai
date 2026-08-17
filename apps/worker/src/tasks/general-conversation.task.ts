import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { formatContextForInstructions } from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type GeneralConversationResult = {
  outcome: 'COMPLETED' | 'TRANSFERRED' | 'ABANDONED';
  summary?: string;
};

/**
 * Default task: open-ended conversation with optional structured wrap-up.
 * Opening speech is parent Agent onEnter (prompt hooks); persona is parent instructions.
 */
export const createGeneralConversationTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const task = voice.AgentTask.create<GeneralConversationResult>({
    instructions: [
      'Help the person with their request on this live voice call.',
      'Keep spoken replies concise. Use tools when appropriate.',
      'When the conversation has a clear end (resolved, transferred, or caller done), call complete_general_task.',
      'After complete_general_task succeeds, the system hangs up automatically — do not also call end_call.',
      'If they say goodbye, decline, or ask to stop before you can complete the workflow, call end_call.',
      `Runtime context: ${formatContextForInstructions(meta.context)}`,
    ].join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_general_task',
        description: 'Mark the general conversation workflow complete.',
        parameters: z.object({
          outcome: z.enum(['COMPLETED', 'TRANSFERRED', 'ABANDONED']),
          summary: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_general_task', args, async () => {
            const result: GeneralConversationResult = {
              outcome: args.outcome,
              summary: args.summary ?? undefined,
            };
            markTaskFinished(userData, 'general', result);
            task.complete(result);
            return {
              ok: true,
              outcome: args.outcome,
              message: `General task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
