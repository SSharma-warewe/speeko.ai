import type { AgentJobMetadata } from '../job-metadata';
import {
  COMPLETE_AFTER_LAST_ANSWER_RULE,
  buildClosingSpeech,
  buildRealtimeClosingInstructions,
  buildRealtimeFirstTurnBlock,
  composeTaskInstructions,
  shouldParentSpeakOpening,
} from '../builders/prompt-builder';

function meta(
  overrides: Partial<AgentJobMetadata> & {
    onExitInstructions?: string | null;
  } = {},
): AgentJobMetadata {
  const { onExitInstructions, ...rest } = overrides;
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions:
        onExitInstructions === undefined ? null : onExitInstructions,
    },
    enabledTools: ['endCall'],
    ...rest,
  };
}

describe('buildClosingSpeech', () => {
  it('silent empty string → no speech', () => {
    expect(buildClosingSpeech(meta({ onExitInstructions: '' }))).toBeNull();
  });

  it('custom text is spoken verbatim (not wrapped as instructions)', () => {
    const line =
      'Thanks! Your appointment has been scheduled. Have a great day!';
    expect(buildClosingSpeech(meta({ onExitInstructions: line }))).toBe(line);
    expect(
      buildClosingSpeech(meta({ onExitInstructions: `  ${line}  ` })),
    ).toBe(line);
  });

  it('default outbound is a speakable canned line', () => {
    expect(buildClosingSpeech(meta({ onExitInstructions: null }))).toBe(
      'Thanks for your time. Goodbye.',
    );
    expect(buildClosingSpeech(meta({ direction: 'outbound' }))).toBe(
      'Thanks for your time. Goodbye.',
    );
  });

  it('default inbound is a speakable canned line', () => {
    expect(
      buildClosingSpeech(meta({ direction: 'inbound', onExitInstructions: null })),
    ).toBe('Thanks for calling. Goodbye.');
  });

  it('skips session.say closings on realtime models', () => {
    expect(
      buildClosingSpeech(
        meta({
          model: 'openai/gpt-realtime-2.1-mini',
          onExitInstructions: 'Thanks, goodbye.',
        }),
      ),
    ).toBeNull();
  });

  it('does not turn custom text into an LLM instruction', () => {
    const spoken = buildClosingSpeech(
      meta({ onExitInstructions: 'Thanks! Your appointment has been scheduled. Have a great day!' }),
    );
    expect(spoken).not.toMatch(/^Say /);
    expect(spoken).not.toContain('instructions');
  });
});

