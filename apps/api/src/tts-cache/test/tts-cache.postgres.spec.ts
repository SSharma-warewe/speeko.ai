import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { TTS_CACHE_NAMESPACE } from '@call-agent/contracts';
import {
  securityDatabase,
  securityDatabaseUrl,
} from '../../common/test/api-security-database';
import { Organization } from '../../organizations/organization.entity';
import { Agent } from '../../agents/agent.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { Call } from '../../calls/call.entity';
import { newCallRow } from '../../calls/lib/call-row';
import { TtsCacheDatabase } from '../tts-cache-database';
import { TtsCacheRepository, TTS_CACHE_LOCK } from '../tts-cache.repository';
import { TtsCacheService } from '../tts-cache.service';
import { TtsCacheModule } from '../tts-cache.module';
import { TtsCacheEntry } from '../tts-cache-entry.entity';
import { decodeEnvelope } from '../tts-cache-envelope';
import { envelope } from './fixtures';
import { AgentsRepository } from '../../agents/agents.repository';
import { OrganizationAgentsRepository } from '../../agents/organization-agents.repository';
import { AgentsService } from '../../agents/agents.service';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { OrganizationIntegration } from '../../organization-integrations/organization-integration.entity';
import { AgentsController } from '../../agents/agents.controller';
import { OrganizationAgentsController } from '../../agents/organization-agents.controller';
import { UserOrganizationAgentsController } from '../../agents/user-organization-agents.controller';
import { InternalTtsCacheController } from '../internal-tts-cache.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkerSecretGuard } from '../../auth/guards/worker-secret.guard';

