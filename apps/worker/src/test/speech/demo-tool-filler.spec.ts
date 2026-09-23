import type { AgentJobMetadata } from '../../session/job-metadata';
import {
  waitForSayPlayout,
  withDemoToolFiller,
} from '../../speech/demo-tool-filler';
import { DEMO_CHECK_LINE_EN } from '../../tasks/demo-booking-tracks';
import { clearTtsCache, ensureCached, ttsCacheKey } from '../../speech/tts-cache';
import type { SessionUserData } from '../../tools/types';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'demo_booking',
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

describe('withDemoToolFiller', () => {
  beforeEach(() => {
    clearTtsCache();
  });

  it('plays the cached check line, overlaps HTTP, then waits for playout', async () => {
    const outbound = meta();
    const tts = {
      synthesize: jest.fn(async function* () {
        yield { frame: { id: 'check-1' } };
      }),
    };
    await ensureCached(
      tts,
      ttsCacheKey(outbound, DEMO_CHECK_LINE_EN),
      DEMO_CHECK_LINE_EN,
    );
    const order: string[] = [];
    const say = jest.fn(() => ({
      waitForPlayout: async () => {
        order.push('playout');
      },
    }));
    const data = userData({ tts, saySession: { say } });

    const result = await withDemoToolFiller(outbound, data, 'check', async () => {
      order.push('http');
      return { ok: true };
    });

    expect(result).toEqual({ ok: true });
    expect(say).toHaveBeenCalledWith(
      DEMO_CHECK_LINE_EN,
      expect.objectContaining({
        addToChatCtx: true,
        audio: expect.any(ReadableStream),
      }),
    );
    expect(order).toEqual(['http', 'playout']);
  });

  it('skips speech on interview_booking and realtime', async () => {
    const say = jest.fn();
    const data = userData({ saySession: { say } });
    await withDemoToolFiller(
      meta({ task: 'interview_booking' }),
      data,
      'check',
      async () => ({ ok: true }),
    );
    await withDemoToolFiller(
      meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      data,
      'book',
      async () => ({ ok: true }),
    );
    expect(say).not.toHaveBeenCalled();
  });
});

describe('waitForSayPlayout', () => {
  it('awaits waitForPlayout and ignores missing or throwing handles', async () => {
    const waitForPlayout = jest.fn().mockResolvedValue(undefined);
    await waitForSayPlayout({ waitForPlayout });
    expect(waitForPlayout).toHaveBeenCalled();
    await expect(waitForSayPlayout(undefined)).resolves.toBeUndefined();
    await expect(
      waitForSayPlayout({
        waitForPlayout: async () => {
          throw new Error('closed');
        },
      }),
    ).resolves.toBeUndefined();
  });
});
