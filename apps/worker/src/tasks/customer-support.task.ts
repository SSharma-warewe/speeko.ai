import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { composeTaskInstructions } from '../builders/prompt-builder.js';
import { withToolRecording } from '../tools/tool-events.js';
import { formatContextForInstructions } from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type CustomerSupportResult = {
  outcome: 'RESOLVED' | 'ESCALATED' | 'FOLLOW_UP' | 'UNRESOLVED';
  issueSummary?: string;
  notes?: string;
};

export const createCustomerSupportTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const task = voice.AgentTask.create<CustomerSupportResult>({
    instructions: composeTaskInstructions(
      meta,
      [
        'Your objective is to help the customer with a support issue on this call.',
        'Listen carefully, diagnose the issue, use tools when needed, and aim for resolution.',
        'Escalate via transfer when appropriate. When done, call complete_support_task.',
        'After complete_support_task succeeds, the system hangs up automatically — do not also call end_call.',
        'If they say goodbye or ask to hang up before the issue is closed, call end_call.',
        `Runtime context: ${formatContextForInstructions(meta.context)}`,
      ].join(' '),
    ),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_support_task',
        description: 'Mark the support workflow complete.',
        parameters: z.object({
          outcome: z.enum(['RESOLVED', 'ESCALATED', 'FOLLOW_UP', 'UNRESOLVED']),
          issueSummary: nullishString,
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_support_task', args, async () => {
            const result: CustomerSupportResult = {
              outcome: args.outcome,
              issueSummary: args.issueSummary ?? undefined,
              notes: args.notes ?? undefined,
            };
            markTaskFinished(userData, 'customer_support', result);
            task.complete(result);
            return {
              ok: true,
              ...result,
              message: `Support task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
