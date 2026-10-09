import { randomUUID } from 'node:crypto';
import { AutoSubscribe, stt, type JobContext } from '@livekit/agents';
import {
  AudioStream,
  DisconnectReason,
  RoomEvent,
  TrackKind,
  TrackSource,
  type RemoteTrack,
} from '@livekit/rtc-node';
import type {
  HumanTranscriptionJob,
  HumanTranscriptionSegment,
  HumanTranscriptionStarted,
} from '@call-agent/contracts';
import { WorkerApiClient } from '../callbacks/worker-api-client.js';
import {
  SarvamPluginSTT,
  resolveSarvamRealtimePluginUrl,
} from '../sarvam/plugin-stt.js';
import { Sipfunctions } from './sip-answer.js';

type Capture = { track: RemoteTrack; stop: () => void; done: Promise<void> };
type Role = HumanTranscriptionSegment['role'];

/** A room listener only: never creates AgentSession, publishes media, or changes SIP lifecycle. */
export class HumanTranscriptionJobRunner {
  private readonly client: WorkerApiClient;
  private authority!: HumanTranscriptionStarted;
  private readonly captures = new Map<Role, Capture>();
  private readonly drains = new Set<Promise<void>>();
  private readonly failedRoles = new Set<Role>();
  private readonly pending: HumanTranscriptionSegment[] = [];
  private sending?: Promise<void>;
  private stopping?: Promise<void>;
  private stopped = false;
  private answered = false;
  private partial = false;
  private expectedEnd = false;
  private audioDuration = 0;
  private connectedAt?: number;
  private disconnectedAt?: number;
  private scanTimer?: ReturnType<typeof setInterval>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly ctx: JobContext,
    private readonly meta: HumanTranscriptionJob,
    client?: WorkerApiClient,
  ) {
    this.client =
      client ??
      new WorkerApiClient({
        env: {
          ...process.env,
          COMPLETE_CALLBACK_TIMEOUT_MS: '2000',
          COMPLETE_CALLBACK_MAX_ATTEMPTS: '3',
          COMPLETE_CALLBACK_BACKOFF_MS: '250',
        },
      });
  }

  async run(): Promise<void> {
    if (this.ctx.job.room?.name !== this.meta.roomName)
      throw new Error('Human transcription room mismatch');
    const start = await this.post('start', {
      roomName: this.meta.roomName,
      jobId: this.ctx.job.id,
    });
    if (!start?.ok) {
      this.ctx.shutdown('transcription_unavailable');
      return;
    }
    this.authority = JSON.parse(start.text) as HumanTranscriptionStarted;
    this.ctx.addShutdownCallback(() => {
      if (!this.expectedEnd && this.answered) this.partial = true;
      return this.finish();
    });
    try {
      await this.ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);
      this.connectedAt = Date.now();
      this.ctx.room.on(RoomEvent.Disconnected, this.onDisconnected);
      this.ctx.room.on(RoomEvent.TrackSubscribed, this.scan);
      this.ctx.room.on(RoomEvent.ParticipantAttributesChanged, this.scan);
      this.scanTimer = setInterval(this.scan, 250);
      this.heartbeatTimer = setInterval(() => {
        void this.flush();
      }, 5000);
      this.scan();
    } catch {
      this.partial = true;
      await this.finish();
      this.ctx.shutdown('transcription_unavailable');
    }
  }

  private post(action: string, payload: unknown) {
    return this.client.postJson(
      `/api/internal/calls/${this.meta.callId}/human/transcription/${action}`,
      payload,
      `human transcription ${action}`,
      `callId=${this.meta.callId}`,
    );
  }

  private onDisconnected = (reason: DisconnectReason) => {
    this.disconnectedAt ??= Date.now();
    this.expectedEnd ||= reason === DisconnectReason.ROOM_DELETED;
    if (!this.expectedEnd && this.answered) this.partial = true;
    void this.finish();
  };
  private scan = () => {
    if (this.stopped) return;
    const sip = this.ctx.room.remoteParticipants.get(
      this.authority.sipIdentity,
    );
    if (sip && new Sipfunctions().isSipAnswered(sip)) this.answered = true;
    for (const [identity, role] of [
      [this.authority.browserIdentity, 'caller'],
      [this.authority.sipIdentity, 'contact'],
    ] as const) {
      const participant = this.ctx.room.remoteParticipants.get(identity);
      const publications = [
        ...(participant?.trackPublications.values() ?? []),
      ].filter(
        (pub) =>
          pub.kind === TrackKind.KIND_AUDIO &&
          (role === 'contact' || pub.source === TrackSource.SOURCE_MICROPHONE),
      );
      for (const pub of publications)
        if (!pub.subscribed) pub.setSubscribed(true);
      const track = publications.find((pub) => pub.track)?.track as
        RemoteTrack | undefined;
      const previous = this.captures.get(role);
      if (previous && previous.track !== track) {
        previous.stop();
        this.captures.delete(role);
      }
      if (
        this.answered &&
        track &&
        !this.captures.has(role) &&
        !this.failedRoles.has(role)
      )
        this.capture(role, track);
    }
  };

  private capture(role: Role, track: RemoteTrack) {
    const key = process.env.SARVAM_API_KEY?.trim();
    if (!key) {
      this.partial = true;
      this.failedRoles.add(role);
      return;
    }
    const provider = new SarvamPluginSTT({
      apiKey: key,
      url: resolveSarvamRealtimePluginUrl() ?? 'ws://127.0.0.1:8091/stt',
      language: 'auto',
      streamType: 'balanced',
      mode: 'codemix',
    });
    const stream = provider.stream();
    const reader = new AudioStream(track, {
      sampleRate: 16000,
      numChannels: 1,
    }).getReader();
    const startedAt = Date.now();
    let closed = false;
    let speechAt: number | undefined;
    const stop = () => {
      if (closed) return;
      closed = true;
      void reader.cancel().catch(() => {});
      try {
        stream.endInput();
      } catch {
        /* already ended */
      }
    };
    provider.on('error', () => {
      this.partial = true;
      this.failedRoles.add(role);
      stop();
    });
    const input = (async () => {
      try {
        while (!closed) {
          const frame = await reader.read();
          if (frame.done) break;
          if (!closed) stream.pushFrame(frame.value);
        }
      } catch {
        if (!closed) this.partial = true;
      } finally {
        stop();
      }
    })();
    const output = (async () => {
      try {
        for await (const event of stream) {
          if (event.type === stt.SpeechEventType.START_OF_SPEECH)
            speechAt = Date.now();
          if (event.type === stt.SpeechEventType.RECOGNITION_USAGE)
            this.audioDuration += Math.max(
              0,
              event.recognitionUsage?.audioDuration ?? 0,
            );
          if (event.type !== stt.SpeechEventType.FINAL_TRANSCRIPT) continue;
          const alternative = event.alternatives?.[0];
          if (!alternative?.text.trim()) continue;
          const timestamp =
            alternative.startTime > 0
              ? startedAt + alternative.startTime * 1000
              : (speechAt ?? Date.now());
          if (this.pending.length >= 1000) {
            this.partial = true;
            stop();
            break;
          }
          if (alternative.text.length > 8000) this.partial = true;
          this.pending.push({
            id: randomUUID(),
            role,
            content: alternative.text.slice(0, 8000),
            createdAt: new Date(timestamp).toISOString(),
          });
          speechAt = undefined;
          void this.flush();
        }
      } catch {
        this.partial = true;
        this.failedRoles.add(role);
      } finally {
        stop();
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = Promise.allSettled([input, output]).then(async () => {
      if (timer) clearTimeout(timer);
      stream.close();
      await provider.close();
    });
    // Track replacement and disconnect also bound a silent/stuck provider's drain.
    const boundedStop = () => {
      stop();
      timer ??= setTimeout(() => {
        this.partial = true;
        stream.close();
      }, 5000);
    };
    const capture = { track, stop: boundedStop, done };
    this.captures.set(role, capture);
    this.drains.add(done);
    void done
      .finally(() => {
        this.drains.delete(done);
        if (this.captures.get(role) === capture) this.captures.delete(role);
      })
      .catch(() => {
        this.partial = true;
      });
  }

  private payload(segments: HumanTranscriptionSegment[]) {
    return {
      jobId: this.ctx.job.id,
      callbackToken: this.authority.callbackToken,
      segments,
      audioDuration: this.audioDuration,
      listenerDuration: this.connectedAt
        ? ((this.disconnectedAt ?? Date.now()) - this.connectedAt) / 1000
        : 0,
      partial: this.partial,
    };
  }
  private flush(): Promise<void> {
    if (this.sending) return this.sending;
    if (this.stopped) return Promise.resolve();
    this.sending = (async () => {
      do {
        const batch = this.pending.slice(0, 10);
        const result = await this.post('checkpoint', this.payload(batch));
        if (!result?.ok) {
          this.partial = true;
          break;
        }
        this.pending.splice(0, batch.length);
        if ((JSON.parse(result.text) as { stop?: boolean }).stop) {
          this.expectedEnd = true;
          void this.finish();
          break;
        }
      } while (this.pending.length && !this.stopped);
    })()
      .catch(() => {
        this.partial = true;
      })
      .finally(() => {
        this.sending = undefined;
      });
    return this.sending;
  }
  finish(): Promise<void> {
    this.stopping ??= this.finishOnce();
    return this.stopping;
  }
  private async finishOnce() {
    this.disconnectedAt ??= Date.now();
    this.stopped = true;
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ctx.room.off(RoomEvent.Disconnected, this.onDisconnected);
    this.ctx.room.off(RoomEvent.TrackSubscribed, this.scan);
    this.ctx.room.off(RoomEvent.ParticipantAttributesChanged, this.scan);
    for (const capture of this.captures.values()) capture.stop();
    await Promise.allSettled([...this.drains]);
    if (this.sending) await this.sending;
    while (this.pending.length > 10) {
      const batch = this.pending.slice(0, 10);
      const result = await this.post('checkpoint', this.payload(batch));
      if (!result?.ok) {
        this.partial = true;
        break;
      }
      this.pending.splice(0, batch.length);
    }
    const segments = this.pending.slice(0, 10);
    if (this.pending.length > 10) this.partial = true;
    await this.post('finish', {
      ...this.payload(segments),
      answered: this.answered,
    });
    try {
      this.ctx.shutdown('human_transcription_finished');
    } catch {
      /* already shutting down */
    }
  }
}
