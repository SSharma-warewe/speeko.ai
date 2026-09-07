import { llm } from '@livekit/agents';
import { z } from 'zod';
import { composeTaskInstructions } from '../builders/prompt-builder.js';
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
import { personaSpeaksHindi } from '../builders/prompt-builder.js';
import {
  HINDI_HAN_ASR_RULE,
  classifyUserTurn,
  isShortEnglishNo,
  lastUserTranscript,
} from './user-turn.js';

export type LoanCollectionResult = {
  outcome: 'PROMISED' | 'REFUSED' | 'ALREADY_PAID' | 'CALLBACK' | 'WRONG_PERSON';
  confirmedName?: string;
  email?: string;
  dueType?: string;
  dueDate?: string;
  loanAmount?: string;
  promisedPayDate?: string;
  delayReason?: string;
  helpRequested?: string;
  notes?: string;
};

export function dueTypeFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'dueType',
    'emiOrLoan',
    'type',
    'productType',
    'loanType',
  );
}

export function dueDateFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'dueDate',
    'duePaymentDate',
    'due_date',
    'paymentDate',
  );
}

export function collectionLoanAmountFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(
    context,
    'loanAmount',
    'loan_amount',
    'amount',
    'emiAmount',
  );
}

function filledField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** WRONG_PERSON must not inherit the expected contact name from context. */
export function confirmedNameForOutcome(
  outcome: LoanCollectionResult['outcome'],
  confirmedName: string | null | undefined,
  expectedName: string | undefined,
): string | undefined {
  if (outcome === 'WRONG_PERSON') {
    return filledField(confirmedName) ? confirmedName!.trim() : undefined;
  }
  return confirmedName ?? expectedName;
}

/**
 * PROMISED must include a pay date and a delay reason so the model cannot
 * complete after “today” without asking why it was late.
 * WRONG_PERSON / ALREADY_PAID (and any outcome on filler audio) need a real
 * last user turn — “Hello.” / empty is not evidence.
 */
export function loanCollectionCompleteBlocker(args: {
  outcome: LoanCollectionResult['outcome'];
  promisedPayDate?: string | null;
  delayReason?: string | null;
  helpRequested?: string | null;
  lastUserText?: string | null;
  notes?: string | null;
  hindiHanHomophone?: boolean;
}): string | null {
  const kind = classifyUserTurn(args.lastUserText, {
    hindiHanHomophone: args.hindiHanHomophone,
  });
  if (kind === 'empty' || kind === 'filler') {
    return 'The last thing they said was not a clear answer (hello / noise / clipped). Ask the current question again. Do not complete yet.';
  }
  if (args.outcome === 'WRONG_PERSON' && kind !== 'wrong_person') {
    if (args.hindiHanHomophone && isShortEnglishNo(args.lastUserText)) {
      return 'Short "No"/"Nope" is usually Hindi han/haan (yes), not English no. They confirmed identity. Continue the workflow. Do not complete WRONG_PERSON.';
    }
    if (
      kind === 'content' &&
      typeof args.notes === 'string' &&
      /wrong person|गलत व्यक्ति|गलत नंबर/i.test(args.notes)
    ) {
      return null;
    }
    return 'Identity is not clearly the wrong person. Ask if you are speaking with the expected name once more. Do not complete WRONG_PERSON on unclear audio.';
  }
  if (args.outcome === 'ALREADY_PAID' && kind !== 'already_paid') {
    return 'They have not clearly said this installment is already paid. Ask when they will pay (or confirm paid), then complete again.';
  }
  if (args.outcome !== 'PROMISED') {
    return null;
  }
  if (!filledField(args.promisedPayDate)) {
    return 'Ask when they will pay and get a date, then call complete_loan_collection_task again with promisedPayDate.';
  }
  if (!filledField(args.delayReason)) {
    return 'Ask why the payment was delayed, then call complete_loan_collection_task again with delayReason (use "none" if they declined to say).';
  }
  if (!filledField(args.helpRequested)) {
    return 'Ask if they need any other help, wait for the answer, then call complete_loan_collection_task again with helpRequested (use "none" if they said no). Do not hang up before they answer.';
  }
  return null;
}

/** Spoken label: EMI vs loan payment. Unknown values are used as-is. */
export function spokenDueLabel(dueType: string | undefined): string {
  if (!dueType) return 'payment';
  const t = dueType.trim().toLowerCase();
  if (t === 'emi' || t.includes('emi')) return 'EMI';
  if (t === 'loan' || t.includes('loan')) return 'loan payment';
  return dueType.trim();
}

/**
 * Workflow: confirm identity, state the due EMI/loan, explain CIBIL impact,
 * then record when they will pay, why delayed, and any other help.
 * Do not invent amounts, dates, fees, or score numbers that are not in context.
 */