describe('composeTaskInstructions', () => {
  it('copies persona, clock, and workflow into the task prompt', () => {
    const text = composeTaskInstructions(
      meta({
        agentKey: 'inbound',
        direction: 'inbound',
        prompt: {
          systemPrompt:
            'You are the AI Receptionist for Warewe AI. Speeko.ai is our voice-agent product. AgentsHub.ai is our orchestration product.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
      }),
      'Help the person with their request. Call complete_general_task when done.',
    );

    expect(text).toMatch(/AI Receptionist for Warewe AI/);
    expect(text).toMatch(/Speeko\.ai is our voice-agent product/);
    expect(text).toMatch(/AgentsHub\.ai is our orchestration product/);
    expect(text).toMatch(/AUTHORITATIVE CLOCK/);
    expect(text).toMatch(/=== WORKFLOW \(this call\) ===/);
    expect(text).toMatch(/complete_general_task/);
    expect(text).toMatch(/Persona and company facts above stay in force/);
    expect(text).toMatch(/Do not invent facts/);
  });

  it('empty or whitespace workflow still returns persona', () => {
    const personaMeta = meta({
      prompt: {
        systemPrompt: 'You are the AI Receptionist for Warewe AI.',
        onEnterInstructions: null,
        onExitInstructions: null,
      },
    });
    expect(composeTaskInstructions(personaMeta, '')).toMatch(
      /AI Receptionist for Warewe AI/,
    );
    expect(composeTaskInstructions(personaMeta, '   \n')).toMatch(
      /AI Receptionist for Warewe AI/,
    );
    expect(composeTaskInstructions(personaMeta, '')).not.toMatch(
      /=== WORKFLOW/,
    );
  });

  it('includes the complete-after-last-answer rule', () => {
    const text = composeTaskInstructions(meta(), 'Help the person.');
    expect(text).toContain(COMPLETE_AFTER_LAST_ANSWER_RULE);
  });

  it('realtime compose includes FIRST TURN opening; pipeline does not', () => {
    const realtime = composeTaskInstructions(
      meta({
        model: 'xai/grok-voice-think-fast-2.0',
        task: 'loan_collection',
        context: { name: 'Ada Lovelace' },
      }),
      'Collect the EMI.',
    );
    expect(realtime).toMatch(/=== FIRST TURN ===/);
    expect(realtime).toMatch(/parent agent will not greet/);
    expect(realtime).toMatch(/speaking with Ada Lovelace/);
    expect(realtime).not.toMatch(/=== FIRST TURN ===[\s\S]*=== FIRST TURN ===/);

    const pipeline = composeTaskInstructions(meta(), 'Help the person.');
    expect(pipeline).not.toMatch(/=== FIRST TURN ===/);
  });

  it('realtime silent onEnter skips FIRST TURN', () => {
    const text = composeTaskInstructions(
      meta({
        model: 'openai/gpt-realtime-2.1-mini',
        prompt: {
          systemPrompt: 'You are a test agent.',
          onEnterInstructions: '',
          onExitInstructions: null,
        },
      }),
      'Help the person.',
    );
    expect(text).not.toMatch(/=== FIRST TURN ===/);
    expect(buildRealtimeFirstTurnBlock(
      meta({
        model: 'openai/gpt-realtime-2.1-mini',
        prompt: {
          systemPrompt: 'You are a test agent.',
          onEnterInstructions: '',
          onExitInstructions: null,
        },
      }),
    )).toBeNull();
  });
});

describe('shouldParentSpeakOpening', () => {
  it('is true for pipeline and false for realtime', () => {
    expect(shouldParentSpeakOpening(meta())).toBe(true);
    expect(
      shouldParentSpeakOpening(meta({ model: 'xai/grok-voice-think-fast-2.0' })),
    ).toBe(false);
    expect(
      shouldParentSpeakOpening(
        meta({ model: 'openai/gpt-realtime-2.1-mini' }),
      ),
    ).toBe(false);
  });
});

describe('buildRealtimeClosingInstructions', () => {
  it('is null for pipeline models', () => {
    expect(buildRealtimeClosingInstructions(meta())).toBeNull();
    expect(
      buildRealtimeClosingInstructions(
        meta({ onExitInstructions: 'Thanks, goodbye.' }),
      ),
    ).toBeNull();
  });

  it('default outbound / inbound are exact canned lines', () => {
    expect(
      buildRealtimeClosingInstructions(
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      ),
    ).toBe(
      'Say exactly this line, then stop. Do not ask another question, do not call tools: Thanks for your time. Goodbye.',
    );
    expect(
      buildRealtimeClosingInstructions(
        meta({
          model: 'xai/grok-voice-think-fast-2.0',
          direction: 'inbound',
        }),
      ),
    ).toMatch(/Thanks for calling. Goodbye\.$/);
  });

  it('custom onExit is spoken verbatim; empty string is silent', () => {
    expect(
      buildRealtimeClosingInstructions(
        meta({
          model: 'openai/gpt-realtime-2.1-mini',
          onExitInstructions: 'Bye now.',
        }),
      ),
    ).toMatch(/Bye now\.$/);
    expect(
      buildRealtimeClosingInstructions(
        meta({
          model: 'openai/gpt-realtime-2.1-mini',
          onExitInstructions: '',
        }),
      ),
    ).toBeNull();
  });
});
