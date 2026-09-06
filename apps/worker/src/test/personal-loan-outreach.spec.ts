import type { AgentJobMetadata } from '../job-metadata';
import {
  buildOpeningInstructions,
  composeTaskInstructions,
} from '../builders/prompt-builder';
import { TaskRegistry } from '../tasks/registry';
import { TASK_KEYS } from '../tasks/task-ids';
import { buildPersonalLoanOutreachInstructions } from '../tasks/personal-loan-outreach.task';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: TASK_KEYS.personalLoanOutreach,
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

const offerContext = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  loanAmount: '250000',
  interestRate: '12%',
  time: '36 months',
};

describe('personal_loan_outreach task', () => {
  it('is registered on TaskRegistry', () => {
    expect(TASK_KEYS.personalLoanOutreach).toBe('personal_loan_outreach');
    expect(TaskRegistry.has('personal_loan_outreach')).toBe(true);
    expect(TaskRegistry.listKeys()).toContain('personal_loan_outreach');
  });

  it('presents context loan terms then asks interest', () => {
    const text = buildPersonalLoanOutreachInstructions(
      meta({ context: offerContext }),
    );

    expect(text).toMatch(/expected contact name is Ada Lovelace/i);
    expect(text).toMatch(/PHASE 1 — IDENTITY/);
    expect(text).toMatch(/PHASE 2 — PRESENT THE LOAN/);
    expect(text).toMatch(/PHASE 3 — INTEREST/);
    expect(text).toMatch(/speaking with Ada Lovelace/);
    expect(text).toMatch(/Loan amount: 250000/);
    expect(text).toMatch(/Interest rate: 12%/);
    expect(text).toMatch(/Term \(time\): 36 months/);
    expect(text).toMatch(/ada@example.com/);
    expect(text).toMatch(/Do not invent fees, EMI, eligibility/);
    expect(text).toMatch(/complete_personal_loan_outreach_task/);
    expect(text).toMatch(/INTERESTED only on a clear yes/);
    expect(text).toMatch(/NOT_INTERESTED on a clear no/);
  });

  it('asks for a name when context has none', () => {
    const text = buildPersonalLoanOutreachInstructions(meta({ context: {} }));
    expect(text).toMatch(/No expected name was provided/i);
    expect(text).toMatch(/ask once for their name/i);
  });

  it('does not invent terms when offer fields are missing', () => {
    const text = buildPersonalLoanOutreachInstructions(
      meta({ context: { name: 'Ada Lovelace' } }),
    );
    expect(text).toMatch(/No loan amount, interest rate, or term was provided/i);
    expect(text).toMatch(/do not invent numbers/i);
    expect(text).not.toMatch(/Loan amount:/);
  });

  it('reads aliases for amount, rate, and term', () => {
    const text = buildPersonalLoanOutreachInstructions(
      meta({
        context: {
          customerName: 'Ada Lovelace',
          loan_amount: '1 lakh',
          rate: '10.5%',
          tenure: '5 years',
        },
      }),
    );
    expect(text).toMatch(/Loan amount: 1 lakh/);
    expect(text).toMatch(/Interest rate: 10.5%/);
    expect(text).toMatch(/Term \(time\): 5 years/);
  });

  it('composed task prompt keeps persona and outreach workflow', () => {
    const composed = composeTaskInstructions(
      meta({
        prompt: {
          systemPrompt:
            'You represent Warewe Finance. Speeko.ai is our voice-agent product.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        context: offerContext,
      }),
      buildPersonalLoanOutreachInstructions(meta({ context: offerContext })),
    );

    expect(composed).toMatch(/Speeko\.ai is our voice-agent product/);
    expect(composed).toMatch(/PHASE 1 — IDENTITY/);
    expect(composed).toMatch(/PHASE 3 — INTEREST/);
    expect(composed).toMatch(/complete_personal_loan_outreach_task/);
    expect(composed).toMatch(/Persona and company facts above stay in force/);
  });

  it('default opening confirms name before presenting terms', () => {
    const opening = buildOpeningInstructions(
      meta({
        context: { name: 'Ada Lovelace' },
      }),
    );
    expect(opening).toMatch(/personal loan offer/);
    expect(opening).toMatch(/speaking with Ada Lovelace/);
    expect(opening).toMatch(/Do not read the loan amount, interest rate, or term/);
    expect(opening).toMatch(/AUTHORITATIVE CLOCK/);
  });
});
