import type { AgentJobMetadata } from '../job-metadata';
import {
  buildOpeningInstructions,
  composeTaskInstructions,
} from '../builders/prompt-builder';
import { TaskRegistry } from '../tasks/registry';
import { TASK_KEYS } from '../tasks/task-ids';
import {
  buildRealEstateVisitConfirmationInstructions,
  realEstateVisitConfirmationCompleteBlocker,
} from '../tasks/real-estate-visit-confirmation.task';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: TASK_KEYS.realEstateVisitConfirmation,
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

const visitContext = {
  name: 'Ada Lovelace',
  location: 'Whitefield, Bangalore',
  time: 'Saturday 3pm',
  notes: 'Bring a government ID',
};

describe('real_estate_visit_confirmation task', () => {
  it('is registered on TaskRegistry', () => {
    expect(TASK_KEYS.realEstateVisitConfirmation).toBe(
      'real_estate_visit_confirmation',
    );
    expect(TaskRegistry.has('real_estate_visit_confirmation')).toBe(true);
    expect(TaskRegistry.listKeys()).toContain(
      'real_estate_visit_confirmation',
    );
  });

  it('presents context location, time, and notes then asks if they will come', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({ context: visitContext }),
    );

    expect(text).toMatch(/expected contact name is Ada Lovelace/i);
    expect(text).toMatch(/PHASE 1 — IDENTITY/);
    expect(text).toMatch(/PHASE 2 — PRESENT THE VISIT/);
    expect(text).toMatch(/PHASE 3 — ATTENDANCE/);
    expect(text).toMatch(/speaking with Ada Lovelace/);
    expect(text).toMatch(/Location: Whitefield, Bangalore/);
    expect(text).toMatch(/Visit time: Saturday 3pm/);
    expect(text).toMatch(/Visit notes: Bring a government ID/);
    expect(text).toMatch(/ask if they will be coming for this property visit/i);
    expect(text).toMatch(/Do not invent listings, parking, unit numbers/);
    expect(text).toMatch(/complete_real_estate_visit_confirmation_task/);
    expect(text).toMatch(/CONFIRMED only on a clear yes they will attend/);
    expect(text).toMatch(/NOT_COMING on a clear no/);
  });

  it('asks for a name when context has none', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({ context: {} }),
    );
    expect(text).toMatch(/No expected name was provided/i);
    expect(text).toMatch(/ask once for their name/i);
  });

  it('does not invent details when location and time are missing', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({ context: { name: 'Ada Lovelace' } }),
    );
    expect(text).toMatch(/No location or visit time was provided/i);
    expect(text).toMatch(/do not invent a property, address, or time/i);
    expect(text).not.toMatch(/Location:/);
    expect(text).not.toMatch(/Visit time:/);
  });

  it('does not invent location when only time is set', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({ context: { name: 'Ada Lovelace', time: 'Saturday 3pm' } }),
    );
    expect(text).toMatch(/Visit time: Saturday 3pm/);
    expect(text).toMatch(/No location was provided/i);
    expect(text).not.toMatch(/Location:/);
  });

  it('does not invent time when only location is set', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({
        context: { name: 'Ada Lovelace', location: 'Whitefield, Bangalore' },
      }),
    );
    expect(text).toMatch(/Location: Whitefield, Bangalore/);
    expect(text).toMatch(/No visit time was provided/i);
    expect(text).not.toMatch(/Visit time:/);
  });

  it('omits visit notes when context has none', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({
        context: {
          name: 'Ada Lovelace',
          location: 'Whitefield, Bangalore',
          time: 'Saturday 3pm',
        },
      }),
    );
    expect(text).not.toMatch(/Visit notes:/);
    expect(text).toMatch(/Mention visit notes only when they were provided/);
  });

  it('reads aliases for location and time', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({
        context: {
          customerName: 'Ada Lovelace',
          propertyLocation: 'Pune',
          visitTime: 'Monday 11am',
        },
      }),
    );
    expect(text).toMatch(/Location: Pune/);
    expect(text).toMatch(/Visit time: Monday 11am/);
  });

  it('composed task prompt keeps persona and visit confirmation workflow', () => {
    const composed = composeTaskInstructions(
      meta({
        prompt: {
          systemPrompt:
            'You represent Warewe Homes. Speeko.ai is our voice-agent product.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        context: visitContext,
      }),
      buildRealEstateVisitConfirmationInstructions(
        meta({ context: visitContext }),
      ),
    );

    expect(composed).toMatch(/Speeko\.ai is our voice-agent product/);
    expect(composed).toMatch(/PHASE 1 — IDENTITY/);
    expect(composed).toMatch(/PHASE 3 — ATTENDANCE/);
    expect(composed).toMatch(/complete_real_estate_visit_confirmation_task/);
    expect(composed).toMatch(/Persona and company facts above stay in force/);
  });

  it('default opening confirms name before presenting location or time', () => {
    const opening = buildOpeningInstructions(
      meta({
        context: { name: 'Ada Lovelace' },
      }),
    );
    expect(opening).toMatch(/scheduled property visit/);
    expect(opening).toMatch(/speaking with Ada Lovelace/);
    expect(opening).toMatch(/Do not read the location, time, or visit notes/);
    expect(opening).toMatch(/AUTHORITATIVE CLOCK/);
  });

  it('does not complete CONFIRMED from filler audio', () => {
    expect(
      realEstateVisitConfirmationCompleteBlocker({
        outcome: 'CONFIRMED',
        lastUserText: 'Hello.',
      }),
    ).toMatch(/not a clear answer/);
    expect(
      realEstateVisitConfirmationCompleteBlocker({
        outcome: 'CONFIRMED',
        lastUserText: 'जी हाँ',
      }),
    ).toBeNull();
    expect(
      realEstateVisitConfirmationCompleteBlocker({
        outcome: 'CONFIRMED',
        lastUserText: 'No.',
        hindiHanHomophone: true,
      }),
    ).toBeNull();
    expect(
      realEstateVisitConfirmationCompleteBlocker({
        outcome: 'NOT_COMING',
        lastUserText: 'No.',
        hindiHanHomophone: true,
      }),
    ).toMatch(/not clearly declined/);
    expect(
      realEstateVisitConfirmationCompleteBlocker({
        outcome: 'NOT_COMING',
        lastUserText: 'Nahi, main nahi aa sakta.',
      }),
    ).toBeNull();
  });

  it('identity retry is in the confirmation prompt', () => {
    const text = buildRealEstateVisitConfirmationInstructions(
      meta({ context: visitContext }),
    );
    expect(text).toMatch(/ask the identity question once more/i);
  });
});
