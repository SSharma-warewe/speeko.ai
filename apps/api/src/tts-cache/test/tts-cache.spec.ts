import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { TTS_CACHE_NAMESPACE } from '@call-agent/contracts';
import { WorkerSecretGuard } from '../../auth/guards/worker-secret.guard';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { TtsCacheService } from '../tts-cache.service';
import { TtsCacheRepository } from '../tts-cache.repository';
import { InternalTtsCacheController } from '../internal-tts-cache.controller';
import { decodeEnvelope } from '../tts-cache-envelope';
import { envelope } from './fixtures';

describe('API shared TTS authorization and safe envelopes', () => {
  const organizationId = randomUUID(),
    callId = randomUUID(),
    secret = 'fixture-worker-secret';
  const body = {
    roomName: 'fixture-room',
    digest: 'a'.repeat(64),
    namespace: TTS_CACHE_NAMESPACE,
  };
  const baseScope = {
    organization_id: organizationId,
    agent_org: organizationId,
    room_name: body.roomName,
    status: 'ready',
    execution_type: 'agent',
    org_active: true,
    org_agent_active: true,
    template_active: true,
    org_cache_enabled: true,
    template_cache_enabled: null,
    org_model: null,
    template_model: null,
  };
  let app: INestApplication, service: TtsCacheService;
  const repository = {
    run: jest.fn(),
    scope: jest.fn(),
    lookup: jest.fn(),
    publish: jest.fn(),
    cleanup: jest.fn(),
    storageStats: jest.fn(),
    databaseStats: {},
  };
  const config = new ConfigService({
    WORKER_CALLBACK_SECRET: secret,
    TTS_SHARED_CACHE_ENABLED: true,
    TTS_SHARED_CACHE_ORGANIZATION_IDS: organizationId,
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalTtsCacheController],
      providers: [
        TtsCacheService,
        WorkerSecretGuard,
        { provide: TtsCacheRepository, useValue: repository },
        { provide: ConfigService, useValue: config },
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
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    service = module.get(TtsCacheService);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    config.set('TTS_SHARED_CACHE_ENABLED', true);
    config.set('TTS_SHARED_CACHE_ORGANIZATION_IDS', organizationId);
    repository.run.mockImplementation((_write, action) => action({}));
    repository.scope.mockResolvedValue(baseScope);
    repository.lookup.mockResolvedValue(undefined);
    repository.publish.mockResolvedValue({ result: 'stored' });
  });
  afterAll(() => app.close());
  const post = (kind = 'lookup') =>
    request(app.getHttpServer())
      .post(`/internal/calls/${callId}/tts-cache/${kind}`)
      .set('X-Worker-Secret', secret);
  it.each([undefined, 'wrong'])(
    'requires a worker secret (%s)',
    async (provided) => {
      let req = request(app.getHttpServer()).post(
        `/internal/calls/${callId}/tts-cache/lookup`,
      );
      if (provided) req = req.set('X-Worker-Secret', provided);
      await req.send(body).expect(401);
      expect(repository.run).not.toHaveBeenCalled();
    },
  );
  it('derives the tenant from one verified scope and omits audio on a miss', async () => {
    const res = await post().send(body).expect(200);
    expect(res.body).toEqual({ hit: false });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(repository.scope).toHaveBeenCalledTimes(1);
    expect(repository.lookup).toHaveBeenCalledWith(
      {},
      organizationId,
      body.digest,
    );
  });
  it('rejects a supplied tenant id instead of trusting it', async () => {
    await post()
      .send({ ...body, organizationId: randomUUID() })
      .expect(400);
    expect(repository.lookup).not.toHaveBeenCalled();
  });
  it.each([
    { room_name: 'other-room' },
    { organization_id: null },
    { agent_org: randomUUID() },
    { org_active: false },
    { org_agent_active: false },
    { template_active: false },
    { agent_org: null },
    { execution_type: 'human' },
    { org_cache_enabled: false, template_cache_enabled: true },
    { org_cache_enabled: null, template_cache_enabled: null },
    { org_cache_enabled: null, template_cache_enabled: false },
    { org_model: 'openai/gpt-realtime-2.1' },
    { template_model: 'xai/grok-voice-think-fast-2.0' },
    ...['pending', 'completed', 'incomplete', 'cancelled', 'failed'].map(
      (status) => ({ status }),
    ),
  ])('denies invalid live scope %j', async (patch) => {
    repository.scope.mockResolvedValue({ ...baseScope, ...patch });
    await post().send(body).expect(403);
    await post('publish')
      .send({ ...body, envelope: envelope() })
      .expect(403);
    expect(repository.lookup).not.toHaveBeenCalled();
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each(['creating', 'dialing', 'ready'])(
    'allows eligible %s calls',
    async (status) => {
      repository.scope.mockResolvedValue({ ...baseScope, status });
      await post().send(body).expect(200);
    },
  );
  it('allows inherited true and pipeline model override of a realtime template', async () => {
    repository.scope.mockResolvedValue({
      ...baseScope,
      org_cache_enabled: null,
      template_cache_enabled: true,
      org_model: 'google/gemma-4-31b-it',
      template_model: 'openai/gpt-realtime-2.1',
    });
    await post().send(body).expect(200);
  });
  it('denies unknown or deleted calls', async () => {
    repository.scope.mockResolvedValue(undefined);
    await post().send(body).expect(404);
  });
  it.each([false, 'false'])('respects server opt-out (%s)', async (enabled) => {
    config.set('TTS_SHARED_CACHE_ENABLED', enabled);
    await post().send(body).expect(403);
  });
  it('denies tenants absent from the allowlist', async () => {
    config.set('TTS_SHARED_CACHE_ORGANIZATION_IDS', randomUUID());
    await post().send(body).expect(403);
  });
  it('treats database saturation as miss/skipped, without raising a call error', async () => {
    repository.run.mockResolvedValue(undefined);
    expect((await post().send(body)).body).toEqual({ hit: false });
    expect(
      (await post('publish').send({ ...body, envelope: envelope() })).body,
    ).toEqual({ result: 'skipped' });
  });
  it('returns a valid envelope and preserves immutable publication responses', async () => {
    const hit = {
      envelope: envelope(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    repository.lookup.mockResolvedValue(hit);
    expect((await post().send(body)).body).toEqual({ hit: true, ...hit });
    repository.publish.mockResolvedValue({ result: 'already_present' });
    expect(
      (await post('publish').send({ ...body, envelope: envelope() })).body,
    ).toEqual({ result: 'already_present' });
  });
  it.each([
    { checksum: 'f'.repeat(64) },
    { revision: 2 },
    { format: 'mp3' },
    { pcmBase64: '' },
    { sampleRate: 0 },
    { channels: 3 },
    { durationSeconds: 999 },
    { frames: [] },
    { userdata: { secret: 'fixture-private-data' } },
    {
      frames: [
        {
          samplesPerChannel: 240,
          timings: [{ text: 'fixture-private-data', startTime: 'invalid' }],
        },
      ],
    },
    {
      frames: Array.from({ length: 2049 }, () => ({
        samplesPerChannel: 1,
        timings: [],
      })),
    },
  ])('rejects unsafe envelope %j with redacted errors', async (patch) => {
    const res = await post('publish')
      .send({ ...body, envelope: { ...envelope(), ...patch } })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain('fixture-private-data');
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it('rejects oversized clips and nonfinite timing values before storage', () => {
    expect(() => decodeEnvelope(envelope(1, 360001))).toThrow(
      'Invalid TTS cache envelope',
    );
    const clip = envelope();
    clip.frames[0].timings[0].confidence = Infinity;
    expect(() => decodeEnvelope(clip)).toThrow('Invalid TTS cache envelope');
  });
  it('runs expiry cleanup even with sharing disabled', async () => {
    config.set('TTS_SHARED_CACHE_ENABLED', false);
    await service.cleanup();
    expect(repository.cleanup).toHaveBeenCalled();
  });
});
