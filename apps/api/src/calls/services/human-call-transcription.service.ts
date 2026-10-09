import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  HumanTranscriptionCheckpoint,
  HumanTranscriptionFinish,
  HumanTranscriptionStart,
  HumanTranscriptionStarted,
} from '@call-agent/contracts';
import { HumanCallTranscriptionRepository } from '../human-call-transcription.repository';
import { humanTranscription } from '../lib/human-transcription';
import { PriceService } from '../../price/price.service';
import type { Call } from '../call.entity';
import type { HumanCallSession } from '../human-call-session.entity';

@Injectable()
export class HumanCallTranscriptionService {
  private readonly logger = new Logger(HumanCallTranscriptionService.name);
  private ticking = false;
  constructor(
    private readonly repo: HumanCallTranscriptionRepository,
    private readonly config: ConfigService,
    private readonly price: PriceService,
  ) {}
  private token(callId: string, jobId: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('WORKER_CALLBACK_SECRET'),
    )
      .update(JSON.stringify(['human_transcription', callId, jobId]))
      .digest('hex');
  }
  async start(
    id: string,
    input: HumanTranscriptionStart,
  ): Promise<HumanTranscriptionStarted> {
    return this.repo.mutate(id, (call, session) => {
      const state = humanTranscription(call);
      if (
        !state ||
        call.roomName !== input.roomName ||
        session.phase === 'ending' ||
        session.finishedAt ||
        (state.jobId && state.jobId !== input.jobId)
      )
        throw new ConflictException('Transcription job is not available');
      if (!['pending', 'running'].includes(state.status))
        throw new ConflictException('Transcription has ended');
      state.jobId = input.jobId;
      state.status = 'running';
      state.startedAt ??= new Date().toISOString();
      state.heartbeatAt = new Date().toISOString();
      return {
        callbackToken: this.token(id, input.jobId),
        browserIdentity: session.browserIdentity,
        sipIdentity: session.sipIdentity,
      };
    });
  }
  checkpoint(id: string, input: HumanTranscriptionCheckpoint) {
    return this.write(id, input);
  }
  finish(id: string, input: HumanTranscriptionFinish) {
    return this.write(id, input, true);
  }
  private write(
    id: string,
    input: HumanTranscriptionCheckpoint | HumanTranscriptionFinish,
    finish = false,
  ) {
    return this.repo.mutate(id, async (call, session) => {
      const state = humanTranscription(call);
      const expected = this.token(id, input.jobId);
      const providedBytes = Buffer.from(input.callbackToken);
      const expectedBytes = Buffer.from(expected);
      if (
        !state ||
        state.jobId !== input.jobId ||
        providedBytes.length !== expectedBytes.length ||
        !timingSafeEqual(providedBytes, expectedBytes)
      )
        throw new ForbiddenException('Invalid transcription job');
      if (
        ['complete', 'partial', 'unavailable', 'not_needed'].includes(
          state.status,
        )
      )
        return { ok: true, stop: true };
      const ended = call.endedAt ?? session.cleanupStartedAt;
      if (ended && Date.now() - ended.getTime() > 30000) {
        await this.expire(call);
        return { ok: true, stop: true };
      }
      const segments = new Map(
        (call.transcript ?? []).map((segment) => [segment.id, segment]),
      );
      for (const segment of input.segments) {
        if (!segment.content.trim()) continue;
        if (!segments.has(segment.id)) segments.set(segment.id, { ...segment });
      }
      call.transcript = [...segments.values()].sort(
        (a, b) =>
          Date.parse(String(a.createdAt)) - Date.parse(String(b.createdAt)) ||
          String(a.id).localeCompare(String(b.id)),
      );
      state.heartbeatAt = new Date().toISOString();
      state.partial ||= input.partial === true;
      state.audioDuration = Math.max(state.audioDuration, input.audioDuration);
      state.listenerDuration = Math.max(
        state.listenerDuration,
        input.listenerDuration,
      );
      call.usage = {
        ...call.usage,
        models: [
          {
            type: 'stt_usage',
            provider: 'sarvam',
            model: 'saaras:v3-realtime',
            audioDurationMs: state.audioDuration * 1000,
          },
        ],
      };
      if (finish) {
        const answered =
          !!call.answeredAt || (input as HumanTranscriptionFinish).answered;
        state.status = !answered
          ? 'not_needed'
          : state.partial
            ? call.transcript.length
              ? 'partial'
              : 'unavailable'
            : 'complete';
        state.finishedAt = new Date().toISOString();
        if (call.endedAt) await this.reprice(call);
      }
      return {
        ok: true,
        stop: finish || session.phase === 'ending' || !!session.finishedAt,
      };
    });
  }
  private async expire(call: Call) {
    const state = humanTranscription(call)!;
    state.status =
      !call.answeredAt && call.endedAt
        ? 'not_needed'
        : call.transcript?.length
          ? 'partial'
          : 'unavailable';
    state.finishedAt = new Date().toISOString();
    if (call.endedAt) await this.reprice(call);
  }
  private async reprice(call: Call) {
    try { await this.price.replaceCost(call); }
    catch { this.logger.warn(`Human transcription pricing unavailable call=${call.id}`); }
  }
  @Interval(5000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const row of await this.repo.due())
        await this.repo.mutate(
          row.id,
          async (call, session: HumanCallSession) => {
            const state = humanTranscription(call);
            if (
              !state ||
              !['pending', 'running', 'finalizing'].includes(state.status)
            )
              return;
            const ended = call.endedAt ?? session.cleanupStartedAt;
            if (
              Date.now() - Date.parse(state.heartbeatAt) > 30000 ||
              (ended && Date.now() - ended.getTime() > 30000)
            )
              await this.expire(call);
          },
        );
    } catch {
      this.logger.warn('Human transcription supervision unavailable');
    } finally {
      this.ticking = false;
    }
  }
}
