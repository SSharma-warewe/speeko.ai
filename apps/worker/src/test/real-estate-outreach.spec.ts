import type { AgentJobMetadata } from '../job-metadata';
import {
  buildOpeningInstructions,
  composeTaskInstructions,
} from '../builders/prompt-builder';
import { TaskRegistry } from '../tasks/registry';
import { TASK_KEYS } from '../tasks/task-ids';
import {
  buildRealEstateOutreachInstructions,
  realEstateOutreachCompleteBlocker,
} from '../tasks/real-estate-outreach.task';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: TASK_KEYS.realEstateOutreach,
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

const inquiryContext = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  location: 'Whitefield, Bangalore',
  budget: '80 lakhs',
};

describe('real_estate_outreach task', () => {
  it('is registered on TaskRegistry', () => {
    expect(TASK_KEYS.realEstateOutreach).toBe('real_estate_outreach');
    expect(TaskRegistry.has('real_estate_outreach')).toBe(true);
    expect(TaskRegistry.listKeys()).toContain('real_estate_outreach');
  });

  it('presents context location and budget then asks interest', () => {
    const text = buildRealEstateOutreachInstructions(
      meta({ context: inquiryContext }),
    );

    expect(text).toMatch(/expected contact name is Ada Lovelace/i);
    expect(text).toMatch(/PHASE 1 — IDENTITY/);
    expect(text).toMatch(/PHASE 2 — PRESENT THE INQUIRY/);
    expect(text).toMatch(/PHASE 3 — INTEREST/);
    expect(text).toMatch(/speaking with Ada Lovelace/);
    expect(text).toMatch(/Location: Whitefield, Bangalore/);
    expect(text).toMatch(/Budget: 80 lakhs/);
    expect(text).toMatch(/ada@example.com/);
    expect(text).toMatch(/Do not invent listings, prices, amenities/);
    expect(text).toMatch(/complete_real_estate_outreach_task/);
    expect(text).toMatch(/INTERESTED only on a clear yes/);
    expect(text).toMatch(/NOT_INTERESTED on a clear no/);
  });

  it('asks for a name when context has none', () => {
    const text = buildRealEstateOutreachInstructions(meta({ context: {} }));
    expect(text).toMatch(/No expected name was provided/i);
    expect(text).toMatch(/ask once for their name/i);
  });

  it('does not invent details when location and budget are missing', () => {
    const text = buildRealEstateOutreachInstructions(
      meta({ context: { name: 'Ada Lovelace' } }),
    );
    expect(text).toMatch(/No location or budget was provided/i);
    expect(text).toMatch(/do not invent a property, area, or price/i);
    expect(text).not.toMatch(/Location:/);
    expect(text).not.toMatch(/Budget:/);
  });

  it('reads aliases for location and budget', () => {
    const text = buildRealEstateOutreachInstructions(
      meta({
        context: {
          customerName: 'Ada Lovelace',
          city: 'Pune',
          priceRange: '1.2 crore',
        },
      }),
    );
    expect(text).toMatch(/Location: Pune/);
    expect(text).toMatch(/Budget: 1.2 crore/);
  });

  it('composed task prompt keeps persona and outreach workflow', () => {
    const composed = composeTaskInstructions(
      meta({
        prompt: {
          systemPrompt:
            'You represent Warewe Homes. Speeko.ai is our voice-agent product.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        context: inquiryContext,
      }),
      buildRealEstateOutreachInstructions(meta({ context: inquiryContext })),
    );

    expect(composed).toMatch(/Speeko\.ai is our voice-agent product/);
    expect(composed).toMatch(/PHASE 1 — IDENTITY/);
    expect(composed).toMatch(/PHASE 3 — INTEREST/);
    expect(composed).toMatch(/complete_real_estate_outreach_task/);
    expect(composed).toMatch(/Persona and company facts above stay in force/);
  });

  it('default opening confirms name before presenting location or budget', () => {
    const opening = buildOpeningInstructions(
      meta({
        context: { name: 'Ada Lovelace' },
      }),
    );
    expect(opening).toMatch(/property inquiry/);
    expect(opening).toMatch(/speaking with Ada Lovelace/);
    expect(opening).toMatch(/Do not read the location or budget/);
    expect(opening).toMatch(/AUTHORITATIVE CLOCK/);
  });

  it('does not complete INTERESTED from filler audio', () => {
    expect(
      realEstateOutreachCompleteBlocker({
        outcome: 'INTERESTED',
        lastUserText: 'Hello.',
      }),
    ).toMatch(/not a clear answer/);
    expect(
      realEstateOutreachCompleteBlocker({
        outcome: 'INTERESTED',
        lastUserText: 'जी हाँ',
      }),
    ).toBeNull();
    expect(
      realEstateOutreachCompleteBlocker({
        outcome: 'INTERESTED',
        lastUserText: 'No.',
        hindiHanHomophone: true,
      }),
    ).toBeNull();
    expect(
      realEstateOutreachCompleteBlocker({
        outcome: 'NOT_INTERESTED',
        lastUserText: 'No.',
        hindiHanHomophone: true,
      }),
    ).toMatch(/not clearly declined/);
    expect(
      realEstateOutreachCompleteBlocker({
        outcome: 'NOT_INTERESTED',
        lastUserText: 'Nahi, merko nahi chahiye.',
      }),
    ).toBeNull();
  });

  it('identity retry is in the outreach prompt', () => {
    const text = buildRealEstateOutreachInstructions(
      meta({ context: inquiryContext }),
    );
    expect(text).toMatch(/ask the identity question once more/i);
  });
});
