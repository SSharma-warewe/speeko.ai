import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { formatContextForInstructions } from './context-format.js';
import type { TaskFactory } from './types.js';

export type LeadQualificationResult = {
  outcome: 'QUALIFIED' | 'NOT_QUALIFIED' | 'CALLBACK' | 'DECLINED';
  interestLevel?: 'high' | 'medium' | 'low' | 'none';
  notes?: string;
  nextStep?: string;
};

export const createLeadQualificationTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const task = voice.AgentTask.create<LeadQualificationResult>({
    instructions: [
      'Your objective is to qualify this lead on an outbound call.',
      'Introduce the purpose briefly, confirm interest, and ask discovery questions relevant to the product or service.',
      'Determine fit (budget, authority, need, timeline) without being pushy.',
      'When qualification is complete, call complete_lead_task with the structured result.',
      'After complete_lead_task succeeds, the system hangs up automatically — do not also call end_call.',
      'If they say goodbye, decline, or ask to stop early, call end_call (prefer completing with DECLINED first when possible).',
      `Runtime context: ${formatContextForInstructions(meta.context)}`,
    ].join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_lead_task',
        description: 'Mark lead qualification complete with a structured outcome.',
        parameters: z.object({
          outcome: z.enum(['QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK', 'DECLINED']),
          interestLevel: z.enum(['high', 'medium', 'low', 'none']).optional(),
          notes: z.string().optional(),
          nextStep: z.string().optional(),
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_lead_task', args, async () => {
            const result: LeadQualificationResult = { ...args };
            userData.taskResult = { task: 'lead_qualification', ...result };
            task.complete(result);
            return {
              ok: true,
              ...result,
              message: `Lead task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
