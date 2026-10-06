import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsAppTaskTestsService } from '../whatsapp-task-tests.service';
import {
  WhatsAppTaskTest,
  WhatsAppTaskTestTurn,
} from '../whatsapp-task-test.entity';
import { WhatsAppHarnessRepository } from '../../whatsapp-harness/whatsapp-harness.repository';
import { WhatsAppTaskSession } from '../../whatsapp-harness/whatsapp-task-session.entity';
import { WhatsAppTurn } from '../../whatsapp-harness/whatsapp-turn.entity';
import { WhatsAppOutbox } from '../../whatsapp-harness/whatsapp-outbox.entity';
import { OrganizationIntegration } from '../../organization-integrations/organization-integration.entity';
import { WHATSAPP_TASK_STARTERS } from '@call-agent/contracts';
import { WhatsAppTasksModule } from '../whatsapp-tasks.module';
import { WhatsAppTasksService } from '../whatsapp-tasks.service';
import { Organization } from '../../organizations/organization.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

const url = process.env.WHATSAPP_TASK_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'WhatsApp tasks with isolated PostgreSQL',
  () => {
    let app: INestApplication;
    let db: DataSource;
    let tasks: WhatsAppTasksService;
    const orgA = randomUUID(),
      orgB = randomUUID();
    beforeAll(async () => {
      const parsed = new URL(url!);
      if (
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55443' ||
        parsed.pathname !== '/whatsapp_tasks_test'
      )
        throw new Error('Use isolated whatsapp_tasks_test on 127.0.0.1:55443');
      // Include every local entity so existing relation targets can be verified too.
      const root = resolve(process.cwd(), 'apps/api/src');
      for (const file of readdirSync(root, { recursive: true }))
        if (String(file).endsWith('.entity.ts'))
          require(resolve(root, String(file)));
      const entities = getMetadataArgsStorage().tables.map(
        (t) => t.target as Function,
      );
      const setup = await new DataSource({
        type: 'postgres',
        url,
        entities,
      }).initialize();
      await setup.query('CREATE SCHEMA IF NOT EXISTS whatsapp_task_test');
      await setup.destroy();
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
          TypeOrmModule.forRoot({
            type: 'postgres',
            url,
            schema: 'whatsapp_task_test',
            extra: { options: '-c search_path=whatsapp_task_test,public' },
            entities,
            synchronize: true,
          }),
          WhatsAppTasksModule,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(ctx: any) {
            const req = ctx.switchToHttp().getRequest();
            req.user = {
              typ: req.headers['x-test-principal'] || 'user',
              orgId: req.headers['x-test-org'] || orgA,
              id: randomUUID(),
              email: 'test@example.invalid',
              role: 'agent',
            };
            return true;
          },
        })
        .compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.init();
      db = app.get(DataSource);
      tasks = app.get(WhatsAppTasksService);
      await db.getRepository(Organization).save([
        {
          id: orgA,
          name: 'Test A',
          slug: `test-${orgA}`,
          allowedToolIds: null,
        },
        { id: orgB, name: 'Test B', slug: `test-${orgB}` },
      ]);
    }, 30000);
    afterAll(async () => {
      if (app) await app.close();
    });
    it('seeds starters idempotently and keeps tenant drafts private', async () => {
      expect((await tasks.list(null)).filter((t) => t.starterKey)).toHaveLength(
        2,
      );
      await tasks.onModuleInit();
      expect((await tasks.list(null)).filter((t) => t.starterKey)).toHaveLength(
        2,
      );
      const privateTask = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.receptionist,
      );
      await request(app.getHttpServer())
        .get(`/users/whatsapp-tasks/${privateTask.id}`)
        .set('x-test-org', orgB)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/users/whatsapp-tasks/${privateTask.id}/draft`)
        .set('x-test-org', orgB)
        .send({ revision: 1, definition: privateTask.draft })
        .expect(404);
      await request(app.getHttpServer())
        .get('/admin/whatsapp-tasks')
        .expect(403);
      await request(app.getHttpServer())
        .get('/users/whatsapp-tasks')
        .set('x-test-principal', 'admin')
        .expect(403);
      await request(app.getHttpServer())
        .post('/users/whatsapp-tasks')
        .send({ definition: privateTask.draft, organizationId: orgB })
        .expect(400);
      const platformDraft = await tasks.create(
        null,
        WHATSAPP_TASK_STARTERS.receptionist,
      );
      await expect(tasks.get(orgA, platformDraft.id)).rejects.toThrow(
        'not found',
      );
      await tasks.publish(null, platformDraft.id, 1);
      await tasks.update(null, platformDraft.id, 1, {
        ...platformDraft.draft,
        objective: 'Hidden draft objective',
      });
      expect((await tasks.get(orgA, platformDraft.id)).draft.objective).toBe(
        platformDraft.draft.objective,
      );
      const clone = await tasks.clone(orgA, platformDraft.id);
      expect(clone.organizationId).toBe(orgA);
      expect(clone.published).toBeNull();
    });
    it('uses revision locks and retains immutable published history', async () => {
      const task = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.appointment_booking,
      );
      await tasks.publish(orgA, task.id, 1);
      const snapshot = await tasks.snapshot(orgA, task.id);
      const changes = await Promise.allSettled(
        ['First', 'Second'].map((name) =>
          tasks.update(orgA, task.id, 1, { ...task.draft, name }),
        ),
      );
      expect(changes.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
      expect(await tasks.snapshot(orgA, task.id)).toEqual(snapshot);
      await expect(tasks.publish(orgA, task.id, 1)).rejects.toThrow('changed');
      const publishes = await Promise.allSettled([
        tasks.publish(orgA, task.id, 2),
        tasks.publish(orgA, task.id, 2),
      ]);
      // Publishing the same saved revision creates separate immutable versions, as voice does.
      expect(publishes.every((p) => p.status === 'fulfilled')).toBe(true);
      expect(await tasks.history(orgA, task.id)).toHaveLength(3);
      expect(await tasks.snapshot(orgA, task.id, 1)).toEqual(snapshot);
      await tasks.archive(orgA, task.id);
      await expect(tasks.snapshot(orgA, task.id)).rejects.toThrow('active');
      expect(await tasks.snapshot(orgA, task.id, 1, true)).toEqual(snapshot);
    });
    it('pins sandbox revisions, isolates scopes, and only records simulated receipts', async () => {
      const tests = app.get(WhatsAppTaskTestsService);
      const task = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.appointment_booking,
      );
      const test = await tests.create(orgA, task.id, {
        revision: 1,
        persona: 'Helpful test assistant',
      });
      await tasks.update(orgA, task.id, 1, {
        ...task.draft,
        objective: 'New objective',
      });
      expect(
        (await tests.inspect(orgA, task.id, test.id)).snapshot.definition
          .objective,
      ).toBe(task.draft.objective);
      await expect(tests.inspect(orgB, task.id, test.id)).rejects.toThrow(
        'not found',
      );
      const messageId = randomUUID();
      const message = await tests.message(
        orgA,
        task.id,
        test.id,
        'Book the first slot',
        messageId,
      );
      expect(
        await tests.message(
          orgA,
          task.id,
          test.id,
          'Book the first slot',
          messageId,
        ),
      ).toEqual(message);
      const lease = randomUUID();
      await db.getRepository(WhatsAppTaskTestTurn).update(message.turnId, {
        status: 'running',
        leaseToken: lease,
        leaseExpiresAt: new Date(Date.now() + 45000),
        startedAt: new Date(),
        baseSession: { state: {}, events: [] },
      });
      const call = (action: string, input: Record<string, unknown> = {}) =>
        tests.callback(message.turnId, lease, action, input);
      await expect(
        tests.callback(message.turnId, randomUUID(), 'heartbeat', {}),
      ).rejects.toThrow('stale');
      expect(
        await call('validate-completion', {
          completion: { outcome: 'booked', fields: {} },
        }),
      ).toMatchObject({ ok: false });
      await call('tools', { toolId: 'lookupGhlContact', args: {} });
      await call('tools', {
        toolId: 'checkGhlFreeSlots',
        args: {
          startTime: '2030-01-01T10:00:00Z',
          endTime: '2030-01-01T11:00:00Z',
        },
      });
      const receipt = await call('tools', {
        toolId: 'scheduleGhlMeeting',
        args: { startTime: '2030-01-01T10:00:00Z' },
      });
      expect(receipt).toMatchObject({
        ok: true,
        appointmentId: `sandbox-${test.id}`,
      });
      expect((await tests.inspect(orgA, task.id, test.id)).status).toBe(
        'active',
      );
      expect(
        await call('validate-completion', {
          completion: { outcome: 'booked', fields: {} },
        }),
      ).toEqual({ ok: true });
      const checkpoint = {
        session: { state: {}, events: [] },
        reply: 'Booked in simulation',
        completion: { outcome: 'booked', fields: {} },
      };
      await call('checkpoint', checkpoint);
      await call('complete', checkpoint);
      await call('complete', checkpoint);
      expect((await tests.inspect(orgA, task.id, test.id)).status).toBe(
        'completed',
      );
      expect(
        await db.getRepository(WhatsAppTaskTest).countBy({ id: test.id }),
      ).toBe(1);
      const [{ count }] = await db.query(
        'SELECT COUNT(*) FROM whatsapp_message_outbox WHERE turn_id=$1',
        [message.turnId],
      );
      expect(Number(count)).toBe(0);
      const [{ operations }] = await db.query(
        'SELECT COUNT(*) AS operations FROM whatsapp_tool_operations WHERE turn_id=$1',
        [message.turnId],
      );
      expect(Number(operations)).toBe(0);
    });
    it('runs a tool-free sandbox and refuses live permission revocation', async () => {
      const tests = app.get(WhatsAppTaskTestsService);
      const definition = {
        ...WHATSAPP_TASK_STARTERS.receptionist,
        toolIds: [],
        phases: [
          {
            title: 'Resolve',
            instructions: 'Resolve the customer question',
            fieldKeys: [],
            toolIds: [],
          },
        ],
        outcomes: [
          {
            key: 'resolved',
            description: 'Question answered',
            terminalStatus: 'completed' as const,
            requiredFields: [],
            checks: ['usable_customer_message' as const],
          },
        ],
      };
      const task = await tasks.create(orgA, definition);
      const test = await tests.create(orgA, task.id, {
        revision: 1,
        persona: 'Support assistant',
      });
      const { turnId } = await tests.message(
        orgA,
        task.id,
        test.id,
        'That answers my question',
        randomUUID(),
      );
      const lease = randomUUID();
      await db.getRepository(WhatsAppTaskTestTurn).update(turnId, {
        status: 'running',
        leaseToken: lease,
        leaseExpiresAt: new Date(Date.now() + 45000),
        startedAt: new Date(),
        baseSession: { state: {}, events: [] },
      });
      await tests.callback(turnId, lease, 'complete', {
        session: { state: {}, events: [] },
        reply: 'Thanks',
        completion: { outcome: 'resolved', fields: {} },
      });
      expect((await tests.inspect(orgA, task.id, test.id)).outcome).toBe(
        'resolved',
      );
      await db.getRepository(Organization).update(orgA, { allowedToolIds: [] });
      const booking = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.appointment_booking,
      );
      await expect(
        tests.create(orgA, booking.id, {
          revision: 1,
          persona: 'Booking assistant',
        }),
      ).rejects.toThrow('assigned');
      await db
        .getRepository(Organization)
        .update(orgA, { allowedToolIds: null });
    });
    it('pins production sessions, keeps booking open, and completes with receipt and outbox atomically', async () => {
      const repository = new WhatsAppHarnessRepository(db);
      const record = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.appointment_booking,
      );
      await tasks.publish(orgA, record.id, 1);
      const snapshot = await tasks.snapshot(orgA, record.id);
      const connection = await db.getRepository(OrganizationIntegration).save({
        organizationId: orgA,
        name: 'Isolated configured test',
        provider: 'whatsapp',
        apiKey: 'unused-test-token',
        apiKeyPrefix: 'test',
        phoneNumberId: '10000001',
        systemPrompt: 'Test persona',
        whatsappTaskId: record.id,
      });
      const input = {
        organizationId: orgA,
        connectionId: connection.id,
        sender: '10000000000',
        phoneNumberId: '10000001',
        messageId: randomUUID(),
        body: 'Book the first slot',
      };
      await repository.ingest(input);
      const [turn] = await repository.claim(4);
      const config = {
        key: 'configured' as const,
        version: 1,
        objective: snapshot.definition.objective,
        completionRule: 'configured' as const,
        snapshot,
        context: {},
        persona: 'Test persona',
        toolProfileId: '',
        voiceAgentId: '',
        calendarIntegrationId: '',
        locationId: '',
        calendarId: '',
        enabledTools: snapshot.definition.toolIds,
      };
      const session = await repository.bindTask(
        turn.id,
        turn.leaseToken!,
        async () => config,
      );
      await tasks.update(orgA, record.id, 1, {
        ...record.draft,
        objective: 'A different objective',
      });
      await tasks.publish(orgA, record.id, 2);
      expect(
        (
          await repository.bindTask(turn.id, turn.leaseToken!, async () => {
            throw new Error('Must not resolve again');
          })
        ).configuration.snapshot,
      ).toEqual(snapshot);
      expect(
        await repository.checkCompletion(turn.id, turn.leaseToken!, {
          outcome: 'booked',
          fields: {},
        }),
      ).toMatchObject({ ok: false });
      const reservation = await repository.reserveTool(
        turn.id,
        turn.leaseToken!,
        'booking-test-operation',
        'scheduleGhlMeeting',
        () => {},
      );
      expect(
        await repository.checkCompletion(turn.id, turn.leaseToken!, {
          outcome: 'booked',
          fields: {},
        }),
      ).toMatchObject({ ok: false });
      await repository.finishTool(
        reservation.operation,
        {
          ok: true,
          appointmentId: 'real-test-receipt',
          startTime: '2030-01-01T10:00:00Z',
        },
        () => {},
      );
      expect(
        (
          await db
            .getRepository(WhatsAppTaskSession)
            .findOneByOrFail({ id: session.id })
        ).status,
      ).toBe('active');
      const checkpoint = {
        session: { state: {}, events: [] },
        reply: 'All done',
        completion: { outcome: 'booked', fields: {} },
      };
      await repository.checkpoint(turn.id, turn.leaseToken!, checkpoint);
      await repository.complete(turn.id, turn.leaseToken!, checkpoint);
      await repository.complete(turn.id, turn.leaseToken!, checkpoint);
      expect(
        (
          await db
            .getRepository(WhatsAppTaskSession)
            .findOneByOrFail({ id: session.id })
        ).status,
      ).toBe('completed');
      expect(
        await db.getRepository(WhatsAppOutbox).countBy({ turnId: turn.id }),
      ).toBe(1);
      await db
        .getRepository(WhatsAppOutbox)
        .update({ turnId: turn.id }, { status: 'accepted' });
      await repository.ingest({
        ...input,
        messageId: randomUUID(),
        body: 'A new request',
      });
      const [next] = await repository.claim(4);
      const second = await repository.bindTask(
        next.id,
        next.leaseToken!,
        async () => ({
          ...config,
          version: 2,
          snapshot: await tasks.snapshot(orgA, record.id),
        }),
      );
      expect(second.id).not.toBe(session.id);
      expect(second.session.events).toEqual([]);
      expect(second.configuration.version).toBe(2);
      await repository.ingest({
        ...input,
        messageId: randomUUID(),
        body: '/new',
      });
      await expect(
        repository.complete(next.id, next.leaseToken!, {
          session: { state: {}, events: [] },
          reply: 'Stale',
        }),
      ).rejects.toThrow();
    });
    it('dispatches pinned drafts through private sandbox routes and shares worker capacity', async () => {
      const tests = app.get(WhatsAppTaskTestsService);
      const config = app.get(ConfigService);
      const task = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.receptionist,
      );
      const test = await tests.create(orgA, task.id, {
        revision: 1,
        persona: 'Sandbox persona',
      });
      await expect(
        tests.message(orgA, task.id, test.id, '   ', randomUUID()),
      ).rejects.toThrow('Customer message');
      const { turnId } = await tests.message(
        orgA,
        task.id,
        test.id,
        'Please help',
        randomUUID(),
      );
      const settings = [
        'WHATSAPP_WORKER_URL',
        'WORKER_CALLBACK_SECRET',
        'WHATSAPP_TICKER_MAX_CONCURRENT',
      ];
      const previous = settings.map((key) => config.get(key));
      config.set(settings[0], 'http://sandbox-worker.invalid');
      config.set(settings[1], 'isolated-worker-secret');
      config.set(settings[2], 1);
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async (url) =>
            new Response(
              JSON.stringify(
                String(url).endsWith('/health')
                  ? { supportedTaskProtocolVersions: [1, 2] }
                  : {},
              ),
              { status: String(url).endsWith('/health') ? 200 : 202 },
            ),
        );
      try {
        await tests.tick();
        const dispatch = fetchMock.mock.calls.find(([url]) =>
          String(url).endsWith('/test-turns'),
        );
        expect(dispatch).toBeDefined();
        const payload = JSON.parse(String(dispatch![1]!.body));
        expect(payload).toMatchObject({
          id: turnId,
          sandbox: true,
          taskProtocolVersion: 2,
          prompt: 'Sandbox persona',
          task: { version: 0, snapshot: { draftRevision: 1 } },
        });
        expect(await new WhatsAppHarnessRepository(db).claim(1)).toEqual([]);
        expect(
          fetchMock.mock.calls.every(([url]) =>
            String(url).startsWith('http://sandbox-worker.invalid/'),
          ),
        ).toBe(true);
        await tests.reset(orgA, task.id, test.id);
      } finally {
        fetchMock.mockRestore();
        settings.forEach((key, i) => config.set(key, previous[i]));
      }
    });
    it('fences reset sandbox workers and simulates failures without granting extra tools', async () => {
      const tests = app.get(WhatsAppTaskTestsService);
      const task = await tasks.create(
        orgA,
        WHATSAPP_TASK_STARTERS.receptionist,
      );
      const test = await tests.create(orgA, task.id, {
        revision: 1,
        persona: 'Simulated assistant',
        simulatedFailureTools: ['upsertGhlContact'],
      });
      const { turnId } = await tests.message(
        orgA,
        task.id,
        test.id,
        'Please help',
        randomUUID(),
      );
      const lease = randomUUID();
      await db.getRepository(WhatsAppTaskTestTurn).update(turnId, {
        status: 'running',
        leaseToken: lease,
        leaseExpiresAt: new Date(Date.now() + 45000),
        startedAt: new Date(),
        baseSession: { state: {}, events: [] },
      });
      expect(
        await tests.callback(turnId, lease, 'tools', {
          toolId: 'upsertGhlContact',
          args: {},
        }),
      ).toMatchObject({ ok: false, error: 'simulated_tool_failure' });
      await db.getRepository(Organization).update(orgA, { allowedToolIds: [] });
      await expect(
        tests.callback(turnId, lease, 'tools', {
          toolId: 'lookupGhlContact',
          args: {},
        }),
      ).rejects.toThrow('assigned');
      await db
        .getRepository(Organization)
        .update(orgA, { allowedToolIds: null });
      await tests.reset(orgA, task.id, test.id);
      await expect(
        tests.callback(turnId, lease, 'heartbeat', {}),
      ).rejects.toThrow('stale');
      expect((await tests.inspect(orgA, task.id, test.id)).status).toBe(
        'cancelled',
      );
    });
  },
);
