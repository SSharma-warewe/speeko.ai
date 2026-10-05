import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { VOICE_TASK_STARTERS } from '@call-agent/contracts';
import { VoiceTasksModule } from '../voice-tasks.module';
import { VoiceTask, VoiceTaskVersionEntity } from '../voice-task.entity';
import { VoiceTasksService } from '../voice-tasks.service';
import { Organization } from '../../organizations/organization.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

const url = process.env.VOICE_TASK_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Voice tasks with isolated PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  let tasks: VoiceTasksService;
  const orgA = randomUUID(),
    orgB = randomUUID();
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      parsed.hostname !== '127.0.0.1' ||
      parsed.port !== '55441' ||
      parsed.pathname !== '/voice_tasks_test'
    )
      throw new Error('Use isolated voice_tasks_test on 127.0.0.1:55441');
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
    await setup.query('CREATE SCHEMA IF NOT EXISTS voice_task_test');
    await setup.destroy();
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url,
          schema: 'voice_task_test',
          extra: { options: '-c search_path=voice_task_test,public' },
          entities,
          synchronize: true,
        }),
        VoiceTasksModule,
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
    tasks = app.get(VoiceTasksService);
    await db.getRepository(Organization).save([
      { id: orgA, name: 'Test A', slug: `test-${orgA}` },
      { id: orgB, name: 'Test B', slug: `test-${orgB}` },
    ]);
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
  });
  it('seeds and clones all seven starters preserving fields/checks', async () => {
    const platform = await tasks.list(null);
    expect(platform).toHaveLength(7);
    await tasks.onModuleInit();
    expect(await tasks.list(null)).toHaveLength(7);
    for (const row of platform) {
      const clone = await tasks.clone(orgA, row.id);
      expect(clone.draft.resultFields).toEqual(
        VOICE_TASK_STARTERS[row.starterKey!].resultFields,
      );
      expect(clone.draft.outcomes).toEqual(
        VOICE_TASK_STARTERS[row.starterKey!].outcomes,
      );
      expect(clone.published).toBeNull();
    }
  });
  it('enforces live principal scope, separate admin/user guards, and DTO validation', async () => {
    const row = await tasks.create(orgA, VOICE_TASK_STARTERS.general);
    await request(app.getHttpServer())
      .get(`/users/voice-tasks/${row.id}`)
      .set('x-test-org', orgB)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/users/voice-tasks/${row.id}/draft`)
      .set('x-test-org', orgB)
      .send({ revision: 1, definition: row.draft })
      .expect(404);
    await request(app.getHttpServer())
      .post('/users/voice-tasks')
      .send({ definition: row.draft, organizationId: orgB })
      .expect(400);
    await request(app.getHttpServer()).get('/admin/voice-tasks').expect(403);
    await request(app.getHttpServer())
      .get('/users/voice-tasks')
      .set('x-test-principal', 'admin')
      .expect(403);
    await request(app.getHttpServer())
      .get('/users/voice-tasks/not-a-uuid')
      .expect(404);
    await request(app.getHttpServer())
      .get('/admin/voice-tasks')
      .set('x-test-principal', 'admin')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/users/voice-tasks/${row.id}/publish`)
      .send({ revision: '1' })
      .expect(400);
    const platform = (await tasks.list(null))[0];
    await request(app.getHttpServer())
      .patch(`/users/voice-tasks/${platform.id}/draft`)
      .send({ revision: 1, definition: row.draft })
      .expect(404);
  });
  it('only one concurrent draft update wins and published versions never follow draft edits', async () => {
    const row = await tasks.create(orgA, VOICE_TASK_STARTERS.general);
    await tasks.publish(orgA, row.id, 1);
    const oldSnapshot = await tasks.snapshot(orgA, row.id);
    const changes = await Promise.allSettled(
      ['First', 'Second'].map((name) =>
        tasks.update(orgA, row.id, 1, { ...row.draft, name }),
      ),
    );
    expect(changes.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
    expect(await tasks.snapshot(orgA, row.id)).toEqual(oldSnapshot);
    await expect(tasks.publish(orgA, row.id, 1)).rejects.toThrow(/changed/);
    const saved = await tasks.get(orgA, row.id);
    const draft = await tasks.draftSnapshot(orgA, row.id, 2);
    expect(draft.version).toBe(0);
    expect(draft.draftRevision).toBe(2);
    await tasks.publish(orgA, row.id, 2);
    expect((await tasks.snapshot(orgA, row.id)).definition.name).toBe(
      saved.draft.name,
    );
    expect(await tasks.snapshot(orgA, row.id, 1)).toEqual(oldSnapshot);
    expect(
      (
        await db
          .getRepository(VoiceTaskVersionEntity)
          .findBy({ taskId: row.id })
      ).length,
    ).toBe(2);
    expect(
      (await db.getRepository(VoiceTask).findOneByOrFail({ id: row.id }))
        .publishedVersion,
    ).toBe(2);
  });
  it('resolves explicit/default/template selectors and rejects tenant or selector conflicts', async () => {
    const own = await tasks.create(orgA, VOICE_TASK_STARTERS.general);
    await tasks.publish(orgA, own.id, 1);
    const platform = (await tasks.list(null))[0];
    expect(
      (
        await tasks.resolve(
          orgA,
          { voiceTaskId: own.id },
          { defaultVoiceTaskId: platform.id },
        )
      )?.taskId,
    ).toBe(own.id);
    expect(
      (
        await tasks.resolve(
          orgA,
          {},
          { defaultVoiceTaskId: own.id },
          { defaultVoiceTaskId: platform.id },
        )
      )?.taskId,
    ).toBe(own.id);
    expect(
      (await tasks.resolve(orgA, {}, {}, { defaultVoiceTaskId: platform.id }))
        ?.taskId,
    ).toBe(platform.id);
    expect(
      await tasks.resolve(
        orgA,
        { task: 'general' },
        { defaultVoiceTaskId: own.id },
      ),
    ).toBeNull();
    expect(
      await tasks.resolve(
        orgA,
        {},
        { defaultTaskKey: 'general' },
        { defaultVoiceTaskId: platform.id },
      ),
    ).toBeNull();
    await expect(
      tasks.resolve(orgB, { voiceTaskId: own.id }, {}),
    ).rejects.toThrow(/not found/);
    await expect(
      tasks.resolve(orgA, { task: 'general', voiceTaskId: own.id }, {}),
    ).rejects.toThrow(/not both/);
    await tasks.archive(orgA, own.id);
    await expect(tasks.snapshot(orgA, own.id)).rejects.toThrow(/active/);
    expect((await tasks.snapshot(orgA, own.id, 1, true)).taskId).toBe(own.id);
  });
  it('checks live allowed tools, calendar provider, input types and defaults', async () => {
    const row = (await tasks.list(null)).find(
      (t) => t.starterKey === 'interview_booking',
    )!;
    const snapshot = row.published!;
    expect(() =>
      tasks.prepare(snapshot, 'outbound', ['endCall'], {}, 'ghl'),
    ).toThrow(/unassigned/);
    expect(() =>
      tasks.prepare(
        snapshot,
        'outbound',
        snapshot.definition.toolIds,
        {},
        'nylas',
      ),
    ).toThrow(/compatible/);
    expect(() =>
      tasks.prepare(
        snapshot,
        'inbound',
        snapshot.definition.toolIds,
        {},
        'ghl',
      ),
    ).toThrow(/direction/);
    expect(
      tasks.prepare(
        snapshot,
        'outbound',
        snapshot.definition.toolIds,
        {},
        'ghl',
      ).context.durationMinutes,
    ).toBe(30);
    expect(() =>
      tasks.prepare(
        snapshot,
        'outbound',
        snapshot.definition.toolIds,
        { durationMinutes: '30' },
        'ghl',
      ),
    ).toThrow(/durationMinutes/);
  });
  it('validates assignment without discarding phase references to call input', async () => {
    const base = (await tasks.list(null)).find(t => t.starterKey === 'general')!.published!;
    const snapshot = { ...base, definition: { ...base.definition,
      contextFields: [{ key: 'caseId', type: 'string' as const, description: 'Support case', required: true }],
      phases: [{ title: 'Review case', instructions: 'Ask about the supplied case.', fieldKeys: ['caseId'], toolIds: [] }],
    } };
    expect(() => tasks.prepare(snapshot, 'outbound', snapshot.definition.toolIds, {}, undefined, false)).not.toThrow();
    expect(() => tasks.prepare(snapshot, 'outbound', snapshot.definition.toolIds)).toThrow(/Missing context field: caseId/);
    expect(tasks.prepare(snapshot, 'outbound', snapshot.definition.toolIds, { caseId: 'CASE-1' }).context.caseId).toBe('CASE-1');
  });
});
