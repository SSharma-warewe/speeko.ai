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

export type PersonalLoanOutreachResult = {
  outcome: 'INTERESTED' | 'NOT_INTERESTED' | 'CALLBACK';
  confirmedName?: string;
  email?: string;
  loanAmount?: string;
  interestRate?: string;
  time?: string;
  notes?: string;
};

export function loanAmountFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(context, 'loanAmount', 'loan_amount', 'amount');
}

export function interestRateFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(context, 'interestRate', 'interest_rate', 'rate');
}

export function loanTermFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  return contextField(context, 'time', 'term', 'loanTerm', 'tenure');
}

/**
 * Workflow: present a pre-filled personal-loan offer, then record interest.
 * Do not invent terms that are not in call context.
 */
export function buildPersonalLoanOutreachInstructions(
  meta: AgentJobMetadata,
): string {
  const name = displayNameFromContext(meta.context);
  const email = contextField(meta.context, 'email');
  const loanAmount = loanAmountFromContext(meta.context);
  const interestRate = interestRateFromContext(meta.context);
  const term = loanTermFromContext(meta.context);

  const offerLines: string[] = [];
  if (loanAmount) offerLines.push(`Loan amount: ${loanAmount}.`);
  if (interestRate) offerLines.push(`Interest rate: ${interestRate}.`);
  if (term) offerLines.push(`Term (time): ${term}.`);
  if (offerLines.length === 0) {
    offerLines.push(
      'No loan amount, interest rate, or term was provided in context. Say the offer details were not on this call and do not invent numbers.',
    );
  }

  return [
    'Your objective is an outbound personal-loan outreach call.',
    name
      ? `The expected contact name is ${name}. Confirm you are speaking with that person before presenting the offer.`
      : 'No expected name was provided. Ask once for their name, then use it going forward.',
    email
      ? `They provided email ${email} — you may confirm it if they ask; do not read it unprompted.`
      : null,
    '',
    'PHASE 1 — IDENTITY (do this first):',
    name
      ? `- Confirm it is a good time, then verify identity: ask if you are speaking with ${name}.`
      : '- Confirm it is a good time, then ask once for their name.',
    '- If it is the wrong person, do not present the loan. Complete with CALLBACK (offer a callback if they volunteer how to reach the right person) or NOT_INTERESTED if they refuse.',
    '',
    'PHASE 2 — PRESENT THE LOAN (only after identity is confirmed):',
    '- State this is about a personal loan offer. Present the terms in natural language, once:',
    ...offerLines.map((line) => `- ${line}`),
    '- Answer questions using ONLY these context terms. Do not invent fees, EMI, eligibility, credit checks, processing charges, or legal conditions.',
    '- If they ask for a term that is not in context, say you do not have that detail on this call and offer a human follow-up.',
    '',
    'PHASE 3 — INTEREST:',
    '- After they have heard the offer (and any questions), explicitly ask if they are interested in taking this loan.',
    '- Wait for a clear yes or no. Do not pressure. One short recap is fine if they are unsure.',
    '',
    'COMPLETION:',
    '- When they have answered (or clearly will not), call complete_personal_loan_outreach_task.',
    '- Use INTERESTED only on a clear yes. NOT_INTERESTED on a clear no / not interested. CALLBACK if they asked to be called later or it was not a good time.',
    '- After complete_personal_loan_outreach_task succeeds, the system hangs up automatically — do not also call end_call.',
    '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome then hangup; else call end_call.',
    `Runtime context: ${formatContextForInstructions(meta.context)}`,
  ]
    .filter((line) => line !== null)
    .join(' ');
}

export const createPersonalLoanOutreachTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const email = contextField(meta.context, 'email');
  const expectedName = displayNameFromContext(meta.context);
  const loanAmount = loanAmountFromContext(meta.context);
  const interestRate = interestRateFromContext(meta.context);
  const term = loanTermFromContext(meta.context);

  const task = createWorkflowTask<PersonalLoanOutreachResult>(meta, {
    instructions: composeTaskInstructions(
      meta,
      buildPersonalLoanOutreachInstructions(meta),
    ),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_personal_loan_outreach_task',
        description:
          'Mark the personal-loan outreach complete. Use INTERESTED only on a clear yes, NOT_INTERESTED on a clear no, CALLBACK if they asked to be called later.',
        parameters: z.object({
          outcome: z.enum(['INTERESTED', 'NOT_INTERESTED', 'CALLBACK']),
          confirmedName: nullishString.describe(
            'Name the callee confirmed (or gave) during identity check',
          ),
          email: nullishString,
          loanAmount: nullishString.describe('Loan amount presented on this call'),
          interestRate: nullishString.describe(
            'Interest rate presented on this call',
          ),
          time: nullishString.describe('Loan term / tenure presented on this call'),
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_personal_loan_outreach_task',
            args,
            async () => {
              const result: PersonalLoanOutreachResult = {
                outcome: args.outcome,
                confirmedName: args.confirmedName ?? expectedName,
                email: args.email ?? email,
                loanAmount: args.loanAmount ?? loanAmount,
                interestRate: args.interestRate ?? interestRate,
                time: args.time ?? term,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(userData, 'personal_loan_outreach', result);
              await finishWorkflowTask(task, meta, result);
              return {
                ok: true,
                ...result,
                message: `Personal loan outreach task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as ReturnType<TaskFactory>;
};