export function buildLoanCollectionInstructions(
  meta: AgentJobMetadata,
): string {
  const name = displayNameFromContext(meta.context);
  const email = contextField(meta.context, 'email');
  const dueType = dueTypeFromContext(meta.context);
  const dueDate = dueDateFromContext(meta.context);
  const loanAmount = collectionLoanAmountFromContext(meta.context);
  const dueLabel = spokenDueLabel(dueType);

  const dueLines: string[] = [];
  if (dueType) dueLines.push(`Due type: ${dueType} (speak as ${dueLabel}).`);
  if (loanAmount) dueLines.push(`Amount: ${loanAmount}.`);
  if (dueDate) dueLines.push(`Due payment date: ${dueDate}.`);
  if (dueLines.length === 0) {
    dueLines.push(
      'No due type, amount, or due date was provided in context. Say those details were not on this call and do not invent numbers or dates.',
    );
  }

  return [
    'Your objective is an outbound EMI / loan collection call.',
    name
      ? `The expected contact name is ${name}. Confirm you are speaking with that person before discussing the due payment.`
      : 'No expected name was provided. Ask once for their name, then use it going forward.',
    email
      ? `They provided email ${email} — you may confirm it if they ask; do not read it unprompted.`
      : null,
    '',
    'PHASE 1 — IDENTITY (do this first):',
    name
      ? `- Confirm it is a good time, then verify identity: ask if you are speaking with ${name}.`
      : '- Confirm it is a good time, then ask once for their name.',
    '- If it is the wrong person, do not discuss the debt, amount, or CIBIL. Complete with WRONG_PERSON, or CALLBACK if they volunteer how to reach the right person.',
    '- If their answer is unclear (hello, noise, a clipped word), ask the identity question once more. Do not complete WRONG_PERSON on unclear audio. After one retry, if they still do not clearly say it is the wrong person, assume they are the expected contact and continue.',
    `- ${HINDI_HAN_ASR_RULE}`,
    '',
    'PHASE 2 — DUE NOTICE (only after identity is confirmed):',
    `- State that their ${dueLabel} is due. Present the details in natural language, once:`,
    ...dueLines.map((line) => `- ${line}`),
    '- Then explain, in plain language, that late payment can lower their CIBIL score and make future loans harder to get. Keep this educational, not threatening.',
    '- Do not invent a numeric CIBIL drop, legal action, fees, penalties, or extra terms. If they ask for a figure that is not in context, say you do not have that detail on this call.',
    '',
    'PHASE 3 — WHEN THEY WILL PAY:',
    '- Ask when they will make this payment. Wait for a date, a clear refusal, or that they already paid.',
    '- Use PROMISED only when they give a pay date (or a clear commitment such as today / this week). REFUSED if they will not pay. ALREADY_PAID if they say this installment is already paid.',
    '',
    'PHASE 4 — REASON FOR DELAY:',
    '- Ask what the reason for the delay was. Skip this if they already paid or there is no delay.',
    '',
    'PHASE 5 — OTHER HELP:',
    '- After they answered when they will pay and why it was delayed, ask if they need any other help.',
    '- Wait for that answer. Do not call complete_loan_collection_task in the same turn as this question.',
    '- Capture a short note. Do not invent products, waivers, or tools that are not enabled on this call.',
    '',
    'COMPLETION:',
    '- On PROMISED, call complete_loan_collection_task only after promisedPayDate, delayReason, AND helpRequested are filled.',
    '- Fill helpRequested with a short note, or "none" if they said no. The system hangs up after complete — if you skip help, they will hear the help question and then get cut off.',
    '- Fill promisedPayDate on PROMISED. Fill delayReason when they answered why it was late.',
    '- Use CALLBACK if they asked to be called later or it was not a good time. Use WRONG_PERSON if identity failed.',
    '- After complete_loan_collection_task succeeds, the system hangs up automatically — do not also call end_call.',
    '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome then hangup; else call end_call.',
    `Runtime context: ${formatContextForInstructions(meta.context)}`,
  ]
    .filter((line) => line !== null)
    .join(' ');
}

export const createLoanCollectionTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const email = contextField(meta.context, 'email');
  const expectedName = displayNameFromContext(meta.context);
  const dueType = dueTypeFromContext(meta.context);
  const dueDate = dueDateFromContext(meta.context);
  const loanAmount = collectionLoanAmountFromContext(meta.context);

  const task = createWorkflowTask<LoanCollectionResult>(meta, {
    instructions: composeTaskInstructions(
      meta,
      buildLoanCollectionInstructions(meta),
    ),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_loan_collection_task',
        description:
          'Mark the loan collection complete. Use PROMISED when they said when they will pay, REFUSED if they will not, ALREADY_PAID if this installment is paid, CALLBACK if they asked to be called later, WRONG_PERSON if identity failed.',
        parameters: z.object({
          outcome: z.enum([
            'PROMISED',
            'REFUSED',
            'ALREADY_PAID',
            'CALLBACK',
            'WRONG_PERSON',
          ]),
          confirmedName: nullishString.describe(
            'Name the callee confirmed (or gave) during identity check',
          ),
          email: nullishString,
          dueType: nullishString.describe('EMI or loan as presented on this call'),
          dueDate: nullishString.describe('Due payment date presented on this call'),
          loanAmount: nullishString.describe('Amount presented on this call'),
          promisedPayDate: nullishString.describe(
            'When they said they will pay (required for PROMISED)',
          ),
          delayReason: nullishString.describe('Why the payment was delayed'),
          helpRequested: nullishString.describe(
            'Other help they asked for, if any',
          ),
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_loan_collection_task',
            args,
            async () => {
              const blocked = loanCollectionCompleteBlocker({
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
              const result: LoanCollectionResult = {
                outcome: args.outcome,
                confirmedName: confirmedNameForOutcome(
                  args.outcome,
                  args.confirmedName,
                  expectedName,
                ),
                email: args.email ?? email,
                dueType: args.dueType ?? dueType,
                dueDate: args.dueDate ?? dueDate,
                loanAmount: args.loanAmount ?? loanAmount,
                promisedPayDate: args.promisedPayDate ?? undefined,
                delayReason: args.delayReason ?? undefined,
                helpRequested: args.helpRequested ?? undefined,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(userData, 'loan_collection', result);
              await finishWorkflowTask(task, meta, result);
              return {
                ok: true,
                ...result,
                message: `Loan collection task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as ReturnType<TaskFactory>;
};
