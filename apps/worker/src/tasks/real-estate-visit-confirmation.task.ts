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

export type RealEstateVisitConfirmationResult = {
  outcome: 'CONFIRMED' | 'NOT_COMING' | 'CALLBACK';
  confirmedName?: string;
  location?: string;
  time?: string;
  notes?: string;
};

export function visitLocationFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'location',
    'area',
    'city',
    'locality',
    'propertyLocation',
    'address',
  );
}

export function visitTimeFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'time',
    'visitTime',
    'appointmentTime',
    'scheduledTime',
    'visitAt',
  );
}

export function visitNotesFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(context, 'notes');
}

/**
 * Workflow: confirm attendance for a pre-filled property site visit.
 * Do not invent location, time, or visit notes that are not in call context.
 */
export function buildRealEstateVisitConfirmationInstructions(
  meta: AgentJobMetadata,
): string {
  const name = displayNameFromContext(meta.context);
  const location = visitLocationFromContext(meta.context);
  const time = visitTimeFromContext(meta.context);
  const notes = visitNotesFromContext(meta.context);

  const visitLines: string[] = [];
  if (location) visitLines.push(`Location: ${location}.`);
  if (time) visitLines.push(`Visit time: ${time}.`);
  if (notes) visitLines.push(`Visit notes: ${notes}.`);
  if (!location && !time) {
    visitLines.push(
      'No location or visit time was provided in context. Say those details were not on this call and do not invent a property, address, or time.',
    );
  } else if (!location) {
    visitLines.push(
      'No location was provided in context. Do not invent a property or address.',
    );
  } else if (!time) {
    visitLines.push(
      'No visit time was provided in context. Do not invent a date or time.',
    );
  }

  return [
    'Your objective is an outbound real-estate visit confirmation call.',
    name
      ? `The expected contact name is ${name}. Confirm you are speaking with that person before presenting the visit.`
      : 'No expected name was provided. Ask once for their name, then use it going forward.',
    '',
    'PHASE 1 — IDENTITY (do this first):',
    name
      ? `- Confirm it is a good time, then verify identity: ask if you are speaking with ${name}.`
      : '- Confirm it is a good time, then ask once for their name.',
    '- If it is the wrong person, do not present the location or time. Complete with CALLBACK (offer a callback if they volunteer how to reach the right person) or NOT_COMING if they refuse.',
    '- If their answer is unclear (hello, noise, a clipped word), ask the identity question once more. Do not treat hello/noise as a yes or no. After one retry, if they still do not clearly refuse identity, assume they are the expected contact and continue.',
    `- ${HINDI_HAN_ASR_RULE}`,
    '',
    'PHASE 2 — PRESENT THE VISIT (only after identity is confirmed):',
    '- State this is about their scheduled property visit. Present the visit details in natural language, once:',
    ...visitLines.map((line) => `- ${line}`),
    '- Answer questions using ONLY these context details. Do not invent listings, parking, unit numbers, documents, amenities, or a different time.',
    '- If they ask for a detail that is not in context, say you do not have that detail on this call and offer a human follow-up.',
    '- Mention visit notes only when they were provided in context. Do not invent notes.',
    '',
    'PHASE 3 — ATTENDANCE:',
    '- After they have heard the visit details (and any questions), explicitly ask if they will be coming for this property visit.',
    '- Wait for a clear yes or no. Do not pressure. One short recap is fine if they are unsure.',
    '- Do not offer or book a new slot. If they volunteer a different time, capture it in notes and complete with NOT_COMING (they will not attend this visit) or CALLBACK if they asked to be called later to reschedule.',
    '',
    'COMPLETION:',
    '- When they have answered (or clearly will not), call complete_real_estate_visit_confirmation_task.',
    '- Use CONFIRMED only on a clear yes they will attend. NOT_COMING on a clear no / cannot make it. CALLBACK if they asked to be called later or it was not a good time.',
    '- notes is optional: capture extra comments (who is coming, why they cannot make it, a preferred new time). Do not invent notes.',
    '- After complete_real_estate_visit_confirmation_task succeeds, the system hangs up automatically — do not also call end_call.',
    '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome then hangup; else call end_call.',
    `Runtime context: ${formatContextForInstructions(meta.context)}`,
  ]
    .filter((line) => line !== null)
    .join(' ');
}

/**
 * CONFIRMED / NOT_COMING need a real yes/no. Filler audio is not an answer.
 */
export function realEstateVisitConfirmationCompleteBlocker(args: {
  outcome: RealEstateVisitConfirmationResult['outcome'];
  lastUserText?: string | null;
  hindiHanHomophone?: boolean;
}): string | null {
  const kind = classifyUserTurn(args.lastUserText, {
    hindiHanHomophone: args.hindiHanHomophone,
  });
  if (kind === 'empty' || kind === 'filler') {
    return 'The last thing they said was not a clear answer (hello / noise / clipped). Ask the current question again. Do not complete yet.';
  }
  if (args.outcome === 'CONFIRMED' && kind !== 'yes' && kind !== 'content') {
    return 'They have not clearly said they will come to the visit. Ask if they will be coming, then complete again.';
  }
  if (args.outcome === 'NOT_COMING' && kind !== 'no' && kind !== 'content') {
    return 'They have not clearly declined the visit. Ask if they will be coming, then complete again.';
  }
  return null;
}

export const createRealEstateVisitConfirmationTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const expectedName = displayNameFromContext(meta.context);
  const location = visitLocationFromContext(meta.context);
  const time = visitTimeFromContext(meta.context);

  const task = createWorkflowTask<RealEstateVisitConfirmationResult>(meta, {
    instructions: composeTaskInstructions(
      meta,
      buildRealEstateVisitConfirmationInstructions(meta),
    ),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_real_estate_visit_confirmation_task',
        description:
          'Mark the property-visit confirmation complete. Use CONFIRMED only on a clear yes they will attend, NOT_COMING on a clear no, CALLBACK if they asked to be called later.',
        parameters: z.object({
          outcome: z.enum(['CONFIRMED', 'NOT_COMING', 'CALLBACK']),
          confirmedName: nullishString.describe(
            'Name the callee confirmed (or gave) during identity check',
          ),
          location: nullishString.describe(
            'Location / property presented on this call',
          ),
          time: nullishString.describe('Visit time presented on this call'),
          notes: nullishString.describe(
            'Optional extra comments from the callee (who is coming, why they cannot make it, a preferred new time)',
          ),
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_real_estate_visit_confirmation_task',
            args,
            async () => {
              const blocked = realEstateVisitConfirmationCompleteBlocker({
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
              const result: RealEstateVisitConfirmationResult = {
                outcome: args.outcome,
                confirmedName: args.confirmedName ?? expectedName,
                location: args.location ?? location,
                time: args.time ?? time,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(
                userData,
                'real_estate_visit_confirmation',
                result,
              );
              await finishWorkflowTask(task, meta, result);
              return {
                ok: true,
                ...result,
                message: `Real estate visit confirmation task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as ReturnType<TaskFactory>;
};
