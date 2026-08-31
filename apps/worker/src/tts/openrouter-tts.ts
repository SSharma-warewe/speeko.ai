import {
  APIError,
  APIStatusError,
  tokenize,
  tts,
  type APIConnectOptions,
} from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { randomUUID } from 'node:crypto';

const SAMPLE_RATE = 24_000;
const NUM_CHANNELS = 1;
const FRAME_SAMPLES = 480; // 20 ms at 24 kHz
const FRAME_BYTES = FRAME_SAMPLES * 2;
const OPENROUTER_SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';

export type OpenRouterTtsOptions = {
  apiKey: string;
  model: string;
  voice: string;
  fetchImpl?: typeof fetch;
};

export class OpenRouterTts extends tts.TTS {
  readonly label = 'openrouter.TTS';
  readonly opts: OpenRouterTtsOptions;

  constructor(opts: OpenRouterTtsOptions) {
    super(SAMPLE_RATE, NUM_CHANNELS, { streaming: false });
    this.opts = opts;
  }

  override get model(): string {
    return this.opts.model;
  }

  override get provider(): string {
    return 'OpenRouter';
  }

  synthesize(
    text: string,
    connOptions?: Parameters<tts.TTS['synthesize']>[1],
    abortSignal?: AbortSignal,
  ): tts.ChunkedStream {
    return new OpenRouterChunkedStream(text, this, connOptions, abortSignal);
  }

  stream(options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    return new tts.StreamAdapter(
      this,
      new tokenize.basic.SentenceTokenizer(),
    ).stream(options);
  }
}

export class OpenRouterChunkedStream extends tts.ChunkedStream {
  readonly label = 'openrouter.ChunkedStream';
  #tts: OpenRouterTts;

  constructor(
    text: string,
    ttsInstance: OpenRouterTts,
    connOptions?: Parameters<tts.TTS['synthesize']>[1],
    abortSignal?: AbortSignal,
  ) {
    super(text, ttsInstance, connOptions, abortSignal);
    this.#tts = ttsInstance;
  }

  protected async run(): Promise<void> {
    const text = this.inputText.trim();
    if (!text) return;

    const requestId = randomUUID();
    const started = Date.now();
    let ttfbMs = -1;
    let bytes = 0;
    let pending = new Uint8Array(0);
    let aborted = false;

    const putFrame = (pcmBytes: Uint8Array, final: boolean) => {
      const copy = new ArrayBuffer(pcmBytes.byteLength);
      new Uint8Array(copy).set(pcmBytes);
      const data = new Int16Array(copy);
      this.queue.put({
        requestId,
        segmentId: requestId,
        frame: new AudioFrame(data, SAMPLE_RATE, NUM_CHANNELS, data.length),
        final,
      });
    };

    const flushPending = (final: boolean) => {
      while (pending.byteLength >= FRAME_BYTES) {
        putFrame(pending.subarray(0, FRAME_BYTES), false);
        pending = pending.subarray(FRAME_BYTES);
      }
      if (final) {
        const even = pending.byteLength - (pending.byteLength % 2);
        if (even > 0) {
          putFrame(pending.subarray(0, even), true);
        }
        pending = new Uint8Array(0);
      }
    };

    try {
      for await (const chunk of iterateOpenRouterPcm({
        apiKey: this.#tts.opts.apiKey,
        model: this.#tts.opts.model,
        voice: this.#tts.opts.voice,
        input: text,
        abortSignal: this.abortSignal,
        fetchImpl: this.#tts.opts.fetchImpl,
      })) {
        if (this.abortSignal.aborted) {
          aborted = true;
          return;
        }
        if (ttfbMs < 0) ttfbMs = Date.now() - started;
        bytes += chunk.byteLength;
        pending = concatBytes(pending, chunk);
        flushPending(false);
      }
      flushPending(true);
    } catch (err) {
      if (isAbortError(err) || this.abortSignal.aborted) {
        aborted = true;
        return;
      }
      throw err;
    } finally {
      console.log(
        `[tts] openrouter model=${this.#tts.opts.model} voice=${this.#tts.opts.voice} chars=${text.length} ttfbMs=${ttfbMs} durationMs=${Date.now() - started} bytes=${bytes} aborted=${aborted}`,
      );
    }
  }
}

export function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

export async function* iterateOpenRouterPcm(input: {
  apiKey: string;
  model: string;
  voice: string;
  input: string;
  abortSignal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): AsyncGenerator<Uint8Array<ArrayBuffer>, void, unknown> {
  if (input.abortSignal?.aborted) return;

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'audio/pcm',
      },
      body: JSON.stringify({
        model: input.model,
        input: input.input,
        voice: input.voice,
        response_format: 'pcm',
      }),
      signal: input.abortSignal,
    });
  } catch (err) {
    if (isAbortError(err) || input.abortSignal?.aborted) return;
    throw new APIError(`OpenRouter TTS request failed: ${String(err)}`, {
      retryable: true,
    });
  }

  if (!response.ok) {
    let body: object | null = null;
    try {
      const parsed: unknown = await response.json();
      body = parsed && typeof parsed === 'object' ? (parsed as object) : null;
    } catch {
      body = null;
    }
    throw new APIStatusError({
      message: `OpenRouter TTS HTTP ${response.status}`,
      options: {
        statusCode: response.status,
        body,
        retryable: response.status === 429 || response.status >= 500,
      },
    });
  }

  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) yield copyBytes(value);
      }
    } catch (err) {
      if (isAbortError(err) || input.abortSignal?.aborted) return;
      throw new APIError(`OpenRouter TTS stream failed: ${String(err)}`, {
        retryable: true,
      });
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }
    return;
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 0) yield new Uint8Array(buffer);
}

export async function synthesizeOpenRouterPcm(input: {
  apiKey: string;
  model: string;
  voice: string;
  input: string;
  abortSignal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ArrayBuffer> {
  let pending = new Uint8Array(0);
  for await (const chunk of iterateOpenRouterPcm(input)) {
    pending = concatBytes(pending, chunk);
  }
  const even = pending.byteLength - (pending.byteLength % 2);
  const copy = new ArrayBuffer(even);
  new Uint8Array(copy).set(pending.subarray(0, even));
  return copy;
}

function copyBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function concatBytes(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (right.byteLength === 0) return copyBytes(left);
  const out = new Uint8Array(left.byteLength + right.byteLength);
  if (left.byteLength > 0) out.set(left, 0);
  out.set(right, left.byteLength);
  return out;
}
