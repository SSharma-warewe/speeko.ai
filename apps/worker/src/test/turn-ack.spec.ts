import type { AgentJobMetadata } from '../job-metadata';
import {
  ENGLISH_TURN_ACK,
  HINDI_TURN_ACK,
  resolveTurnAckSpeech,
  speakTurnAck,
  turnAckLine,
  userTurnText,
} from '../builders/turn-ack';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

describe('turnAckLine', () => {
  it('uses Okay for English personas', () => {
    expect(turnAckLine(meta())).toBe(ENGLISH_TURN_ACK);
  });

  it('uses जी for Hindi personas', () => {
    expect(
      turnAckLine(
        meta({
          prompt: {
            systemPrompt: 'You speak Hindi on this call.',
            onEnterInstructions: null,
            onExitInstructions: null,
          },
        }),
      ),
    ).toBe(HINDI_TURN_ACK);
  });
});

describe('resolveTurnAckSpeech', () => {
  it('skips empty user turns', () => {
    expect(resolveTurnAckSpeech(meta(), '')).toBeNull();
    expect(resolveTurnAckSpeech(meta(), '   ')).toBeNull();
    expect(resolveTurnAckSpeech(meta(), null)).toBeNull();
  });

  it('skips realtime models', () => {
    expect(
      resolveTurnAckSpeech(
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
        'Yes I will pay.',
      ),
    ).toBeNull();
  });

  it('returns Okay after a pipeline user sentence', () => {
    expect(resolveTurnAckSpeech(meta(), 'Yes I will pay.')).toBe('Okay');
  });
});

describe('userTurnText', () => {
  it('prefers textContent', () => {
    expect(userTurnText({ textContent: 'Hello there', content: 'other' })).toBe(
      'Hello there',
    );
  });

  it('falls back to content string or parts', () => {
    expect(userTurnText({ content: 'From content' })).toBe('From content');
    expect(userTurnText({ content: ['I', { text: 'will pay' }] })).toBe(
      'I will pay',
    );
  });
});

describe('speakTurnAck', () => {
  it('says the ack without awaiting and keeps it out of chat', () => {
    const say = jest.fn();
    speakTurnAck({ say }, meta(), 'I can do Friday.');
    expect(say).toHaveBeenCalledWith('Okay', {
      addToChatCtx: false,
      allowInterruptions: true,
    });
  });

  it('does not say on empty or realtime turns', () => {
    const say = jest.fn();
    speakTurnAck({ say }, meta(), '  ');
    speakTurnAck(
      { say },
      meta({ model: 'openai/gpt-realtime-2.1-mini' }),
      'Hello',
    );
    expect(say).not.toHaveBeenCalled();
  });

  it('does not throw if say fails', () => {
    const say = jest.fn(() => {
      throw new Error('session closed');
    });
    expect(() => speakTurnAck({ say }, meta(), 'Yes.')).not.toThrow();
  });
});
