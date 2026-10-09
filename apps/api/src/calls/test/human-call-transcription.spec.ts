import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HumanCallTranscriptionService } from '../services/human-call-transcription.service';
import {
  initializeHumanTranscription,
  humanTranscription,
  endHumanTranscription,
} from '../lib/human-transcription';
import { newCallRow } from '../lib/call-row';
import type { Call } from '../call.entity';
import type { HumanCallSession } from '../human-call-session.entity';
import { toCallResponse } from '../mappers/call-response.mapper';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HumanTranscriptionCheckpointDto } from '../dto/human-transcription.dto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InternalCallsController } from '../internal-calls.controller';
import { CallWorkerService } from '../services/call-worker.service';

function harness() {
  const call = newCallRow({
    id: randomUUID(),
    executionType: 'human',
    organizationId: randomUUID(),
    roomName: 'human-room',
  }) as Call;
  initializeHumanTranscription(call);
  const session = {
    callId: call.id,
    browserIdentity: 'browser',
    sipIdentity: 'contact',
    phase: 'connected',
    callerName: 'Caller',
    contactName: 'Contact',
    joinDeadline: new Date(),
    workspace: {},
  } as HumanCallSession;
  const repo = {
    mutate: jest.fn(async (_id, action) => action(call, session)),
    due: jest.fn().mockResolvedValue([{ id: call.id }]),
  };
  const price = {
    replaceCost: jest.fn(async () => {
      call.cost = { attempts: [{}] } as never;
    }),
  };
  const service = new HumanCallTranscriptionService(
    repo as never,
    { getOrThrow: () => 'test-only-worker-secret' } as never,
    price as never,
  );
  const start = () =>
    service.start(call.id, { roomName: call.roomName!, jobId: 'job-a' });
  const segment = (
    content = 'नमस्ते, hello',
    role: 'caller' | 'contact' = 'caller',
    at = new Date().toISOString(),
  ) => ({ id: randomUUID(), role, content, createdAt: at });
  return { call, session, repo, price, service, start, segment };
}
describe('human transcription persistence', () => {
  it('preserves the final transcript if cost calculation is temporarily unavailable', async () => {
    const h = harness(), { callbackToken } = await h.start();
    h.call.answeredAt = new Date(); h.call.endedAt = new Date();
    h.price.replaceCost.mockRejectedValueOnce(new Error('unavailable'));
    await h.service.finish(h.call.id, { jobId: 'job-a', callbackToken, segments: [h.segment()], audioDuration: 2, listenerDuration: 3, answered: true });
    expect(h.call.transcript).toHaveLength(1);
    expect(humanTranscription(h.call)?.status).toBe('complete');
  });
  it('claims one job, replays its start, and rejects another room/job', async () => {
    const h = harness(),
      first = await h.start();
    expect(await h.start()).toEqual(first);
    expect(first).toMatchObject({
      browserIdentity: 'browser',
      sipIdentity: 'contact',
    });
    expect(JSON.stringify(h.call.sessionReport)).not.toContain(
      first.callbackToken,
    );
    await expect(
      h.service.start(h.call.id, { roomName: 'foreign', jobId: 'job-a' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      h.service.start(h.call.id, { roomName: 'human-room', jobId: 'job-b' }),
    ).rejects.toThrow(ConflictException);
  });
  it('persists mixed-language finals, deduplicates retries, and keeps chronological speaker order', async () => {
    const h = harness(),
      { callbackToken } = await h.start();
    const earlier = h.segment(
        'हाँ, I agree',
        'contact',
        '2026-10-09T10:00:00Z',
      ),
      later = h.segment('Thank you', 'caller', '2026-10-09T10:00:01Z');
    const payload = {
      jobId: 'job-a',
      callbackToken,
      segments: [later, earlier],
      audioDuration: 12,
      listenerDuration: 10,
    };
    await h.service.checkpoint(h.call.id, payload);
    await h.service.checkpoint(h.call.id, { ...payload, audioDuration: 8 });
    expect(h.call.transcript).toEqual([earlier, later]);
    expect(humanTranscription(h.call)?.audioDuration).toBe(12);
    expect(h.call.usage?.models).toEqual([
      expect.objectContaining({ audioDurationMs: 12000 }),
    ]);
    expect(toCallResponse(h.call).transcript).toBeNull();
    h.call.answeredAt = new Date();
    h.call.endedAt = new Date();
    h.session.finishedAt = new Date();
    await h.service.finish(h.call.id, {
      ...payload,
      segments: [h.segment('Goodbye')],
      answered: true,
    });
    expect(humanTranscription(h.call)?.status).toBe('complete');
    expect(toCallResponse(h.call).transcript).toHaveLength(3);
    await h.service.finish(h.call.id, { ...payload, answered: true });
    expect(h.price.replaceCost).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid callback credentials without writing speech', async () => {
    const h = harness();
    await h.start();
    await expect(
      h.service.checkpoint(h.call.id, {
        jobId: 'job-a',
        callbackToken: 'x'.repeat(64),
        segments: [h.segment()],
        audioDuration: 0,
        listenerDuration: 0,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(h.call.transcript).toBeNull();
    await expect(
      h.service.checkpoint(h.call.id, {
        jobId: 'job-a',
        callbackToken: 'अ'.repeat(64),
        segments: [],
        audioDuration: 0,
        listenerDuration: 0,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
  it.each([false, true])(
    'records an STT failure with partial text=%s without changing call status',
    async (text) => {
      const h = harness(),
        { callbackToken } = await h.start();
      h.call.answeredAt = new Date();
      h.call.endedAt = new Date();
      h.call.status = 'completed';
      await h.service.finish(h.call.id, {
        jobId: 'job-a',
        callbackToken,
        segments: text ? [h.segment()] : [],
        audioDuration: 0,
        listenerDuration: 4,
        partial: true,
        answered: true,
      });
      expect(humanTranscription(h.call)?.status).toBe(
        text ? 'partial' : 'unavailable',
      );
      expect(h.call.status).toBe('completed');
    },
  );
  it('expires a lost worker and keeps existing speech', async () => {
    const h = harness();
    await h.start();
    h.call.transcript = [h.segment()];
    humanTranscription(h.call)!.heartbeatAt = new Date(
      Date.now() - 31000,
    ).toISOString();
    await h.service.tick();
    expect(humanTranscription(h.call)?.status).toBe('partial');
    expect(h.call.transcript).toHaveLength(1);
  });
  it('accepts ending-session finalization but rejects speech beyond the finalization window', async () => {
    const h = harness(),
      { callbackToken } = await h.start();
    h.call.answeredAt = new Date();
    endHumanTranscription(h.call);
    h.session.phase = 'ending';
    h.call.endedAt = new Date(Date.now() - 31000);
    const result = await h.service.finish(h.call.id, {
      jobId: 'job-a',
      callbackToken,
      segments: [h.segment()],
      audioDuration: 1,
      listenerDuration: 1,
      answered: true,
    });
    expect(result.stop).toBe(true);
    expect(h.call.transcript).toBeNull();
    expect(humanTranscription(h.call)?.status).toBe('unavailable');
  });
  it('marks unanswered sessions as not needing a transcript', async () => {
    const h = harness(),
      { callbackToken } = await h.start();
    await h.service.finish(h.call.id, {
      jobId: 'job-a',
      callbackToken,
      segments: [],
      audioDuration: 0,
      listenerDuration: 4,
      answered: false,
    });
    expect(humanTranscription(h.call)?.status).toBe('not_needed');
  });
  it('rejects malformed roles, timing, credentials and non-finite usage in DTO validation', async () => {
    const errors = await validate(
      plainToInstance(HumanTranscriptionCheckpointDto, {
        jobId: 'a',
        callbackToken: 'short',
        segments: [
          {
            id: 'invalid',
            role: 'assistant',
            content: '',
            createdAt: 'yesterday',
          },
        ],
        audioDuration: NaN,
        listenerDuration: -1,
      }),
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining([
        'callbackToken',
        'segments',
        'audioDuration',
        'listenerDuration',
      ]),
    );
  });
});

describe('human transcription HTTP boundary', () => {
  let app: INestApplication;
  const start = jest
    .fn()
    .mockResolvedValue({
      callbackToken: 'x'.repeat(64),
      browserIdentity: 'caller',
      sipIdentity: 'contact',
    });
  const checkpoint = jest.fn().mockResolvedValue({ ok: true });
  const id = randomUUID();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalCallsController],
      providers: [
        { provide: CallWorkerService, useValue: {} },
        {
          provide: HumanCallTranscriptionService,
          useValue: { start, checkpoint, finish: checkpoint },
        },
        { provide: ConfigService, useValue: { get: () => 'test-placeholder' } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('requires the worker secret and rejects invalid route IDs', async () => {
    const path = `/internal/calls/${id}/human/transcription/start`;
    await request(app.getHttpServer())
      .post(path)
      .send({ roomName: 'room', jobId: 'job' })
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .set('X-Worker-Secret', 'wrong')
      .send({ roomName: 'room', jobId: 'job' })
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .set('X-Worker-Secret', 'test-placeholder')
      .send({ roomName: 'room', jobId: 'job' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/internal/calls/invalid/human/transcription/start')
      .set('X-Worker-Secret', 'test-placeholder')
      .send({ roomName: 'room', jobId: 'job' })
      .expect(404);
  });
  it('validates final segments before invoking persistence', async () => {
    await request(app.getHttpServer())
      .post(`/internal/calls/${id}/human/transcription/checkpoint`)
      .set('X-Worker-Secret', 'test-placeholder')
      .send({
        jobId: 'job',
        callbackToken: 'x'.repeat(64),
        segments: [
          {
            id: randomUUID(),
            role: 'assistant',
            content: 'No',
            createdAt: new Date().toISOString(),
          },
        ],
        audioDuration: 0,
        listenerDuration: 0,
      })
      .expect(400);
    expect(checkpoint).not.toHaveBeenCalled();
  });
});
