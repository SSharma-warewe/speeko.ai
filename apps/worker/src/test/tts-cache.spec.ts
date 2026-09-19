import type { AgentJobMetadata } from '../job-metadata';
import {
  clearTtsCache,
  ensureCached,
  getCachedFrames,
  sayCached,
  ttsCacheKey,
} from '../builders/tts-cache';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'inbound',
    direction: 'inbound',
    task: 'general',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ttsModel: 'sarvam/bulbul-v3',
    voice: 'ritu',
    ...overrides,
  };
}

describe('ttsCacheKey', () => {
  it('includes model, voice, language, pace, and text', () => {
    const a = ttsCacheKey(meta(), 'जी');
    const b = ttsCacheKey(meta({ voice: 'neha' }), 'जी');
    expect(a).toContain('ritu');
    expect(a).not.toBe(b);
    expect(ttsCacheKey(meta(), 'जी')).toBe(a);
  });
});

describe('ensureCached / sayCached', () => {
  beforeEach(() => {
    clearTtsCache();
  });

  it('synthesizes once and reuses frames', async () => {
    const synthesize = jest.fn(async function* () {
      yield { frame: { id: 'f1' } };
    });
    const tts = { synthesize };
    const key = ttsCacheKey(meta(), 'जी');
    const first = await ensureCached(tts, key, 'जी');
    const second = await ensureCached(tts, key, 'जी');
    expect(first).toEqual([{ id: 'f1' }]);
    expect(second).toBe(first);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('passes audio on a cache hit and not on a miss', async () => {
    const tts = {
      synthesize: jest.fn(async function* () {
        yield { frame: { id: 'f1' } };
      }),
    };
    const say = jest.fn();
    const inbound = meta();
    sayCached({ say }, tts, 'जी', { addToChatCtx: false }, inbound);
    expect(say).toHaveBeenCalledWith('जी', { addToChatCtx: false });

    await ensureCached(tts, ttsCacheKey(inbound, 'जी'), 'जी');
    say.mockClear();
    sayCached({ say }, tts, 'जी', { addToChatCtx: false }, inbound);
    expect(say).toHaveBeenCalledWith(
      'जी',
      expect.objectContaining({
        addToChatCtx: false,
        audio: expect.any(ReadableStream),
      }),
    );
    expect(getCachedFrames(ttsCacheKey(inbound, 'जी'))).toHaveLength(1);
  });
});
