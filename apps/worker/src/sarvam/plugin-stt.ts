import {
  APIStatusError,
  AudioByteStream,
  DEFAULT_API_CONNECT_OPTIONS,
  stt,
  waitForAbort,
} from '@livekit/agents';
import type { APIConnectOptions, AudioBuffer } from '@livekit/agents';
import { type RawData, WebSocket } from 'ws';
import {
  applyPluginSttWireEvent,
  createPluginSttReorderState,
} from './plugin-stt-events.js';
import { toSarvamRealtimeLanguage } from './realtime-language.js';
import { TELEPHONY_DEFAULTS } from './realtime-stt.js';

export const DEFAULT_SARVAM_STT_PLUGIN_URL = 'ws://127.0.0.1:8091/stt';
const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const AUDIO_CHUNK_MS = 50;
const REALTIME_MODEL = 'saaras:v3-realtime';

export type SarvamPluginSttOptions = {
  url: string;
  language: string;
  streamType?: 'fast' | 'balanced' | 'simulated';
};

export function resolveSarvamRealtimePluginUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.SARVAM_STT_PLUGIN_URL?.trim();
  return raw || null;
}

export function buildSarvamPluginSttWsUrl(
  opts: SarvamPluginSttOptions,
): string {
  const base = opts.url.trim();
  const url = new URL(base);
  url.searchParams.set(
    'language',
    toSarvamRealtimeLanguage(opts.language),
  );
  url.searchParams.set(
    'stream_type',
    opts.streamType ?? TELEPHONY_DEFAULTS.streamType,
  );
  url.searchParams.set(
    'vad_min_silence_ms',
    String(TELEPHONY_DEFAULTS.vadMinSilenceMs),
  );
  url.searchParams.set(
    'vad_min_speech_ms',
    String(TELEPHONY_DEFAULTS.vadMinSpeechMs),
  );
  url.searchParams.set(
    'vad_sot_threshold',
    String(TELEPHONY_DEFAULTS.vadSotThreshold),
  );
  return url.toString();
}

function noReconnect(connOptions?: APIConnectOptions): APIConnectOptions {
  return { ...(connOptions ?? DEFAULT_API_CONNECT_OPTIONS), maxRetry: 0 };
}

export class SarvamPluginSTT extends stt.STT {
  label = 'sarvam.STTRealtime.python';
  private opts: Required<Pick<SarvamPluginSttOptions, 'streamType'>> &
    SarvamPluginSttOptions;

  constructor(opts: SarvamPluginSttOptions) {
    super({ streaming: true, interimResults: true, alignedTranscript: false });
    this.opts = {
      url: opts.url,
      language: opts.language,
      streamType: opts.streamType ?? 'fast',
    };
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
    return new SarvamPluginSpeechStream(
      this,
      this.opts,
      noReconnect(options?.connOptions),
    );
  }
}

class SarvamPluginSpeechStream extends stt.SpeechStream {
  label = 'sarvam.PythonRealtimeSpeechStream';
  #opts: Required<Pick<SarvamPluginSttOptions, 'streamType'>> &
    SarvamPluginSttOptions;

  constructor(
    sttInstance: SarvamPluginSTT,
    opts: Required<Pick<SarvamPluginSttOptions, 'streamType'>> &
      SarvamPluginSttOptions,
    connOptions: APIConnectOptions,
  ) {
    super(sttInstance, SAMPLE_RATE, connOptions);
    this.#opts = opts;
  }

  protected async run(): Promise<void> {
    const wsUrl = buildSarvamPluginSttWsUrl(this.#opts);
    const ws = new WebSocket(wsUrl);

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', (err: Error) => reject(err));
        ws.once('close', (code: number, reason: Buffer) => {
          reject(
            new APIStatusError({
              message: `Sarvam Python STT plugin closed before open (${code}): ${reason}`,
              options: { statusCode: code, retryable: false },
            }),
          );
        });
      });
      await this.#runWs(ws);
    } finally {
      ws.removeAllListeners();
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
  }

  async #runWs(ws: WebSocket): Promise<void> {
    const state = createPluginSttReorderState(
      toSarvamRealtimeLanguage(this.#opts.language),
    );

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
          if (data === SarvamPluginSpeechStream.FLUSH_SENTINEL) {
            frames = byteStream.flush();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: 'flush' }));
            }
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
        const action = applyPluginSttWireEvent(state, payload);
        if (action.type === 'emit') {
          for (const event of action.events) put(event);
        } else if (action.type === 'fatal') {
          reject(
            new APIStatusError({
              message: action.message,
              options: {
                statusCode: -1,
                requestId: state.requestId || null,
                retryable: action.retryable,
              },
            }),
          );
        }
      });
      ws.once('close', () => resolve());
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
