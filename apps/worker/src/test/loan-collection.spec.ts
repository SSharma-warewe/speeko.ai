import type { AgentJobMetadata } from '../job-metadata';
import {
  buildOpeningInstructions,
  composeTaskInstructions,
} from '../builders/prompt-builder';
import { TaskRegistry } from '../tasks/registry';
import { TASK_KEYS } from '../tasks/task-ids';
import {
  buildLoanCollectionInstructions,
  confirmedNameForOutcome,
  loanCollectionCompleteBlocker,
  spokenDueLabel,
} from '../tasks/loan-collection.task';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: TASK_KEYS.loanCollection,
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

const dueContext = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  dueType: 'EMI',
  dueDate: '15 September 2026',
  loanAmount: '12500',
};

describe('loan_collection task', () => {
  it('is registered on TaskRegistry', () => {
    expect(TASK_KEYS.loanCollection).toBe('loan_collection');
    expect(TaskRegistry.has('loan_collection')).toBe(true);
    expect(TaskRegistry.listKeys()).toContain('loan_collection');
  });

  it('confirms identity then states due payment, CIBIL, and collection questions', () => {
    const text = buildLoanCollectionInstructions(
      meta({ context: dueContext }),
    );

    expect(text).toMatch(/expected contact name is Ada Lovelace/i);
    expect(text).toMatch(/PHASE 1 — IDENTITY/);
    expect(text).toMatch(/PHASE 2 — DUE NOTICE/);
    expect(text).toMatch(/PHASE 3 — WHEN THEY WILL PAY/);
    expect(text).toMatch(/PHASE 4 — REASON FOR DELAY/);
    expect(text).toMatch(/PHASE 5 — OTHER HELP/);
    expect(text).toMatch(/speaking with Ada Lovelace/);
    expect(text).toMatch(/Due type: EMI/);
    expect(text).toMatch(/Amount: 12500/);
    expect(text).toMatch(/Due payment date: 15 September 2026/);
    expect(text).toMatch(/ada@example.com/);
    expect(text).toMatch(/CIBIL/);
    expect(text).toMatch(/Do not invent a numeric CIBIL drop/);
    expect(text).toMatch(/complete_loan_collection_task/);
    expect(text).toMatch(/PROMISED only when they give a pay date/);
    expect(text).toMatch(/WRONG_PERSON/);
  });

  it('asks for a name when context has none', () => {
    const text = buildLoanCollectionInstructions(meta({ context: {} }));
    expect(text).toMatch(/No expected name was provided/i);
    expect(text).toMatch(/ask once for their name/i);
  });

  it('does not invent terms when due fields are missing', () => {
    const text = buildLoanCollectionInstructions(
      meta({ context: { name: 'Ada Lovelace' } }),
    );
    expect(text).toMatch(
      /No due type, amount, or due date was provided/i,
    );
    expect(text).toMatch(/do not invent numbers or dates/i);
    expect(text).not.toMatch(/Amount:/);
    expect(text).not.toMatch(/Due payment date:/);
  });

  it('reads aliases for due type, date, and amount', () => {
    const text = buildLoanCollectionInstructions(
      meta({
        context: {
          customerName: 'Ada Lovelace',
          emiOrLoan: 'loan',
          due_date: '1 Oct 2026',
          emiAmount: '8,000',
        },
      }),
    );
    expect(text).toMatch(/Due type: loan/);
    expect(text).toMatch(/speak as loan payment/);
    expect(text).toMatch(/Due payment date: 1 Oct 2026/);
    expect(text).toMatch(/Amount: 8,000/);
  });

  it('maps EMI vs loan spoken labels', () => {
    expect(spokenDueLabel('EMI')).toBe('EMI');
    expect(spokenDueLabel('loan')).toBe('loan payment');
    expect(spokenDueLabel(undefined)).toBe('payment');
  });

  it('composed task prompt keeps persona and collection workflow', () => {
    const composed = composeTaskInstructions(
      meta({
        prompt: {
          systemPrompt:
            'You represent Warewe Finance. Speeko.ai is our voice-agent product.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        context: dueContext,
      }),
      buildLoanCollectionInstructions(meta({ context: dueContext })),
    );

    expect(composed).toMatch(/Speeko\.ai is our voice-agent product/);
    expect(composed).toMatch(/PHASE 1 — IDENTITY/);
    expect(composed).toMatch(/PHASE 3 — WHEN THEY WILL PAY/);
    expect(composed).toMatch(/complete_loan_collection_task/);
    expect(composed).toMatch(/Persona and company facts above stay in force/);
  });

  it('PROMISED complete requires a pay date and delay reason', () => {
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'PROMISED',
        lastUserText: 'आज कर दूंगा',
      }),
    ).toMatch(/promisedPayDate/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'PROMISED',
        promisedPayDate: 'today',
        lastUserText: 'आज कर दूंगा',
      }),
    ).toMatch(/delayReason/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'PROMISED',
        promisedPayDate: 'today',
        delayReason: '   ',
        lastUserText: 'आज कर दूंगा',
      }),
    ).toMatch(/delayReason/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'PROMISED',
        promisedPayDate: 'today',
        delayReason: 'none',
        lastUserText: 'आज कर दूंगा',
      }),
    ).toBeNull();
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'REFUSED',
        lastUserText: 'नहीं दूंगा',
      }),
    ).toBeNull();
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'CALLBACK',
        lastUserText: 'बाद में कॉल करो',
      }),
    ).toBeNull();
  });

  it('does not complete WRONG_PERSON or ALREADY_PAID from filler audio', () => {
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'WRONG_PERSON',
        lastUserText: 'Hello.',
      }),
    ).toMatch(/not a clear answer/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'WRONG_PERSON',
        lastUserText: '',
      }),
    ).toMatch(/not a clear answer/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'ALREADY_PAID',
        lastUserText: 'A',
      }),
    ).toMatch(/not a clear answer/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'WRONG_PERSON',
        lastUserText: 'हाँ, मैं शिवम हूँ',
      }),
    ).toMatch(/not clearly the wrong person/);
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'WRONG_PERSON',
        lastUserText: 'मैं शिवम नहीं हूँ',
      }),
    ).toBeNull();
    expect(
      loanCollectionCompleteBlocker({
        outcome: 'ALREADY_PAID',
        lastUserText: 'यह किस्त हो चुकी है',
      }),
    ).toBeNull();
  });

  it('WRONG_PERSON does not inherit the expected contact name', () => {
    expect(
      confirmedNameForOutcome('WRONG_PERSON', null, 'shivam'),
    ).toBeUndefined();
    expect(
      confirmedNameForOutcome('WRONG_PERSON', '  ', 'shivam'),
    ).toBeUndefined();
    expect(
      confirmedNameForOutcome('WRONG_PERSON', 'Ravi', 'shivam'),
    ).toBe('Ravi');
    expect(
      confirmedNameForOutcome('PROMISED', null, 'shivam'),
    ).toBe('shivam');
  });

  it('identity retry is in the collection prompt', () => {
    const text = buildLoanCollectionInstructions(
      meta({ context: dueContext }),
    );
    expect(text).toMatch(/ask the identity question once more/i);
    expect(text).toMatch(/Do not complete WRONG_PERSON on unclear audio/);
  });

  it('default opening confirms name before discussing the due payment', () => {
    const opening = buildOpeningInstructions(
      meta({
        context: { name: 'Ada Lovelace' },
      }),
    );
    expect(opening).toMatch(/payment that is due/);
    expect(opening).toMatch(/speaking with Ada Lovelace/);
    expect(opening).toMatch(
      /Do not mention the amount, due date, EMI, or CIBIL/,
    );
    expect(opening).toMatch(/AUTHORITATIVE CLOCK/);
  });
});
