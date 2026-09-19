import { isRealtimeLlmModel } from '@call-agent/contracts';
import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata';
import { inboundServiceTrackLine } from '../builders/inbound-service-tracks';
import {
  clearTtsCache,
  ensureCached,
  ttsCacheKey,
} from '../builders/tts-cache';
import {
  finishWorkflowTask,
  handleInboundServiceTrackTurn,
} from '../builders/workflow-task';
import { speakRealtimeGoodbye } from '../builders/realtime-speech';
import type { SessionUserData } from '../tools/types';

jest.mock('../builders/realtime-speech', () => ({
  speakRealtimeOpening: jest.fn().mockResolvedValue(undefined),
  speakRealtimeGoodbye: jest.fn().mockResolvedValue(undefined),
}));

const speakGoodbye = speakRealtimeGoodbye as jest.MockedFunction<
  typeof speakRealtimeGoodbye
>;

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

describe('finishWorkflowTask', () => {
  beforeEach(() => {
    speakGoodbye.mockClear();
    speakGoodbye.mockResolvedValue(undefined);
  });

  it('speaks goodbye then completes on realtime', async () => {
    expect(isRealtimeLlmModel('xai/grok-voice-think-fast-2.0')).toBe(true);
    const complete = jest.fn();
    const session = { generateReply: jest.fn() };
    const task = { session, complete } as never;
    const result = { outcome: 'PROMISED' };

    await finishWorkflowTask(
      task,
      meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      result,
    );

    expect(speakGoodbye).toHaveBeenCalledWith(session, expect.anything());
    expect(complete).toHaveBeenCalledWith(result);
    expect(speakGoodbye.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
  });

  it('still completes if goodbye throws', async () => {
    speakGoodbye.mockRejectedValue(new Error('Item not found'));
    const complete = jest.fn();
    const task = {
      session: { generateReply: jest.fn() },
      complete,
    } as never;

    await expect(
      finishWorkflowTask(
        task,
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
        { ok: true },
      ),
    ).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledWith({ ok: true });
  });

  it('skips goodbye on pipeline and still completes', async () => {
    const complete = jest.fn();
    const task = { session: {}, complete } as never;

    await finishWorkflowTask(task, meta(), { ok: true });

    expect(speakGoodbye).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({ ok: true });
  });
});

describe('handleInboundServiceTrackTurn', () => {
  beforeEach(() => {
    clearTtsCache();
  });

  function userData(
    extras: Partial<SessionUserData> = {},
  ): SessionUserData {
    return {
      context: {},
      taskResult: null,
      taskCompleted: false,
      toolEvents: [],
      ...extras,
    };
  }

  it('plays a cached buy line, interrupts, and throws StopResponse', async () => {
    const inbound = meta({
      direction: 'inbound',
      agentKey: 'inbound',
      ttsModel: 'sarvam/bulbul-v3',
      voice: 'ritu',
    });
    const line = inboundServiceTrackLine('buy');
    const tts = {
      synthesize: jest.fn(async function* () {
        yield { frame: { id: 'buy-1' } };
      }),
    };
    await ensureCached(tts, ttsCacheKey(inbound, line), line);
    const session = { say: jest.fn(), interrupt: jest.fn() };
    const data = userData({ tts });

    await expect(
      handleInboundServiceTrackTurn({
        session,
        meta: inbound,
        userData: data,
        userText: 'बाय करनी है।',
      }),
    ).rejects.toBeInstanceOf(voice.StopResponse);

    expect(data.serviceTrack).toBe('buy');
    expect(session.interrupt).toHaveBeenCalled();
    expect(session.say).toHaveBeenCalledWith(
      line,
      expect.objectContaining({
        addToChatCtx: true,
        audio: expect.any(ReadableStream),
      }),
    );
  });

  it('skips unclear, outbound, realtime, and a second track', async () => {
    const inbound = meta({ direction: 'inbound', agentKey: 'inbound' });
    const session = { say: jest.fn(), interrupt: jest.fn() };

    await handleInboundServiceTrackTurn({
      session,
      meta: inbound,
      userData: userData(),
      userText: 'भाई',
    });
    await handleInboundServiceTrackTurn({
      session,
      meta: meta({ direction: 'outbound' }),
      userData: userData(),
      userText: 'बाय करनी है।',
    });
    await handleInboundServiceTrackTurn({
      session,
      meta: meta({
        direction: 'inbound',
        model: 'xai/grok-voice-think-fast-2.0',
      }),
      userData: userData(),
      userText: 'बाय करनी है।',
    });
    await handleInboundServiceTrackTurn({
      session,
      meta: inbound,
      userData: userData({ serviceTrack: 'buy' }),
      userText: 'सेल करनी है',
    });

    expect(session.say).not.toHaveBeenCalled();
    expect(session.interrupt).not.toHaveBeenCalled();
  });
});
