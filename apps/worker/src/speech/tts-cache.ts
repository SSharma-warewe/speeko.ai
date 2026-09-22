import type { AgentJobMetadata } from '@call-agent/contracts';
import type { AudioFrame } from '@livekit/rtc-node';

export type CachedAudioFrame = AudioFrame;

export type TtsSynthesizer = {
  synthesize(text: string): AsyncIterable<{ frame?: CachedAudioFrame }>;
};

export type CachedSayOptions = {
  addToChatCtx?: boolean;
  allowInterruptions?: boolean;
};

export type CachedSaySession = {
  say: (text: string, options?: CachedSayOptions) => unknown;
};

const ttsCache = new Map<string, CachedAudioFrame[]>();

export function ttsCacheKey(meta: AgentJobMetadata, text: string): string {
  const model = meta.ttsModel ?? 'inworld/inworld-tts-2';
  const voice = meta.voice ?? 'default';
  const lang = meta.speechLanguage ?? 'default';
  const pace =
    typeof meta.speakingRate === 'number' && !Number.isNaN(meta.speakingRate)
      ? String(meta.speakingRate)
      : '';
  return `${model}|${voice}|${lang}|${pace}|${text}`;
}

export function getCachedFrames(key: string): CachedAudioFrame[] | undefined {
  return ttsCache.get(key);
}

export function clearTtsCache(): void {
  ttsCache.clear();
}

export function framesToStream(
  frames: CachedAudioFrame[],
): ReadableStream<CachedAudioFrame> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(frames[index++]);
      } else {
        controller.close();
      }
    },
  });
}

export async function ensureCached(
  tts: TtsSynthesizer,
  key: string,
  text: string,
): Promise<CachedAudioFrame[]> {
  const hit = ttsCache.get(key);
  if (hit) {
    return hit;
  }
  const frames: CachedAudioFrame[] = [];
  for await (const event of tts.synthesize(text)) {
    if (event?.frame !== undefined) {
      frames.push(event.frame);
    }
  }
  ttsCache.set(key, frames);
  return frames;
}

export async function warmTtsPhrases(
  tts: TtsSynthesizer | undefined,
  meta: AgentJobMetadata,
  phrases: string[],
): Promise<void> {
  if (!tts) {
    return;
  }
  await Promise.all(
    phrases.map(async (phrase) => {
      if (!phrase.trim()) {
        return;
      }
      try {
        await ensureCached(tts, ttsCacheKey(meta, phrase), phrase);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[agent] tts cache warm failed: ${message}`);
      }
    }),
  );
}

/**
 * On a hit, play cached frames (skips TTS). On a miss, say() as today and
 * fill the cache in the background so the next use is warm.
 */
export function sayCached(
  session: CachedSaySession,
  tts: TtsSynthesizer | undefined,
  text: string,
  options: {
    addToChatCtx?: boolean;
    allowInterruptions?: boolean;
  },
  meta: AgentJobMetadata,
): unknown {
  const key = ttsCacheKey(meta, text);
  const frames = ttsCache.get(key);
  // bind() keeps AgentSession as `this`. A detached session.say throws
  // "Cannot read properties of undefined (reading 'activity')".
  const say = session.say.bind(session) as (
    text: string,
    options?: CachedSayOptions & { audio?: ReadableStream<AudioFrame> },
  ) => unknown;
  if (frames && frames.length > 0) {
    console.log(`[agent] tts cache hit chars=${text.length}`);
    return say(text, { ...options, audio: framesToStream(frames) });
  }
  console.log(`[agent] tts cache miss chars=${text.length}`);
  const handle = say(text, options);
  if (tts) {
    void ensureCached(tts, key, text).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] tts cache fill failed: ${message}`);
    });
  }
  return handle;
}
