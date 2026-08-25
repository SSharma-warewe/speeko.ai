import type { AgentJobMetadata } from '../job-metadata';
import {
  buildClosingSpeech,
  composeTaskInstructions,
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
});
