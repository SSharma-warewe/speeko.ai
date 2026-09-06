import type { AgentJobMetadata } from '../job-metadata';
import {
  isRealtimeAgentBusy,
  isRealtimeAgentIdle,
  speakRealtimeGoodbye,
  waitForRealtimeUtterance,
  type RealtimeWaitSession,
} from '../builders/realtime-speech';

function fakeSession(
  initial: string,
): RealtimeWaitSession & { agentState: string; emit: (state: string) => void } {
  const listeners: Array<(ev: { newState?: string }) => void> = [];
  const session: RealtimeWaitSession & {
    agentState: string;
    emit: (state: string) => void;
  } = {
    agentState: initial,
    on(_event, listener) {
      listeners.push(listener);
    },
    off(_event, listener) {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    emit(state: string) {
      session.agentState = state;
      for (const listener of [...listeners]) {
        listener({ newState: state });
      }
    },
  };
  return session;
}

describe('realtime agent state helpers', () => {
  it('treats speaking/thinking as busy and idle/listening as idle', () => {
    expect(isRealtimeAgentBusy('speaking')).toBe(true);
    expect(isRealtimeAgentBusy('thinking')).toBe(true);
    expect(isRealtimeAgentBusy('idle')).toBe(false);
    expect(isRealtimeAgentIdle('idle')).toBe(true);
    expect(isRealtimeAgentIdle('listening')).toBe(true);
    expect(isRealtimeAgentIdle('speaking')).toBe(false);
  });
});

describe('waitForRealtimeUtterance', () => {
  it('already idle: waits minMs and returns idle', async () => {
    const session = fakeSession('idle');
    const t0 = Date.now();
    const result = await waitForRealtimeUtterance(session, {
      minMs: 40,
      timeoutMs: 200,
      speakingStartMs: 25,
    });
    expect(result).toBe('idle');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
  });

  it('speaking then idle returns idle without waiting the full timeout', async () => {
    const session = fakeSession('speaking');
    const p = waitForRealtimeUtterance(session, {
      minMs: 30,
      timeoutMs: 2000,
      speakingStartMs: 500,
    });
    setTimeout(() => session.emit('idle'), 15);
    const t0 = Date.now();
    await expect(p).resolves.toBe('idle');
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('stuck speaking hits timeout', async () => {
    const session = fakeSession('speaking');
    const result = await waitForRealtimeUtterance(session, {
      minMs: 10,
      timeoutMs: 40,
      speakingStartMs: 10,
    });
    expect(result).toBe('timeout');
  });
});

describe('speakRealtimeGoodbye', () => {
  const realtimeMeta = {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    model: 'xai/grok-voice-think-fast-2.0',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
  } as AgentJobMetadata;

  it('generateReply then waits; does not throw if generateReply fails', async () => {
    const session = Object.assign(fakeSession('idle'), {
      generateReply: jest.fn(() => {
        throw new Error('Item not found');
      }),
    });
    await expect(
      speakRealtimeGoodbye(session, realtimeMeta),
    ).resolves.toBeUndefined();
    expect(session.generateReply).toHaveBeenCalled();
  });

  it('skips generateReply when onExit is silent', async () => {
    const session = Object.assign(fakeSession('idle'), {
      generateReply: jest.fn(),
    });
    await speakRealtimeGoodbye(session, {
      ...realtimeMeta,
      prompt: {
        ...realtimeMeta.prompt,
        onExitInstructions: '',
      },
    });
    expect(session.generateReply).not.toHaveBeenCalled();
  });
});
