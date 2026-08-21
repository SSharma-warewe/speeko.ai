import type { PricingPlan } from './price.types';

/** Date of the LiveKit public list prices copied into this file. */
export const PRICE_CATALOG_AS_OF = '2026-08-21';

export const DEFAULT_PRICING_PLAN: PricingPlan = 'ship';

type PlanRate = Record<PricingPlan, number>;

const all = (n: number): PlanRate => ({ build: n, ship: n, scale: n });

function pick(rate: PlanRate, plan: PricingPlan): number {
  return rate[plan];
}

/** Transport / room overage rates (USD / minute). */
export const TRANSPORT_RATES = {
  webrtc: { build: 0.0005, ship: 0.0005, scale: 0.0004 } satisfies PlanRate,
  sip: { build: 0.004, ship: 0.004, scale: 0.003 } satisfies PlanRate,
  agentSession: all(0.01),
  krisp: all(0.0012),
};

type LlmRate = { input: PlanRate; cached?: PlanRate; output: PlanRate };

/** USD per 1M tokens. Most LLM list prices do not differ by plan. */
const LLM_RATES: Record<string, LlmRate> = {
  'gemma-4-31b': {
    input: all(0.4),
    cached: all(0.2),
    output: all(1.2),
  },
  'deepseek-v4-pro': {
    input: all(1.74),
    cached: all(0.15),
    output: all(3.48),
  },
  'gemini-2.5-flash': {
    input: all(0.3),
    cached: all(0.03),
    output: all(2.5),
  },
  'gemini-2.5-flash-lite': {
    input: all(0.1),
    cached: all(0.01),
    output: all(0.4),
  },
  'gemini-2.5-pro': {
    input: all(2.5),
    cached: all(0.25),
    output: all(15),
  },
  'gemini-3-flash': {
    input: all(0.5),
    cached: all(0.05),
    output: all(3),
  },
  'gemini-3.1-flash-lite': {
    input: all(0.25),
    cached: all(0.025),
    output: all(1.5),
  },
  'gemini-3.5-flash-lite': { input: all(0.3), output: all(2.5) },
  'gemini-3.5-flash': {
    input: all(1.5),
    cached: all(0.15),
    output: all(9),
  },
  'gemini-3.6-flash': {
    input: all(1.5),
    cached: all(0.15),
    output: all(7.5),
  },
  'gemini-3.7-flash': {
    input: all(0.75),
    cached: all(0.075),
    output: all(3.75),
  },
  'gemini-3.1-pro': {
    input: all(4),
    cached: all(0.4),
    output: all(18),
  },
  'kimi-k2.6': { input: all(0.95), output: all(4) },
  'gpt-4.1': { input: all(2), cached: all(0.5), output: all(8) },
  'gpt-4.1-mini': { input: all(0.4), cached: all(0.1), output: all(1.6) },
  'gpt-4.1-nano': { input: all(0.1), cached: all(0.03), output: all(0.4) },
  'gpt-4o': { input: all(2.5), cached: all(1.25), output: all(10) },
  'gpt-4o-mini': { input: all(0.15), cached: all(0.075), output: all(0.6) },
  'gpt-5': { input: all(1.25), cached: all(0.13), output: all(10) },
  'gpt-5-mini': { input: all(0.25), cached: all(0.03), output: all(2) },
  'gpt-5-nano': { input: all(0.05), cached: all(0.01), output: all(0.4) },
  'gpt-5.1': { input: all(1.25), cached: all(0.13), output: all(10) },
  'gpt-5.2': { input: all(1.75), cached: all(0.18), output: all(14) },
  'gpt-5.4': { input: all(5), cached: all(0.5), output: all(22.5) },
  'gpt-5.4-mini': { input: all(0.75), cached: all(0.075), output: all(4.5) },
  'gpt-5.4-nano': { input: all(0.2), cached: all(0.02), output: all(1.25) },
  'gpt-5.5': { input: all(10), cached: all(1), output: all(45) },
  'gpt-5.6-sol': { input: all(5), cached: all(0.5), output: all(30) },
  'gpt-5.6-terra': { input: all(2), cached: all(0.2), output: all(12) },
  'gpt-5.6-luna': { input: all(0.2), cached: all(0.02), output: all(1.2) },
  'chatgpt-latest': { input: all(5), cached: all(0.5), output: all(30) },
  'gpt-oss-120b': { input: all(0.1), output: all(0.5) },
  'grok-4.20': { input: all(2), output: all(6) },
  'grok-4.20-reasoning': { input: all(2), output: all(6) },
  'grok-4.20-multi-agent': { input: all(2), output: all(6) },
  'grok-4.3': { input: all(1.25), cached: all(0.2), output: all(2.5) },
  'grok-4.5': { input: all(2), cached: all(0.5), output: all(6) },
};

