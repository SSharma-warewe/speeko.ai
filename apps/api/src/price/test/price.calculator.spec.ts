import {
  mergeAttemptIntoSnapshot,
  priceAttempt,
} from '../price.calculator';
import type { PriceAttemptInput, PriceRuntimeConfig } from '../price.types';

const SHIP: PriceRuntimeConfig = {
  plan: 'ship',
  agentDeployed: false,
  sipVendorUsdPerMin: 0,
};

function session(overrides: Partial<PriceAttemptInput> = {}): PriceAttemptInput {
  return {
    attempt: 1,
    medium: 'sip',
    answeredAt: '2026-08-01T10:00:00.000Z',
    endedAt: '2026-08-01T10:01:00.000Z',
    usage: { models: [] },
    ...overrides,
  };
}

function line(
  result: ReturnType<typeof priceAttempt>,
  key: string,
  unit?: string,
) {
  return result.lines.filter(
    (l) => l.key === key && (unit == null || l.unit === unit),
  );
}

describe('priceAttempt', () => {
  it('prices Gemma 4 31B tokens with cached vs uncached input', () => {
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'llm_usage',
              provider: 'google',
              model: 'gemma-4-31b-it',
              inputTokens: 1000,
              inputCachedTokens: 200,
              outputTokens: 100,
            },
          ],
        },
      }),
      SHIP,
    );
    const input = line(result, 'llm', 'tokens_in')[0];
    const cached = line(result, 'llm', 'tokens_cached')[0];
    const output = line(result, 'llm', 'tokens_out')[0];
    expect(input.quantity).toBe(800);
    expect(input.unitPriceUsd).toBe(0.4);
    expect(input.amountUsd).toBe(0.00032);
    expect(cached.quantity).toBe(200);
    expect(cached.unitPriceUsd).toBe(0.2);
    expect(cached.amountUsd).toBe(0.00004);
    expect(output.quantity).toBe(100);
    expect(output.unitPriceUsd).toBe(1.2);
    expect(output.amountUsd).toBe(0.00012);
  });

  it('prices Nova-3 multilingual STT from audioDurationMs (1s min)', () => {
    const minute = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'stt_usage',
              provider: 'deepgram',
              model: 'nova-3',
              audioDurationMs: 60_000,
            },
          ],
        },
      }),
      SHIP,
    );
    const stt = line(minute, 'stt')[0];
    expect(stt.quantity).toBe(1);
    expect(stt.unitPriceUsd).toBe(0.0058);
    expect(stt.amountUsd).toBe(0.0058);

    const subSecond = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'stt_usage',
              provider: 'deepgram',
              model: 'deepgram/nova-3',
              audioDurationMs: 500,
            },
          ],
        },
      }),
      SHIP,
    );
    expect(line(subSecond, 'stt')[0].quantity).toBeCloseTo(1 / 60, 6);
  });

  it('falls back to session clock when STT row has no audioDurationMs', () => {
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'stt_usage',
              provider: 'deepgram',
              model: 'nova-3',
            },
          ],
        },
      }),
      SHIP,
    );
    expect(line(result, 'stt')[0].quantity).toBe(1);
    expect(line(result, 'stt')[0].notes).toMatch(/session clock/i);
  });

  it('prices Inworld TTS-2 by characters', () => {
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'tts_usage',
              provider: 'inworld',
              model: 'inworld-tts-2',
              charactersCount: 600,
            },
          ],
        },
      }),
      SHIP,
    );
    const tts = line(result, 'tts')[0];
    expect(tts.quantity).toBe(600);
    expect(tts.unitPriceUsd).toBe(25);
    expect(tts.amountUsd).toBe(0.015);
  });

  it('web: 2× WebRTC, no SIP, no agent session', () => {
    const result = priceAttempt(
      session({ medium: 'web' }),
      SHIP,
    );
    expect(line(result, 'sip')).toHaveLength(0);
    expect(line(result, 'agent_session')).toHaveLength(0);
    const webrtc = line(result, 'webrtc')[0];
    expect(webrtc.quantity).toBe(2);
    expect(webrtc.unitPriceUsd).toBe(0.0005);
    expect(webrtc.amountUsd).toBe(0.001);
  });

  it('sip: SIP + 1× agent WebRTC, no second human WebRTC', () => {
    const result = priceAttempt(session({ medium: 'sip' }), SHIP);
    expect(line(result, 'agent_session')).toHaveLength(0);
    expect(line(result, 'webrtc')[0].quantity).toBe(1);
    expect(line(result, 'sip')[0].quantity).toBe(1);
    expect(line(result, 'sip')[0].unitPriceUsd).toBe(0.004);
    expect(line(result, 'sip')[0].amountUsd).toBe(0.004);
  });

  it('LIVEKIT_AGENT_DEPLOYED=true adds $0.01/min and drops agent WebRTC', () => {
    const sip = priceAttempt(session({ medium: 'sip' }), {
      ...SHIP,
      agentDeployed: true,
    });
    expect(line(sip, 'agent_session')[0].unitPriceUsd).toBe(0.01);
    expect(line(sip, 'agent_session')[0].amountUsd).toBe(0.01);
    expect(line(sip, 'webrtc')).toHaveLength(0);
    expect(line(sip, 'sip')[0].amountUsd).toBe(0.004);

    const web = priceAttempt(session({ medium: 'web' }), {
      ...SHIP,
      agentDeployed: true,
    });
    expect(line(web, 'agent_session')).toHaveLength(1);
    expect(line(web, 'webrtc')[0].quantity).toBe(1);
  });

  it('unknown model → $0 + unknownModels', () => {
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'llm_usage',
              provider: 'acme',
              model: 'mystery-9',
              inputTokens: 1000,
              outputTokens: 10,
            },
          ],
        },
      }),
      SHIP,
    );
    expect(result.unknownModels.some((m) => m.includes('mystery-9'))).toBe(
      true,
    );
    expect(line(result, 'llm').every((l) => l.amountUsd === 0)).toBe(true);
  });

  it('applies 10s minimum on a 3s ring', () => {
    const result = priceAttempt(
      session({
        medium: 'sip',
        answeredAt: null,
        startedAt: '2026-08-01T10:00:00.000Z',
        endedAt: '2026-08-01T10:00:03.000Z',
      }),
      SHIP,
    );
    expect(result.billedMinutes).toBeCloseTo(10 / 60, 6);
    expect(line(result, 'sip')[0].quantity).toBeCloseTo(10 / 60, 6);
  });

  it('charges Krisp on SIP when enabled; skips on web', () => {
    const sip = priceAttempt(
      session({ medium: 'sip', krispEnabled: true }),
      SHIP,
    );
    expect(line(sip, 'krisp')[0].unitPriceUsd).toBe(0.0012);
    expect(line(sip, 'krisp')[0].amountUsd).toBe(0.0012);

    const web = priceAttempt(
      session({ medium: 'web', krispEnabled: true }),
      SHIP,
    );
    expect(line(web, 'krisp')).toHaveLength(0);
  });

  it('adds sip_vendor only when rate > 0', () => {
    const none = priceAttempt(session(), SHIP);
    expect(line(none, 'sip_vendor')).toHaveLength(0);
    const withVendor = priceAttempt(session(), {
      ...SHIP,
      sipVendorUsdPerMin: 0.008,
    });
    expect(line(withVendor, 'sip_vendor')[0].amountUsd).toBe(0.008);
  });

  it('records EOT at $0', () => {
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'eot_usage',
              provider: 'livekit',
              model: 'turn-detector-v1',
              totalRequests: 12,
            },
          ],
        },
      }),
      SHIP,
    );
    expect(line(result, 'eot')[0].amountUsd).toBe(0);
    expect(line(result, 'eot')[0].quantity).toBe(12);
  });

  it('uses scale STT/TTS/SIP discounts', () => {
    const scale: PriceRuntimeConfig = {
      plan: 'scale',
      agentDeployed: false,
      sipVendorUsdPerMin: 0,
    };
    const result = priceAttempt(
      session({
        usage: {
          models: [
            {
              type: 'stt_usage',
              provider: 'deepgram',
              model: 'nova-3',
              audioDurationMs: 60_000,
            },
            {
              type: 'tts_usage',
              provider: 'inworld',
              model: 'inworld/inworld-tts-2',
              charactersCount: 1_000_000,
            },
          ],
        },
      }),
      scale,
    );
    expect(line(result, 'stt')[0].unitPriceUsd).toBe(0.005);
    expect(line(result, 'tts')[0].unitPriceUsd).toBe(15);
    expect(line(result, 'sip')[0].unitPriceUsd).toBe(0.003);
  });

  it('does not invent STT when usage has no stt row', () => {
    const result = priceAttempt(session({ usage: { models: [] } }), SHIP);
    expect(line(result, 'stt')).toHaveLength(0);
  });
});

describe('mergeAttemptIntoSnapshot', () => {
  it('accumulates two attempts into totalUsd', () => {
    const a = priceAttempt(session({ attempt: 1 }), SHIP);
    const b = priceAttempt(session({ attempt: 2 }), SHIP);
    const snap = mergeAttemptIntoSnapshot(
      mergeAttemptIntoSnapshot(null, a, SHIP),
      b,
      SHIP,
    );
    expect(snap.attempts).toHaveLength(2);
    expect(snap.markup).toBe(0);
    expect(snap.totalUsd).toBeCloseTo(a.totalUsd + b.totalUsd, 6);
    expect(snap.billedMinutes).toBeCloseTo(2, 6);
  });
});
