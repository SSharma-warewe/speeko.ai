import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { composeTaskInstructions } from '../builders/prompt-builder.js';
import type { AgentJobMetadata } from '../job-metadata.js';
import { withToolRecording } from '../tools/tool-events.js';
import {
  contextField,
  displayNameFromContext,
  formatContextForInstructions,
} from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

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
    '- Ask if they need any other help. Capture a short note. Do not invent products, waivers, or tools that are not enabled on this call.',
    '',
    'COMPLETION:',
    '- When you have their payment answer (and delay/help if they answered), call complete_loan_collection_task.',
    '- Fill promisedPayDate on PROMISED. Fill delayReason and helpRequested when they answered those questions.',
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

  const task = voice.AgentTask.create<LoanCollectionResult>({
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
              const result: LoanCollectionResult = {
                outcome: args.outcome,
                confirmedName: args.confirmedName ?? expectedName,
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
              task.complete(result);
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

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