(securityDatabaseUrl ? describe : describe.skip)(
  'Shared TTS storage with isolated PostgreSQL',
  () => {
    let db: DataSource,
      connect: () => Promise<DataSource>,
      cacheDb: TtsCacheDatabase,
      otherDb: TtsCacheDatabase,
      repository: TtsCacheRepository,
      other: TtsCacheRepository,
      service: TtsCacheService;
    const orgId = randomUUID(),
      foreignOrg = randomUUID(),
      agentId = randomUUID(),
      templateId = randomUUID(),
      callId = randomUUID(),
      otherCall = randomUUID();
    const digest = 'a'.repeat(64),
      clip = envelope();
    const body = {
      roomName: 'cache-fixture',
      digest,
      namespace: TTS_CACHE_NAMESPACE,
    };
    const config = new ConfigService({
      WORKER_CALLBACK_SECRET: 'fixture-worker-secret',
      TTS_SHARED_CACHE_ENABLED: true,
      TTS_SHARED_CACHE_ORGANIZATION_IDS: `${orgId},${foreignOrg}`,
    });
    const inTransaction = async <T>(action: (r: QueryRunner) => Promise<T>) => {
      const r = db.createQueryRunner();
      await r.connect();
      await r.startTransaction();
      try {
        const result = await action(r);
        await r.commitTransaction();
        return result;
      } catch (e) {
        await r.rollbackTransaction();
        throw e;
      } finally {
        await r.release();
      }
    };
    const publish = (key = digest, audio = clip) =>
      repository.run(true, (r) => repository.publish(r, orgId, key, audio));
    beforeAll(async () => {
      const fixture = await securityDatabase('tts_cache_test');
      db = fixture.db;
      connect = fixture.connect;
      cacheDb = new TtsCacheDatabase(db);
      otherDb = new TtsCacheDatabase(db);
      repository = new TtsCacheRepository(cacheDb);
      other = new TtsCacheRepository(otherDb);
      service = new TtsCacheService(repository, config);
      const warm = await repository.run(true, async (r) => {
        await r.query('SELECT 1');
        return true;
      });
      if (!warm) throw new Error(JSON.stringify(cacheDb.stats));
      await other.run(true, (r) => r.query('SELECT 1'));
    }, 90000);
    afterAll(async () => {
      await cacheDb?.onModuleDestroy();
      await otherDb?.onModuleDestroy();
      await db?.destroy();
    });
    beforeEach(async () => {
      await db.query(
        'TRUNCATE TABLE tts_cache_test.organizations, tts_cache_test.agents CASCADE',
      );
      await db.getRepository(Organization).save([
        { id: orgId, name: 'Cache A', slug: 'cache-a' },
        { id: foreignOrg, name: 'Cache B', slug: 'cache-b' },
      ]);
      await db.getRepository(Agent).save({
        id: templateId,
        key: 'tts-fixture',
        ttsCacheEnabled: true,
        name: 'Fixture',
        direction: 'outbound',
        systemPrompt: 'Fixture',
      });
      await db.getRepository(OrganizationAgent).save({
        id: agentId,
        organizationId: orgId,
        agentId: templateId,
        name: 'Fixture',
        slug: 'fixture',
        systemPrompt: 'Fixture',
      });
      await db.getRepository(Call).save([
        newCallRow({
          id: callId,
          organizationId: orgId,
          organizationAgentId: agentId,
          agentId: templateId,
          direction: 'outbound',
          roomName: body.roomName,
          status: 'ready',
        }),
        newCallRow({
          id: otherCall,
          organizationId: foreignOrg,
          organizationAgentId: null,
          direction: 'outbound',
          roomName: 'foreign-room',
          status: 'ready',
        }),
      ]);
    });
    it('reuses immutable audio across calls in one tenant and keeps original expiry', async () => {
      expect(
        await service.publish(callId, { ...body, envelope: clip }),
      ).toEqual({ result: 'stored' });
      const first = await service.lookup(callId, body);
      expect(first.hit).toBe(true);
      expect(await publish(digest, envelope(99))).toEqual({
        result: 'already_present',
      });
      const second = await service.lookup(callId, body);
      expect(second).toEqual(first);
      const next = await db.getRepository(Call).save(
        newCallRow({
          organizationId: orgId,
          organizationAgentId: agentId,
          agentId: templateId,
          direction: 'outbound',
          roomName: 'second-room',
          status: 'ready',
        }),
      );
      expect(
        await service.lookup(next.id!, { ...body, roomName: 'second-room' }),
      ).toEqual(first);
      const row = await db
        .getRepository(TtsCacheEntry)
        .findOneByOrFail({ organizationId: orgId, digest });
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(
        86390000,
      );
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThan(
        86410000,
      );
    });
    it('same digests in other tenants never expose audio', async () => {
      await publish();
      expect(
        await repository.run(false, (r) =>
          repository.lookup(r, foreignOrg, digest),
        ),
      ).toBeUndefined();
      expect(
        await repository.run(true, (r) =>
          repository.publish(r, foreignOrg, digest, envelope(99)),
        ),
      ).toEqual({ result: 'stored' });
      const hit = await repository.run(false, (r) =>
        repository.lookup(r, orgId, digest),
      );
      expect(hit?.envelope.pcmBase64).toBe(clip.pcmBase64);
    });
    it('checks live scope and revocation without returning stored audio', async () => {
      await publish();
      await db.getRepository(Organization).update(orgId, { isActive: false });
      await expect(service.lookup(callId, body)).rejects.toThrow(
        'Shared TTS cache is unavailable',
      );
      await db.getRepository(Organization).update(orgId, { isActive: true });
      await db
        .getRepository(Call)
        .update(callId, { organizationAgentId: null });
      await expect(
        service.publish(callId, { ...body, envelope: clip }),
      ).rejects.toThrow('Shared TTS cache is unavailable');
      await expect(
        service.lookup(otherCall, { ...body, roomName: 'foreign-room' }),
      ).rejects.toThrow('Shared TTS cache is unavailable');
    });
    it('competing replicas keep one complete winner', async () => {
      const results = await Promise.all([
        publish(),
        other.run(true, (r) => other.publish(r, orgId, digest, envelope(99))),
      ]);
      expect(results.some((r) => r?.result === 'stored')).toBe(true);
      expect(await db.getRepository(TtsCacheEntry).count()).toBe(1);
      expect(
        results.every((r) =>
          ['stored', 'skipped', 'already_present'].includes(r?.result ?? ''),
        ),
      ).toBe(true);
      const result = await publish(digest, envelope(123));
      expect(result?.result).toBe('already_present');
    });
    it('expired entries miss and can be refilled without stale audio', async () => {
      await publish();
      await db
        .getRepository(TtsCacheEntry)
        .update({ digest }, { expiresAt: new Date(0) });
      expect(await service.lookup(callId, body)).toEqual({ hit: false });
      expect(await publish(digest, envelope(99))).toEqual({ result: 'stored' });
      const hit = await service.lookup(callId, body);
      expect(hit.hit && hit.envelope.pcmBase64).toBe(envelope(99).pcmBase64);
    });
    it('enforces byte/count limits and evicts the oldest tenant then global entries', async () => {
      const size = decodeEnvelope(clip).bytes;
      const policy = {
        tenantBytes: size * 2,
        globalBytes: size * 3,
        tenantEntries: 2,
        globalEntries: 3,
      };
      const write = (org: string, key: string) =>
        inTransaction((r) =>
          repository.publish(r, org, key.repeat(64), clip, policy),
        );
      await write(orgId, 'a');
      await write(orgId, 'b');
      await write(orgId, 'c');
      expect(
        await db
          .getRepository(TtsCacheEntry)
          .findOneBy({ digest: 'a'.repeat(64) }),
      ).toBeNull();
      await write(foreignOrg, 'd');
      await write(foreignOrg, 'e');
      const rows = await db.getRepository(TtsCacheEntry).find();
      expect(rows).toHaveLength(3);
      expect(
        rows.reduce((n, r) => n + r.accountedBytes, 0),
      ).toBeLessThanOrEqual(policy.globalBytes);
      expect(rows.filter((r) => r.organizationId === foreignOrg).length).toBe(
        2,
      );
    });
    it('concurrent publication cannot overrun a one-entry budget', async () => {
      const policy = {
        tenantBytes: decodeEnvelope(clip).bytes,
        globalBytes: decodeEnvelope(clip).bytes,
        tenantEntries: 1,
        globalEntries: 1,
      };
      await Promise.all([
        repository.run(true, (r) =>
          repository.publish(r, orgId, digest, clip, policy),
        ),
        other.run(true, (r) =>
          other.publish(r, foreignOrg, 'b'.repeat(64), clip, policy),
        ),
      ]);
      expect(await db.getRepository(TtsCacheEntry).count()).toBe(1);
    });
    it('busy publication/cleanup skip, while reads do not wait for the advisory lock', async () => {
      await publish();
      const connection = await connect();
      const r = connection.createQueryRunner();
      await r.connect();
      await r.startTransaction();
      try {
        await r.query('SELECT pg_advisory_xact_lock($1, $2)', [
          ...TTS_CACHE_LOCK,
        ]);
        expect(await publish('b'.repeat(64))).toEqual({ result: 'skipped' });
        expect((await service.lookup(callId, body)).hit).toBe(true);
        await other.cleanup();
      } finally {
        await r.rollbackTransaction();
        await r.release();
        await connection.destroy();
      }
    });
    it('rollback restores evicted entries and removes failed publication', async () => {
      await publish();
      const policy = {
        tenantBytes: decodeEnvelope(clip).bytes,
        globalBytes: decodeEnvelope(clip).bytes,
        tenantEntries: 1,
        globalEntries: 1,
      };
      const result = await repository.run(true, async (r) => {
        await repository.publish(r, orgId, 'b'.repeat(64), clip, policy);
        throw new Error('Forced failure');
      });
      expect(result).toBeUndefined();
      const rows = await db.getRepository(TtsCacheEntry).find();
      expect(rows.map((r) => r.digest)).toEqual([digest]);
      expect(await publish('b'.repeat(64))).toEqual({ result: 'stored' });
    });
    it('cleanup is replica-safe and tenant deletion cascades cached audio', async () => {
      await publish();
      await db
        .getRepository(TtsCacheEntry)
        .update({ digest }, { expiresAt: new Date(0) });
      await Promise.all([repository.cleanup(), other.cleanup()]);
      expect(await db.getRepository(TtsCacheEntry).count()).toBe(0);
      await publish();
      await db.getRepository(Organization).delete(orgId);
      expect(await db.getRepository(TtsCacheEntry).count()).toBe(0);
    });
    it('rejects malformed stored audio as a miss', async () => {
      await publish();
      await db.query('UPDATE tts_cache_entries SET checksum = $1', [
        'f'.repeat(64),
      ]);
      expect(await service.lookup(callId, body)).toEqual({ hit: false });
    });
    it('database saturation skips extra operations and timed-out queries release the pool', async () => {
      let done!: () => void;
      const barrier = new Promise<void>((resolve) => {
        done = resolve;
      });
      const a = cacheDb.run(true, async () => {
        await barrier;
        return 1;
      });
      const b = cacheDb.run(true, async () => {
        await barrier;
        return 2;
      });
      expect(await cacheDb.run(true, async () => 3)).toBeUndefined();
      done();
      await Promise.all([a, b]);
      expect(
        await cacheDb.run(false, (r) => r.query('SELECT pg_sleep(1)')),
      ).toBeUndefined();
      expect(
        await cacheDb.run(false, async (r) => {
          await r.query('SELECT 1');
          return true;
        }),
      ).toBe(true);
    });
    it('constructs the actual cache module against registered entities', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          TypeOrmModule.forRoot({ ...db.options, synchronize: false }),
          TtsCacheModule,
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(config)
        .compile();
      expect(module.get(TtsCacheService)).toBeDefined();
      const app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transformOptions: { enableImplicitConversion: true },
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.init();
      try {
        const path = `/internal/calls/${callId}/tts-cache`;
        const denied = await request(app.getHttpServer())
          .post(`${path}/lookup`)
          .send(body)
          .expect(401);
        expect(denied.headers['cache-control']).toBe('no-store');
        const published = await request(app.getHttpServer())
          .post(`${path}/publish`)
          .set('X-Worker-Secret', 'fixture-worker-secret')
          .send({ ...body, envelope: clip })
          .expect(200);
        expect(published.body).toEqual({ result: 'stored' });
        const hit = await request(app.getHttpServer())
          .post(`${path}/lookup`)
          .set('X-Worker-Secret', 'fixture-worker-secret')
          .send(body)
          .expect(200);
        expect(hit.body.hit).toBe(true);
        expect(hit.headers['cache-control']).toBe('no-store');
        const invalid = await request(app.getHttpServer())
          .post(`${path}/publish`)
          .set('X-Worker-Secret', 'fixture-worker-secret')
          .send({ ...body, organizationId: foreignOrg, envelope: clip })
          .expect(400);
        expect(invalid.headers['cache-control']).toBe('no-store');
      } finally {
        await app.close();
      }
    });
    it('persists nullable policy through real admin/user HTTP services and revokes shared access live', async () => {
      const tools = {
        resolveEnabledToolIds: jest.fn().mockResolvedValue(['endCall']),
      } as unknown as ToolProfilesService;
      const agents = new AgentsService(
        new AgentsRepository(db.getRepository(Agent)),
        tools,
      );
      const orgs = {
        findById: (id: string) =>
          db.getRepository(Organization).findOneByOrFail({ id }),
      } as OrganizationsService;
      const orgAgents = new OrganizationAgentsService(
        new OrganizationAgentsRepository(db.getRepository(OrganizationAgent)),
        agents,
        orgs,
        tools,
        db.getRepository(OrganizationIntegration),
      );
      const module = await Test.createTestingModule({
        controllers: [
          AgentsController,
          OrganizationAgentsController,
          UserOrganizationAgentsController,
          InternalTtsCacheController,
        ],
        providers: [
          WorkerSecretGuard,
          { provide: ConfigService, useValue: config },
          { provide: AgentsService, useValue: agents },
          { provide: OrganizationAgentsService, useValue: orgAgents },
          { provide: TtsCacheService, useValue: service },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context) => {
            const req = context.switchToHttp().getRequest();
            req.user = {
              typ: req.headers['x-fixture-principal'] || 'user',
              orgId: req.headers['x-fixture-org'] || orgId,
            };
            return true;
          },
        })
        .compile();
      const app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.init();
      const server = app.getHttpServer();
      const routes = [
        {
          path: `/admin/agents/${templateId}`,
          principal: 'admin',
          entity: Agent,
          id: templateId,
          defaultEnabled: false,
        },
        {
          path: `/admin/organizations/${orgId}/agents/${agentId}`,
          principal: 'admin',
          entity: OrganizationAgent,
          id: agentId,
          defaultEnabled: true,
        },
        {
          path: `/users/agents/${agentId}`,
          principal: 'user',
          entity: OrganizationAgent,
          id: agentId,
          defaultEnabled: true,
        },
      ];
      try {
        const columns = await db.query(
          "SELECT table_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'tts_cache_test' AND column_name = 'tts_cache_enabled' ORDER BY table_name",
        );
        expect(columns).toEqual([
          { table_name: 'agents', is_nullable: 'YES', column_default: null },
          {
            table_name: 'organization_agents',
            is_nullable: 'YES',
            column_default: null,
          },
        ]);
        expect(
          (
            await db
              .getRepository(OrganizationAgent)
              .findOneByOrFail({ id: agentId })
          ).ttsCacheEnabled,
        ).toBeNull();
        for (const route of routes) {
          // Template default true for both org routes, despite the preceding template round trips.
          if (route.entity === OrganizationAgent)
            await db
              .getRepository(Agent)
              .update(templateId, { ttsCacheEnabled: true });
          for (const preference of [true, false, null]) {
            const updated = await request(server)
              .patch(route.path)
              .set('x-fixture-principal', route.principal)
              .send({ ttsCacheEnabled: preference })
              .expect(200);
            expect(updated.body).toMatchObject({
              ttsCacheEnabled: preference,
              ttsCacheDefaultEnabled: route.defaultEnabled,
              effectiveTtsCacheEnabled: preference ?? route.defaultEnabled,
            });
            const stored = await db
              .getRepository(route.entity)
              .findOneByOrFail({ id: route.id });
            expect(stored.ttsCacheEnabled).toBe(preference);
            const read = await request(server)
              .get(route.path)
              .set('x-fixture-principal', route.principal)
              .expect(200);
            expect(read.body.ttsCacheEnabled).toBe(preference);
            await request(server)
              .patch(route.path)
              .set('x-fixture-principal', route.principal)
              .send({})
              .expect(200);
            expect(
              (
                await db
                  .getRepository(route.entity)
                  .findOneByOrFail({ id: route.id })
              ).ttsCacheEnabled,
            ).toBe(preference);
          }
          for (const invalid of ['true', 'false', 1, {}, []])
            await request(server)
              .patch(route.path)
              .set('x-fixture-principal', route.principal)
              .send({ ttsCacheEnabled: invalid })
              .expect(400);
        }
        await request(server)
          .patch(`/admin/agents/${templateId}`)
          .send({ ttsCacheEnabled: true })
          .expect(403);
        await request(server)
          .patch(`/users/agents/${agentId}`)
          .set('x-fixture-principal', 'admin')
          .send({ ttsCacheEnabled: true })
          .expect(403);
        await request(server)
          .patch(`/users/agents/${agentId}`)
          .set('x-fixture-org', foreignOrg)
          .send({ ttsCacheEnabled: true })
          .expect(404);
        const userPath = `/users/agents/${agentId}`;
        await request(server)
          .patch(userPath)
          .send({
            ttsCacheEnabled: true,
            model: 'openai/gpt-realtime-2.1',
            voice: 'marin',
          })
          .expect(200)
          .expect(({ body }) =>
            expect(body).toMatchObject({
              ttsCacheEnabled: true,
              effectiveTtsCacheEnabled: false,
            }),
          );
        await expect(service.lookup(callId, body)).rejects.toMatchObject({
          status: 403,
        });
        await request(server)
          .patch(userPath)
          .send({ model: null, voice: null })
          .expect(200);
        expect(
          await service.publish(callId, { ...body, envelope: clip }),
        ).toEqual({ result: 'stored' });
        await request(server)
          .patch(userPath)
          .send({ ttsCacheEnabled: false })
          .expect(200);
        await expect(service.lookup(callId, body)).rejects.toMatchObject({
          status: 403,
        });
        await expect(
          service.publish(callId, { ...body, envelope: clip }),
        ).rejects.toMatchObject({ status: 403 });
        expect(await db.getRepository(TtsCacheEntry).count()).toBe(1);
        await request(server)
          .patch(userPath)
          .send({ ttsCacheEnabled: null })
          .expect(200);
        expect((await service.lookup(callId, body)).hit).toBe(true);
        await db
          .getRepository(Agent)
          .update(templateId, { ttsCacheEnabled: null });
        await expect(service.lookup(callId, body)).rejects.toMatchObject({
          status: 403,
        });
      } finally {
        await app.close();
      }
    });
  },
);
