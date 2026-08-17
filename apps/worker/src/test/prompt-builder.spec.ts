import type { AgentJobMetadata } from '../job-metadata';
import { buildClosingSpeech } from '../builders/prompt-builder';

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
