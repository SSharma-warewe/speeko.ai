import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { contextField, formatContextForInstructions } from './context-format.js';
import type { TaskFactory } from './types.js';

export type DebtCollectionResult = {
  outcome:
    | 'PROMISE_TO_PAY'
    | 'PAID'
    | 'DISPUTE'
    | 'CALLBACK'
    | 'REFUSED'
    | 'NO_ANSWER';
  amountDiscussed?: string;
  promisedDate?: string;
  notes?: string;
};

export const createDebtCollectionTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const amount = contextField(meta.context, 'amount', 'balance', 'amountDue');
  const accountRef = contextField(meta.context, 'accountId', 'account_id', 'invoiceId');

  const task = voice.AgentTask.create<DebtCollectionResult>({
    instructions: [
      'Your objective is a compliant debt-collection / payment-reminder call.',
      'Be professional, calm, and non-threatening. Follow applicable collection rules.',
      amount ? `Outstanding amount in context: ${amount}.` : null,
      accountRef ? `Account/invoice reference: ${accountRef}.` : null,
      'Verify you are speaking with the right person before discussing balance details.',
      'Offer payment options if available. When finished, call complete_collection_task.',
      'After complete_collection_task succeeds, the system hangs up automatically — do not also call end_call.',
      'If they refuse further contact or say goodbye early, call end_call (prefer completing with REFUSED first when possible).',
      `Runtime context: ${formatContextForInstructions(meta.context)}`,
    ]
      .filter(Boolean)
      .join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_collection_task',
        description: 'Mark the collection workflow complete.',
        parameters: z.object({
          outcome: z.enum([
            'PROMISE_TO_PAY',
            'PAID',
            'DISPUTE',
            'CALLBACK',
            'REFUSED',
            'NO_ANSWER',
          ]),
          amountDiscussed: z.string().optional(),
          promisedDate: z.string().optional(),
          notes: z.string().optional(),
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_collection_task', args, async () => {
            const result: DebtCollectionResult = { ...args };
            userData.taskResult = { task: 'debt_collection', ...result };
            task.complete(result);
            return {
              ok: true,
              ...result,
              message: `Collection task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