/** USD per minute of STT connection. */
const STT_RATES: Record<string, PlanRate> = {
  'assemblyai-universal-3.5-pro': all(0.0075),
  'assemblyai-universal-3-pro': all(0.0075),
  'assemblyai-universal-streaming': all(0.0025),
  'assemblyai-universal-streaming-multilingual': all(0.0025),
  'cartesia-ink-whisper': { build: 0.003, ship: 0.003, scale: 0.0023 },
  'cartesia-ink-2': { build: 0.009, ship: 0.009, scale: 0.0068 },
  'deepgram-flux': { build: 0.0065, ship: 0.0065, scale: 0.0057 },
  'deepgram-flux-multilingual': { build: 0.0078, ship: 0.0078, scale: 0.0068 },
  'deepgram-nova-2': { build: 0.0058, ship: 0.0058, scale: 0.0047 },
  'deepgram-nova-2-conversational-ai': {
    build: 0.0058,
    ship: 0.0058,
    scale: 0.0047,
  },
  'deepgram-nova-2-medical': { build: 0.0058, ship: 0.0058, scale: 0.0047 },
  'deepgram-nova-2-phone-call': { build: 0.0058, ship: 0.0058, scale: 0.0047 },
  'deepgram-nova-3': { build: 0.0048, ship: 0.0048, scale: 0.0042 },
  'deepgram-nova-3-medical': { build: 0.0077, ship: 0.0077, scale: 0.0065 },
  'deepgram-nova-3-multilingual': { build: 0.0058, ship: 0.0058, scale: 0.005 },
  'elevenlabs-scribe-v2-realtime': all(0.0105),
  'speechmatics-enhanced': all(0.0117),
  'speechmatics-standard': all(0.005),
  'xai-stt': all(0.003333),
};

/** USD per 1M characters. */
const TTS_RATES: Record<string, PlanRate> = {
  'cartesia-sonic': { build: 50, ship: 50, scale: 37.5 },
  'deepgram-aura-2': { build: 30, ship: 30, scale: 27 },
  'deepgram-flux-tts': all(0),
  'elevenlabs-flash-v2': { build: 150, ship: 150, scale: 60 },
  'elevenlabs-flash-v2.5': { build: 150, ship: 150, scale: 60 },
  'elevenlabs-multilingual-v2': { build: 300, ship: 300, scale: 120 },
  'elevenlabs-turbo-v2': { build: 150, ship: 150, scale: 60 },
  'elevenlabs-turbo-v2.5': { build: 150, ship: 150, scale: 60 },
  'elevenlabs-v3': { build: 300, ship: 300, scale: 120 },
  'fish-s2-pro': all(15),
  'fish-s2.1-pro': all(15),
  'fish-s2.1-pro-free': all(0),
  'inworld-tts-2': { build: 25, ship: 25, scale: 15 },
  'inworld-tts-1.5-max': { build: 35, ship: 35, scale: 20 },
  'inworld-tts-1.5-mini': { build: 15, ship: 15, scale: 8 },
  'rime-coda': all(50),
  'rime-mist': { build: 30, ship: 30, scale: 20 },
  'xai-tts': all(15),
};

