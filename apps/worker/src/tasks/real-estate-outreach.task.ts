import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  composeTaskInstructions,
  personaSpeaksHindi,
} from '../builders/prompt-builder.js';
import {
  createWorkflowTask,
  finishWorkflowTask,
} from '../builders/workflow-task.js';
import type { AgentJobMetadata } from '../job-metadata.js';
import { withToolRecording } from '../tools/tool-events.js';
import {
  contextField,
  displayNameFromContext,
  formatContextForInstructions,
} from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';
import {
  HINDI_HAN_ASR_RULE,
  classifyUserTurn,
  lastUserTranscript,
} from './user-turn.js';

export type RealEstateOutreachResult = {
  outcome: 'INTERESTED' | 'NOT_INTERESTED' | 'CALLBACK';
  confirmedName?: string;
  email?: string;
  location?: string;
  budget?: string;
  notes?: string;
};

export function locationFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'location',
    'area',
    'city',
    'locality',
    'preferredLocation',
  );
}

export function budgetFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'budget',
    'maxBudget',
    'budgetMax',
    'priceRange',
  );
}

/**
 * Workflow: present a pre-filled property inquiry, then record interest.
 * Do not invent listings or prices that are not in call context.
 */
export function buildRealEstateOutreachInstructions(
  meta: AgentJobMetadata,
): string {
  const name = displayNameFromContext(meta.context);
  const email = contextField(meta.context, 'email');
  const location = locationFromContext(meta.context);
  const budget = budgetFromContext(meta.context);

  const inquiryLines: string[] = [];
  if (location) inquiryLines.push(`Location: ${location}.`);
  if (budget) inquiryLines.push(`Budget: ${budget}.`);
  if (inquiryLines.length === 0) {
    inquiryLines.push(
      'No location or budget was provided in context. Say those details were not on this call and do not invent a property, area, or price.',
    );
  }

  return [
    'Your objective is an outbound real-estate outreach call.',
    name
      ? `The expected contact name is ${name}. Confirm you are speaking with that person before presenting the inquiry.`
      : 'No expected name was provided. Ask once for their name, then use it going forward.',
    email
      ? `They provided email ${email} — you may confirm it if they ask; do not read it unprompted.`
      : null,
    '',
    'PHASE 1 — IDENTITY (do this first):',
    name
      ? `- Confirm it is a good time, then verify identity: ask if you are speaking with ${name}.`
      : '- Confirm it is a good time, then ask once for their name.',
    '- If it is the wrong person, do not present the location or budget. Complete with CALLBACK (offer a callback if they volunteer how to reach the right person) or NOT_INTERESTED if they refuse.',
    '- If their answer is unclear (hello, noise, a clipped word), ask the identity question once more. Do not treat hello/noise as a yes or no. After one retry, if they still do not clearly refuse identity, assume they are the expected contact and continue.',
    `- ${HINDI_HAN_ASR_RULE}`,
    '',
    'PHASE 2 — PRESENT THE INQUIRY (only after identity is confirmed):',
    '- State this is about a real-estate opportunity. Present the inquiry details in natural language, once:',
    ...inquiryLines.map((line) => `- ${line}`),
    '- Answer questions using ONLY these context details. Do not invent listings, prices, amenities, availability, site visits, or legal conditions.',
    '- If they ask for a detail that is not in context, say you do not have that detail on this call and offer a human follow-up.',
    '',
    'PHASE 3 — INTEREST:',
    '- After they have heard the inquiry (and any questions), explicitly ask if they are interested in this property opportunity.',
    '- Wait for a clear yes or no. Do not pressure. One short recap is fine if they are unsure.',
    '',
    'COMPLETION:',
    '- When they have answered (or clearly will not), call complete_real_estate_outreach_task.',
    '- Use INTERESTED only on a clear yes. NOT_INTERESTED on a clear no / not interested. CALLBACK if they asked to be called later or it was not a good time.',
    '- After complete_real_estate_outreach_task succeeds, the system hangs up automatically — do not also call end_call.',
    '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome then hangup; else call end_call.',
    `Runtime context: ${formatContextForInstructions(meta.context)}`,
  ]
    .filter((line) => line !== null)
    .join(' ');
}

/**
 * INTERESTED / NOT_INTERESTED need a real yes/no. Filler audio is not an answer.
 */
export function realEstateOutreachCompleteBlocker(args: {
  outcome: RealEstateOutreachResult['outcome'];
  lastUserText?: string | null;
  hindiHanHomophone?: boolean;
}): string | null {
  const kind = classifyUserTurn(args.lastUserText, {
    hindiHanHomophone: args.hindiHanHomophone,
  });
  if (kind === 'empty' || kind === 'filler') {
    return 'The last thing they said was not a clear answer (hello / noise / clipped). Ask the current question again. Do not complete yet.';
  }
  if (args.outcome === 'INTERESTED' && kind !== 'yes' && kind !== 'content') {
    return 'They have not clearly said yes to the property. Ask if they are interested, then complete again.';
  }
  if (args.outcome === 'NOT_INTERESTED' && kind !== 'no' && kind !== 'content') {
    return 'They have not clearly declined. Ask if they are interested, then complete again.';
  }
  return null;
}

export const createRealEstateOutreachTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const email = contextField(meta.context, 'email');
  const expectedName = displayNameFromContext(meta.context);
  const location = locationFromContext(meta.context);
  const budget = budgetFromContext(meta.context);

  const task = createWorkflowTask<RealEstateOutreachResult>(meta, {
    instructions: composeTaskInstructions(
      meta,
      buildRealEstateOutreachInstructions(meta),
    ),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_real_estate_outreach_task',
        description:
          'Mark the real-estate outreach complete. Use INTERESTED only on a clear yes, NOT_INTERESTED on a clear no, CALLBACK if they asked to be called later.',
        parameters: z.object({
          outcome: z.enum(['INTERESTED', 'NOT_INTERESTED', 'CALLBACK']),
          confirmedName: nullishString.describe(
            'Name the callee confirmed (or gave) during identity check',
          ),
          email: nullishString,
          location: nullishString.describe(
            'Location / area presented on this call',
          ),
          budget: nullishString.describe('Budget presented on this call'),
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_real_estate_outreach_task',
            args,
            async () => {
              const blocked = realEstateOutreachCompleteBlocker({
                ...args,
                lastUserText: lastUserTranscript(task.session),
                hindiHanHomophone: personaSpeaksHindi(meta),
              });
              if (blocked) {
                return {
                  ok: false,
                  error: blocked,
                  message: blocked,
                };
              }
              const result: RealEstateOutreachResult = {
                outcome: args.outcome,
                confirmedName: args.confirmedName ?? expectedName,
                email: args.email ?? email,
                location: args.location ?? location,
                budget: args.budget ?? budget,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(userData, 'real_estate_outreach', result);
              await finishWorkflowTask(task, meta, result);
              return {
                ok: true,
                ...result,
                message: `Real estate outreach task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as ReturnType<TaskFactory>;
};
