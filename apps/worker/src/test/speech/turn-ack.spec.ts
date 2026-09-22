import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '../../session/job-metadata';
import {
  ENGLISH_TURN_ACK,
  HINDI_TURN_ACK,
  attachEarlyTurnAck,
  resolveEarlyTurnAck,
  resolveTurnAckSpeech,
  speakEarlyTurnAck,
  speakTurnAck,
  turnAckLine,
  userTurnText,
} from '../../speech/turn-ack';

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

describe('resolveEarlyTurnAck', () => {
  it('returns Okay without needing a transcript', () => {
    expect(resolveEarlyTurnAck(meta())).toBe(ENGLISH_TURN_ACK);
  });

  it('skips realtime models', () => {
    expect(
      resolveEarlyTurnAck(meta({ model: 'xai/grok-voice-think-fast-2.0' })),
    ).toBeNull();
  });
});

describe('speakEarlyTurnAck', () => {
  it('says Okay without a transcript', () => {
    const say = jest.fn();
    speakEarlyTurnAck({ say }, meta());
    expect(say).toHaveBeenCalledWith('Okay', {
      addToChatCtx: false,
      allowInterruptions: true,
    });
  });

  it('does not say on realtime', () => {
    const say = jest.fn();
    speakEarlyTurnAck(
      { say },
      meta({ model: 'openai/gpt-realtime-2.1-mini' }),
    );
    expect(say).not.toHaveBeenCalled();
  });
});

function fakeSession() {
  const listeners: Array<(ev: { newState?: string }) => void> = [];
  return {
    say: jest.fn(),
    on: jest.fn((event: string, listener: (ev: { newState?: string }) => void) => {
      if (event === voice.AgentSessionEventTypes.UserStateChanged) {
        listeners.push(listener);
      }
    }),
    emit(newState: string) {
      for (const listener of listeners) {
        listener({ newState });
      }
    },
  };
}

describe('attachEarlyTurnAck', () => {
  it('does not attach on realtime', () => {
    const session = fakeSession();
    const handle = attachEarlyTurnAck(
      session,
      meta({ model: 'xai/grok-voice-think-fast-2.0' }),
    );
    handle.enable();
    session.emit('speaking');
    session.emit('listening');
    expect(session.on).not.toHaveBeenCalled();
    expect(session.say).not.toHaveBeenCalled();
  });

  it('does not say on listening without a prior speaking', () => {
    const session = fakeSession();
    const handle = attachEarlyTurnAck(session, meta());
    handle.enable();
    session.emit('listening');
    expect(session.say).not.toHaveBeenCalled();
  });

  it('says Okay after speaking then listening once enabled', () => {
    const session = fakeSession();
    const handle = attachEarlyTurnAck(session, meta());
    handle.enable();
    session.emit('speaking');
    session.emit('listening');
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(session.say).toHaveBeenCalledWith('Okay', {
      addToChatCtx: false,
      allowInterruptions: true,
    });
  });

  it('says जी for Hindi personas', () => {
    const session = fakeSession();
    const handle = attachEarlyTurnAck(
      session,
      meta({
        prompt: {
          systemPrompt: 'You speak Hindi on this call.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
      }),
    );
    handle.enable();
    session.emit('speaking');
    session.emit('listening');
    expect(session.say).toHaveBeenCalledWith('जी', {
      addToChatCtx: false,
      allowInterruptions: true,
    });
  });

  it('does not say until enable()', () => {
    const session = fakeSession();
    attachEarlyTurnAck(session, meta());
    session.emit('speaking');
    session.emit('listening');
    expect(session.say).not.toHaveBeenCalled();
  });

  it('can ack a second utterance', () => {
    const session = fakeSession();
    const handle = attachEarlyTurnAck(session, meta());
    handle.enable();
    session.emit('speaking');
    session.emit('listening');
    session.emit('speaking');
    session.emit('listening');
    expect(session.say).toHaveBeenCalledTimes(2);
  });
});
