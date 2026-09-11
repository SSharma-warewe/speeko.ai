import {
  APIStatusError,
  AudioByteStream,
  DEFAULT_API_CONNECT_OPTIONS,
  stt,
  waitForAbort,
} from '@livekit/agents';
import type { APIConnectOptions, AudioBuffer } from '@livekit/agents';
import { type RawData, WebSocket } from 'ws';
import { toSarvamRealtimeLanguage } from './realtime-language.js';
import {
  applySarvamRealtimeMessage,
  closeErrorFromSarvamRealtime,
  createSarvamRealtimeSessionState,
} from './realtime-stt-events.js';

const SARVAM_STT_REALTIME_URL =
  'wss://api.sarvam.ai/speech-to-text-realtime/ws';
const REALTIME_MODEL = 'saaras:v3-realtime';
const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const AUDIO_CHUNK_MS = 50;

export type SarvamRealtimeSttOptions = {
  apiKey: string;
  language: string;
  streamType?: 'fast' | 'balanced' | 'simulated';
  mode?: 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix';
  endpointing?: 'vad' | 'manual';
  vadSotThreshold?: number;
  vadMinSpeechMs?: number;
  vadMinSilenceMs?: number;
};

export type ResolvedSarvamRealtimeSttOptions = {
  apiKey: string;
  language: string;
  streamType: 'fast' | 'balanced' | 'simulated';
  mode: 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix';
  endpointing: 'vad' | 'manual';
  vadSotThreshold: number;
  vadMinSpeechMs: number;
  vadMinSilenceMs: number;
};

/** Telephony starting point from Sarvam's LiveKit production guide. */
const TELEPHONY_DEFAULTS = {
  streamType: 'fast' as const,
  mode: 'transcribe' as const,
  endpointing: 'vad' as const,
  vadSotThreshold: 0.7,
  vadMinSpeechMs: 200,
  vadMinSilenceMs: 500,
};

export function resolveSarvamRealtimeSttOptions(
  opts: SarvamRealtimeSttOptions,
): ResolvedSarvamRealtimeSttOptions {
  return {
    apiKey: opts.apiKey,
    language: toSarvamRealtimeLanguage(opts.language),
    streamType: opts.streamType ?? TELEPHONY_DEFAULTS.streamType,
    mode: opts.mode ?? TELEPHONY_DEFAULTS.mode,
    endpointing: opts.endpointing ?? TELEPHONY_DEFAULTS.endpointing,
    vadSotThreshold: opts.vadSotThreshold ?? TELEPHONY_DEFAULTS.vadSotThreshold,
    vadMinSpeechMs: opts.vadMinSpeechMs ?? TELEPHONY_DEFAULTS.vadMinSpeechMs,
    vadMinSilenceMs: opts.vadMinSilenceMs ?? TELEPHONY_DEFAULTS.vadMinSilenceMs,
  };
}

export function buildSarvamRealtimeWsUrl(
  opts: ResolvedSarvamRealtimeSttOptions,
  baseUrl = SARVAM_STT_REALTIME_URL,
): string {
  const params = new URLSearchParams({
    language_code: opts.language,
    stream_type: opts.streamType,
    endpointing: opts.endpointing,
    encoding: 'linear16',
    sample_rate: String(SAMPLE_RATE),
    model: REALTIME_MODEL,
    mode: opts.mode,
  });
  if (opts.endpointing === 'vad') {
    params.set('threshold', String(opts.vadSotThreshold));
    params.set('min_speech_duration_ms', String(opts.vadMinSpeechMs));
    params.set('silence_duration_ms', String(opts.vadMinSilenceMs));
  }
  return `${baseUrl}?${params.toString()}`;
}

function noReconnect(connOptions?: APIConnectOptions): APIConnectOptions {
  return { ...(connOptions ?? DEFAULT_API_CONNECT_OPTIONS), maxRetry: 0 };
}

export class SarvamRealtimeSTT extends stt.STT {
  label = 'sarvam.STTRealtime';
  private opts: ResolvedSarvamRealtimeSttOptions;

  constructor(opts: SarvamRealtimeSttOptions) {
    super({ streaming: true, interimResults: true, alignedTranscript: false });
    this.opts = resolveSarvamRealtimeSttOptions(opts);
  }

