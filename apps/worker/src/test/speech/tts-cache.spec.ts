import type { AgentJobMetadata } from '../../session/job-metadata';
import {
  clearTtsCache,
  ensureCached,
  getCachedFrames,
  sayCached,
  ttsCacheKey,
  warmTtsPhrases,
} from '../../speech/tts-cache';

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

  it('invokes say as a method so this stays bound', () => {
    const session = {
      seen: false,
      say(this: { seen: boolean }, _text: string) {
        this.seen = true;
      },
    };
    sayCached(session, undefined, 'जी', { addToChatCtx: false }, meta());
    expect(session.seen).toBe(true);
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

  it('warms phrases in parallel', async () => {
    const inFlight = { n: 0, max: 0 };
    const synthesize = jest.fn(async function* (text: string) {
      inFlight.n += 1;
      inFlight.max = Math.max(inFlight.max, inFlight.n);
      await new Promise((resolve) => setTimeout(resolve, 40));
      inFlight.n -= 1;
      yield { frame: { id: text } };
    });
    const started = Date.now();
    await warmTtsPhrases({ synthesize }, meta(), ['a', 'b', 'c']);
    expect(inFlight.max).toBe(3);
    expect(synthesize).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBeLessThan(100);
  });
});
