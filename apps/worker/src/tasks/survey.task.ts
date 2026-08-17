import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { formatContextForInstructions } from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type SurveyResult = {
  outcome: 'COMPLETED' | 'PARTIAL' | 'DECLINED' | 'NO_ANSWER';
  answers?: Record<string, string>;
  notes?: string;
};

export const createSurveyTask: TaskFactory = ({ meta, userData, tools, chatCtx }) => {
  const task = voice.AgentTask.create<SurveyResult>({
    instructions: [
      'Your objective is to run a short phone survey.',
      'Explain purpose briefly, get consent, ask one question at a time, and keep it short.',
      'If they decline, record DECLINED. When finished, call complete_survey_task.',
      'After complete_survey_task succeeds, the system hangs up automatically — do not also call end_call.',
      'If they say goodbye or refuse mid-survey, prefer complete_survey_task with DECLINED/PARTIAL, else call end_call.',
      `Runtime context (may include survey questions): ${formatContextForInstructions(meta.context)}`,
    ].join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_survey_task',
        description: 'Mark the survey workflow complete with answers.',
        parameters: z.object({
          outcome: z.enum(['COMPLETED', 'PARTIAL', 'DECLINED', 'NO_ANSWER']),
          answers: z
            .record(z.string())
            .nullish()
            .describe('Map of question id/label to answer text'),
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_survey_task', args, async () => {
            const result: SurveyResult = {
              outcome: args.outcome,
              answers: args.answers ?? undefined,
              notes: args.notes ?? undefined,
            };
            markTaskFinished(userData, 'survey', result);
            task.complete(result);
            return {
              ok: true,
              ...result,
              message: `Survey task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