const LLM_ALIASES: Record<string, string> = {
  'google/gemma-4-31b-it': 'gemma-4-31b',
  'gemma-4-31b-it': 'gemma-4-31b',
  'gemma-4-31b': 'gemma-4-31b',
  'gemma 4 31b': 'gemma-4-31b',
  'livekit/gemma-4-31b-it': 'gemma-4-31b',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek/deepseek-v4-pro': 'deepseek-v4-pro',
  'google/gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'google/gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'google/gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'google/gemini-3-flash': 'gemini-3-flash',
  'gemini-3-flash': 'gemini-3-flash',
  'google/gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'google/gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
  'google/gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'google/gemini-3.6-flash': 'gemini-3.6-flash',
  'gemini-3.6-flash': 'gemini-3.6-flash',
  'google/gemini-3.7-flash': 'gemini-3.7-flash',
  'gemini-3.7-flash': 'gemini-3.7-flash',
  'google/gemini-3.1-pro': 'gemini-3.1-pro',
  'gemini-3.1-pro': 'gemini-3.1-pro',
  'moonshotai/kimi-k2.6': 'kimi-k2.6',
  'kimi-k2.6': 'kimi-k2.6',
  'openai/gpt-4.1': 'gpt-4.1',
  'gpt-4.1': 'gpt-4.1',
  'openai/gpt-4.1-mini': 'gpt-4.1-mini',
  'gpt-4.1-mini': 'gpt-4.1-mini',
  'openai/gpt-4.1-nano': 'gpt-4.1-nano',
  'gpt-4.1-nano': 'gpt-4.1-nano',
  'openai/gpt-4o': 'gpt-4o',
  'gpt-4o': 'gpt-4o',
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o-mini': 'gpt-4o-mini',
  'openai/gpt-5': 'gpt-5',
  'gpt-5': 'gpt-5',
  'openai/gpt-5-mini': 'gpt-5-mini',
  'gpt-5-mini': 'gpt-5-mini',
  'openai/gpt-5-nano': 'gpt-5-nano',
  'gpt-5-nano': 'gpt-5-nano',
  'openai/gpt-5.1': 'gpt-5.1',
  'gpt-5.1': 'gpt-5.1',
  'openai/gpt-5.2': 'gpt-5.2',
  'gpt-5.2': 'gpt-5.2',
  'openai/gpt-5.4': 'gpt-5.4',
  'gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.4-nano': 'gpt-5.4-nano',
  'gpt-5.4-nano': 'gpt-5.4-nano',
  'openai/gpt-5.5': 'gpt-5.5',
  'gpt-5.5': 'gpt-5.5',
  'openai/gpt-5.6-sol': 'gpt-5.6-sol',
  'gpt-5.6-sol': 'gpt-5.6-sol',
  'openai/gpt-5.6-terra': 'gpt-5.6-terra',
  'gpt-5.6-terra': 'gpt-5.6-terra',
  'openai/gpt-5.6-luna': 'gpt-5.6-luna',
  'gpt-5.6-luna': 'gpt-5.6-luna',
  'openai/chatgpt-latest': 'chatgpt-latest',
  'chatgpt-latest': 'chatgpt-latest',
  'openai/gpt-oss-120b': 'gpt-oss-120b',
  'gpt-oss-120b': 'gpt-oss-120b',
  'xai/grok-4.20': 'grok-4.20',
  'grok-4.20': 'grok-4.20',
  'xai/grok-4.20-reasoning': 'grok-4.20-reasoning',
  'grok-4.20-reasoning': 'grok-4.20-reasoning',
  'xai/grok-4.20-multi-agent': 'grok-4.20-multi-agent',
  'grok-4.20-multi-agent': 'grok-4.20-multi-agent',
  'xai/grok-4.3': 'grok-4.3',
  'grok-4.3': 'grok-4.3',
  'xai/grok-4.5': 'grok-4.5',
  'grok-4.5': 'grok-4.5',
};

const STT_ALIASES: Record<string, string> = {
  'deepgram/nova-3': 'deepgram-nova-3-multilingual',
  'nova-3': 'deepgram-nova-3-multilingual',
  'nova-3-multilingual': 'deepgram-nova-3-multilingual',
  'deepgram/nova-3-multilingual': 'deepgram-nova-3-multilingual',
  'deepgram-nova-3-multilingual': 'deepgram-nova-3-multilingual',
  'deepgram/nova-3-monolingual': 'deepgram-nova-3',
  'nova-3-monolingual': 'deepgram-nova-3',
  'deepgram-nova-3': 'deepgram-nova-3',
  'deepgram/nova-3-medical': 'deepgram-nova-3-medical',
  'nova-3-medical': 'deepgram-nova-3-medical',
  'deepgram/nova-2': 'deepgram-nova-2',
  'nova-2': 'deepgram-nova-2',
  'deepgram/nova-2-phonecall': 'deepgram-nova-2-phone-call',
  'deepgram/flux': 'deepgram-flux',
  'flux': 'deepgram-flux',
  'deepgram/flux-multilingual': 'deepgram-flux-multilingual',
  'assemblyai/universal-streaming': 'assemblyai-universal-streaming',
  'cartesia/ink-whisper': 'cartesia-ink-whisper',
  'cartesia/ink-2': 'cartesia-ink-2',
  'elevenlabs/scribe-v2-realtime': 'elevenlabs-scribe-v2-realtime',
  'xai/stt': 'xai-stt',
};

