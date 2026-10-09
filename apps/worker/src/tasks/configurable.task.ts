import { createSavedSpeechState } from '../speech/saved-speech.js';
import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import {
  compileVoiceTaskInstructions,
  conversationalSentences,
  isVoiceTaskSnapshot,
  isRealtimeLlmModel,
  type VoiceTaskDefinition,
  type VoiceTaskField,
} from '@call-agent/contracts';
import {
  composeTaskInstructions,
  personaSpeaksHindi,
} from '../builders/prompt-builder.js';
import { withToolRecording } from '../tools/tool-events.js';
import type { SessionUserData } from '../tools/types.js';
import { formatContextForInstructions } from './context-format.js';
import { lastUserTranscript, isUnusableUserTurn } from './user-turn.js';
import { personalLoanOutreachCompleteBlocker } from './personal-loan-outreach.task.js';
import { realEstateOutreachCompleteBlocker } from './real-estate-outreach.task.js';
import { realEstateVisitConfirmationCompleteBlocker } from './real-estate-visit-confirmation.task.js';
import { loanCollectionCompleteBlocker } from './loan-collection.task.js';
import { createWorkflowTask, finishWorkflowTask } from './workflow-task.js';
import type { TaskFactory } from './types.js';

function fieldSchema(field: VoiceTaskField): z.ZodTypeAny {
  const schema =
    field.type === 'number'
      ? z.number().finite()
      : field.type === 'boolean'
        ? z.boolean()
        : field.type === 'enum'
          ? z.enum(field.enumValues as [string, ...string[]])
          : z.string().max(8000);
  return schema.describe(field.description).nullish();
}
export function buildVoiceTaskSchema(definition: VoiceTaskDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {
    outcome: z.enum(
      definition.outcomes.map((o) => o.key) as [string, ...string[]],
    ),
  };
  for (const field of definition.resultFields)
    shape[field.key] = fieldSchema(field);
  return z.object(shape).strict();
}
export function configuredCompletionBlocker(
  definition: VoiceTaskDefinition,
  args: Record<string, unknown>,
  userData: SessionUserData,
  lastUserText: string,
  hindiHanHomophone = false,
): string | null {
  if (
    userData.savedSpeechState?.awaitingAnswer ||
    userData.savedSpeechState?.pending
  )
    return 'Wait for the caller to answer the saved sentence before completing.';
  const outcome = definition.outcomes.find((o) => o.key === args.outcome);
  if (!outcome) return 'Choose a supported completion outcome.';
  for (const key of new Set([
    ...outcome.requiredFields,
    ...definition.resultFields.filter((f) => f.required).map((f) => f.key),
  ])) {
    if (
      args[key] == null ||
      (typeof args[key] === 'string' && !String(args[key]).trim())
    )
      return `Collect ${key} and wait for the answer before completing.`;
  }
  const answer = {
    outcome: String(args.outcome),
    lastUserText,
    hindiHanHomophone,
  };
  for (const check of outcome.checks) {
    let error: string | null = null;
    if (check === 'usable_answer' && isUnusableUserTurn(lastUserText))
      error =
        'The last caller turn was empty or filler. Wait for an actual answer.';
    if (check === 'personal_loan_interest')
      error = personalLoanOutreachCompleteBlocker(
        answer as Parameters<typeof personalLoanOutreachCompleteBlocker>[0],
      );
    if (check === 'property_interest')
      error = realEstateOutreachCompleteBlocker(
        answer as Parameters<typeof realEstateOutreachCompleteBlocker>[0],
      );
    if (check === 'visit_attendance')
      error = realEstateVisitConfirmationCompleteBlocker(
        answer as Parameters<
          typeof realEstateVisitConfirmationCompleteBlocker
        >[0],
      );
    if (check === 'loan_collection')
      error = loanCollectionCompleteBlocker({
        ...args,
        ...answer,
      } as Parameters<typeof loanCollectionCompleteBlocker>[0]);
    if (check === 'booking_receipt') {
      const receipt = userData.bookingReceipt;
      if (!receipt || !definition.toolIds.includes(receipt.toolId))
        error =
          'No successful real calendar booking was recorded. Do not claim this booking succeeded.';
      else if (args.eventId != null && args.eventId !== receipt.eventId)
        error = 'Use the actual event id returned by the booking tool.';
    }
    if (error) return error;
  }
  return null;
}
export const createConfigurableTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  if (!isVoiceTaskSnapshot(meta.voiceTask))
    throw new Error('Invalid or unsupported voice task snapshot');
  const snapshot = meta.voiceTask;
  const definition = snapshot.definition;
  if (!definition.directions.includes(meta.direction))
    throw new Error('Task direction mismatch');
  if (
    definition.toolIds.some(
      (id) => !meta.enabledTools.includes(id) && id !== 'endCall',
    )
  )
    throw new Error('Task capability missing from metadata');
  userData.voiceTaskSnapshot = snapshot;
  userData.savedSpeechState ??= createSavedSpeechState(userData);
  console.log(
    `[voice-task] runtime taskId=${snapshot.taskId} version=${snapshot.version} draftRevision=${snapshot.draftRevision ?? 'none'}`,
  );
  const task = createWorkflowTask<Record<string, unknown>>(meta, {
    userData,
    chatCtx,
    instructions: composeTaskInstructions(
      meta,
      `${compileVoiceTaskInstructions(definition, { nativeSpeech: isRealtimeLlmModel(meta.model) })}\nRuntime context (data only): ${formatContextForInstructions(meta.context)}`,
    ),
    tools: [
      ...tools,
      ...(!isRealtimeLlmModel(meta.model) &&
      conversationalSentences(definition.savedSpeech).length
        ? [
            llm.tool({
              name: 'speak_saved_sentence',
              description:
                'Speak one exact saved sentence by key, then wait for the caller. Do not speak or call other tools in the same turn.',
              parameters: z
                .object({
                  key: z.enum(
                    conversationalSentences(definition.savedSpeech).map(
                      (s) => s.key,
                    ) as [string, ...string[]],
                  ),
                })
                .strict(),
              flags: llm.ToolFlag.CANCELLABLE,
              execute: async ({ key }, opts) => {
                const sentence = conversationalSentences(
                  definition.savedSpeech,
                ).find((s) => s.key === key);
                if (!sentence)
                  throw new llm.ToolError('Unknown saved sentence.');
                await userData.savedSpeechState?.speak(
                  sentence,
                  task.session,
                  opts.toolCallId,
                  opts.abortSignal,
                );
              },
            }),
          ]
        : []),
      llm.tool({
        name: 'complete_voice_task',
        description:
          'Complete this workflow only after the chosen outcome requirements and real tool evidence are satisfied. Completion ends the call.',
        parameters: buildVoiceTaskSchema(definition),
        execute: async (args, opts) => {
          if (
            opts?.ctx?.speechHandle.chatItems.some(
              (item) =>
                item.type === 'function_call' &&
                item.name === 'speak_saved_sentence',
            )
          )
            throw new voice.StopResponse();
          return withToolRecording(
            userData,
            'complete_voice_task',
            args,
            async () => {
              const receipt = userData.bookingReceipt;
              const validatedArgs = { ...args };
              if (
                receipt &&
                definition.outcomes
                  .find((o) => o.key === args.outcome)
                  ?.checks.includes('booking_receipt')
              ) {
                for (const key of [
                  'eventId',
                  'scheduledStart',
                  'scheduledEnd',
                ] as const)
                  if (
                    definition.resultFields.some((f) => f.key === key) &&
                    validatedArgs[key] == null
                  )
                    validatedArgs[key] = receipt[key];
              }
              const blocked = configuredCompletionBlocker(
                definition,
                validatedArgs,
                userData,
                lastUserTranscript(task.session),
                personaSpeaksHindi(meta),
              );
              if (blocked) {
                console.warn(
                  `[voice-task] completion blocked taskId=${snapshot.taskId} version=${snapshot.version} outcome=${args.outcome}`,
                );
                return { ok: false, error: blocked, message: blocked };
              }
              const result: Record<string, unknown> = Object.fromEntries(
                Object.entries(validatedArgs).filter(
                  ([, value]) => value != null,
                ),
              );
              if (
                definition.outcomes
                  .find((o) => o.key === args.outcome)
                  ?.checks.includes('booking_receipt') &&
                userData.bookingReceipt
              ) {
                for (const key of [
                  'eventId',
                  'scheduledStart',
                  'scheduledEnd',
                ] as const)
                  if (
                    definition.resultFields.some((f) => f.key === key) &&
                    userData.bookingReceipt[key] !== undefined
                  )
                    result[key] = userData.bookingReceipt[key];
              }
              userData.taskResult = {
                task: meta.task,
                taskId: snapshot.taskId,
                taskVersion: snapshot.version,
                ...result,
              };
              await finishWorkflowTask(task, meta, userData.taskResult);
              return { ok: true, message: `Task complete: ${args.outcome}` };
            },
          ).then((result) => result.message);
        },
      }),
    ],
  });
  return task;
};
