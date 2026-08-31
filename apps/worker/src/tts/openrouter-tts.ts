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
    const pcm = await synthesizeOpenRouterPcm({
      apiKey: this.#tts.opts.apiKey,
      model: this.#tts.opts.model,
      voice: this.#tts.opts.voice,
      input: this.inputText,
      abortSignal: this.abortSignal,
      fetchImpl: this.#tts.opts.fetchImpl,
    });
    const requestId = randomUUID();
    const samples = pcmToInt16(pcm);
    for (let offset = 0; offset < samples.length; offset += FRAME_SAMPLES) {
      const slice = samples.subarray(
        offset,
        Math.min(offset + FRAME_SAMPLES, samples.length),
      );
      const data = new Int16Array(slice);
      const frame = new AudioFrame(
        data,
        SAMPLE_RATE,
        NUM_CHANNELS,
        data.length,
      );
      this.queue.put({
        requestId,
        segmentId: requestId,
        frame,
        final: offset + FRAME_SAMPLES >= samples.length,
      });
    }
  }
}

export async function synthesizeOpenRouterPcm(input: {
  apiKey: string;
  model: string;
  voice: string;
  input: string;
  abortSignal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ArrayBuffer> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
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

  return response.arrayBuffer();
}

function pcmToInt16(buffer: ArrayBuffer): Int16Array {
  const bytes = new Uint8Array(buffer);
  const evenLength = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new ArrayBuffer(evenLength);
  new Uint8Array(copy).set(bytes.subarray(0, evenLength));
  return new Int16Array(copy);
}