  get model(): string {
    return REALTIME_MODEL;
  }

  get provider(): string {
    return 'Sarvam';
  }

  protected async _recognize(
    _frame: AudioBuffer,
    _abortSignal?: AbortSignal,
  ): Promise<stt.SpeechEvent> {
    throw new Error('Sarvam realtime STT only supports streaming');
  }

  stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new SarvamRealtimeSpeechStream(
      this,
      this.opts,
      noReconnect(options?.connOptions),
    );
  }
}

class SarvamRealtimeSpeechStream extends stt.SpeechStream {
  label = 'sarvam.RealtimeSpeechStream';
  #opts: ResolvedSarvamRealtimeSttOptions;

  constructor(
    sttInstance: SarvamRealtimeSTT,
    opts: ResolvedSarvamRealtimeSttOptions,
    connOptions: APIConnectOptions,
  ) {
    super(sttInstance, SAMPLE_RATE, connOptions);
    this.#opts = opts;
  }

  protected async run(): Promise<void> {
    const wsUrl = buildSarvamRealtimeWsUrl(this.#opts);
    const ws = new WebSocket(wsUrl, {
      headers: { 'API-SUBSCRIPTION-KEY': this.#opts.apiKey },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', (err: Error) => reject(err));
        ws.once('close', (code: number, reason: Buffer) => {
          reject(
            new APIStatusError({
              message: `Sarvam realtime STT WebSocket closed before open (${code}): ${reason}`,
              options: { statusCode: code, retryable: false },
            }),
          );
        });
      });
      await this.#runWs(ws);
    } finally {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  async #runWs(ws: WebSocket): Promise<void> {
    const state = createSarvamRealtimeSessionState(this.#opts.language);

    const put = (event: stt.SpeechEvent) => {
      if (!this.queue.closed) {
        try {
          this.queue.put(event);
        } catch {
          // stream already tearing down
        }
      }
    };

    const sendTask = async () => {
      const samplesPerChunk = Math.max(
        Math.floor((SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000),
        1,
      );
      const byteStream = new AudioByteStream(
        SAMPLE_RATE,
        NUM_CHANNELS,
        samplesPerChunk,
      );
      const abortPromise = waitForAbort(this.abortSignal);

      try {
        while (!this.closed) {
          const result = await Promise.race([this.input.next(), abortPromise]);
          if (result === undefined) return;
          if (result.done) break;

          const data = result.value;
          let frames;
          if (data === SarvamRealtimeSpeechStream.FLUSH_SENTINEL) {
            frames = byteStream.flush();
          } else {
            frames = byteStream.write(
              data.data.buffer.slice(
                data.data.byteOffset,
                data.data.byteOffset + data.data.byteLength,
              ) as ArrayBuffer,
            );
          }

          for (const frame of frames) {
            const pcm = Buffer.from(
              frame.data.buffer,
              frame.data.byteOffset,
              frame.data.byteLength,
            );
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(pcm);
            }
          }
        }
      } finally {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ event: 'end' }));
          } catch {
            // already closed
          }
        }
      }
    };

    const listenTask = new Promise<void>((resolve, reject) => {
      ws.on('message', (msg: RawData) => {
        let payload: unknown;
        try {
          payload = JSON.parse(msg.toString());
        } catch {
          return;
        }
        const action = applySarvamRealtimeMessage(state, payload);
        if (action.type === 'emit') {
          for (const event of action.events) put(event);
        } else if (action.type === 'fatal') {
          reject(
            new APIStatusError({
              message: action.message,
              options: {
                statusCode: action.statusCode,
                requestId: state.requestId || null,
                retryable: action.retryable,
              },
            }),
          );
        }
      });
      ws.once('close', (code: number, reason: Buffer) => {
        const action = closeErrorFromSarvamRealtime({
          code,
          reason: reason.toString(),
        });
        if (action.type === 'fatal') {
          reject(
            new APIStatusError({
              message: action.message,
              options: {
                statusCode: action.statusCode,
                requestId: state.requestId || null,
                retryable: action.retryable,
              },
            }),
          );
          return;
        }
        resolve();
      });
      ws.once('error', (err: Error) => reject(err));
    });

    try {
      await Promise.race([sendTask(), listenTask]);
    } finally {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }
}