const TTS_ALIASES: Record<string, string> = {
  'inworld/inworld-tts-2': 'inworld-tts-2',
  'inworld-tts-2': 'inworld-tts-2',
  'inworld/tts-2': 'inworld-tts-2',
  'realtime tts 2.0': 'inworld-tts-2',
  'inworld/inworld-tts-1.5-max': 'inworld-tts-1.5-max',
  'inworld/inworld-tts-1.5-mini': 'inworld-tts-1.5-mini',
  'cartesia/sonic-3': 'cartesia-sonic',
  'cartesia/sonic-3.5': 'cartesia-sonic',
  'cartesia/sonic-2': 'cartesia-sonic',
  'sonic-3': 'cartesia-sonic',
  'sonic': 'cartesia-sonic',
  'deepgram/aura-2': 'deepgram-aura-2',
  'aura-2': 'deepgram-aura-2',
  'elevenlabs/eleven-flash-v2': 'elevenlabs-flash-v2',
  'elevenlabs/eleven-flash-v2.5': 'elevenlabs-flash-v2.5',
  'elevenlabs/eleven-multilingual-v2': 'elevenlabs-multilingual-v2',
  'elevenlabs/eleven-turbo-v2': 'elevenlabs-turbo-v2',
  'elevenlabs/eleven-turbo-v2.5': 'elevenlabs-turbo-v2.5',
  'elevenlabs/eleven-v3': 'elevenlabs-v3',
  'fish/s2-pro': 'fish-s2-pro',
  'fish/s2.1-pro': 'fish-s2.1-pro',
  'rime/coda': 'rime-coda',
  'rime/mist': 'rime-mist',
  'rime/mist-v2': 'rime-mist',
  'rime/mist-v3': 'rime-mist',
  'xai/tts': 'xai-tts',
};

export function normalizeModelKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ');
}

function canonicalKey(
  raw: string,
  aliases: Record<string, string>,
): string {
  const n = normalizeModelKey(raw);
  if (aliases[n]) return aliases[n];
  const noProvider = n.includes('/') ? n.slice(n.indexOf('/') + 1) : n;
  if (aliases[noProvider]) return aliases[noProvider];
  return n.replace(/\s+/g, '-');
}

export function displayModel(
  provider: string | undefined,
  model: string | undefined,
): string {
  const m = (model ?? '').trim();
  const p = (provider ?? '').trim();
  if (m && p && !m.toLowerCase().includes('/')) return `${p}/${m}`;
  return m || p || 'unknown';
}

export function resolveLlmRate(
  rawModel: string,
  plan: PricingPlan,
): { key: string; input: number; cached: number; output: number } | null {
  const key = canonicalKey(rawModel, LLM_ALIASES);
  const rate = LLM_RATES[key];
  if (!rate) return null;
  return {
    key,
    input: pick(rate.input, plan),
    cached: pick(rate.cached ?? rate.input, plan),
    output: pick(rate.output, plan),
  };
}

export function resolveSttRate(
  rawModel: string,
  plan: PricingPlan,
): { key: string; usdPerMinute: number } | null {
  const key = canonicalKey(rawModel, STT_ALIASES);
  const rate = STT_RATES[key];
  if (!rate) return null;
  return { key, usdPerMinute: pick(rate, plan) };
}

export function resolveTtsRate(
  rawModel: string,
  plan: PricingPlan,
): { key: string; usdPerMillionChars: number } | null {
  const key = canonicalKey(rawModel, TTS_ALIASES);
  const rate = TTS_RATES[key];
  if (!rate) return null;
  return { key, usdPerMillionChars: pick(rate, plan) };
}

export function resolveTransportRates(plan: PricingPlan): {
  webrtcUsdPerMinute: number;
  sipUsdPerMinute: number;
  agentSessionUsdPerMinute: number;
  krispUsdPerMinute: number;
} {
  return {
    webrtcUsdPerMinute: pick(TRANSPORT_RATES.webrtc, plan),
    sipUsdPerMinute: pick(TRANSPORT_RATES.sip, plan),
    agentSessionUsdPerMinute: pick(TRANSPORT_RATES.agentSession, plan),
    krispUsdPerMinute: pick(TRANSPORT_RATES.krisp, plan),
  };
}

export function parsePricingPlan(raw: string | undefined | null): PricingPlan {
  const n = (raw ?? '').trim().toLowerCase();
  if (n === 'build' || n === 'ship' || n === 'scale') return n;
  return DEFAULT_PRICING_PLAN;
}
