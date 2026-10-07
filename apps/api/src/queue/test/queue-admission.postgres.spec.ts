import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../queue.module';
import { QueueDialerService } from '../queue-dialer.service';
import { AuthModule } from '../../auth/auth.module';
import { EmailModule } from '../../email/email.module';
import { EmailService } from '../../email/email.service';
import { LivekitService } from '../../livekit/livekit.service';
import { AgentDirection } from '../../agents/agent.entity';
import {
  Call,
  CallMedium,
  CallStatus,
  CallFailureCode,
} from '../../calls/call.entity';
import { CallsRepository } from '../../calls/calls.repository';
import { CallsService } from '../../calls/services/calls.service';
import { newCallRow } from '../../calls/lib/call-row';
import { createCallsHarness } from '../../calls/test/helpers/calls-mocks';
import { Organization } from '../../organizations/organization.entity';
import {
  securityDatabase,
  securityDatabaseUrl,
  waitForSecurityRowWaiters,
} from '../../common/test/api-security-database';
import { CallBatch, CallBatchStatus } from '../call-batch.entity';
import { CallBatchesRepository } from '../call-batches.repository';
import { CallBatchesService } from '../call-batches.service';
import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { OrganizationQueueSettingsRepository } from '../organization-queue-settings.repository';
import { QueueAdmission } from '../queue-admission.entity';
import { QueueAdmissionRepository } from '../queue-admission.repository';
import { QueueAdmissionService } from '../queue-admission.service';
import { QueueRetryService } from '../queue-retry.service';

jest.setTimeout(30000);

(securityDatabaseUrl ? describe : describe.skip)(
  'Atomic queue admission with isolated PostgreSQL',
  () => {
    let db: DataSource, replica: DataSource;
    let admission: QueueAdmissionService, other: QueueAdmissionService;
    let repository: QueueAdmissionRepository;
    const orgId = randomUUID(),
      foreignOrg = randomUUID();
    const config = { get: () => undefined } as unknown as ConfigService;
    const admit = () => admission.admitPending(orgId);
    const calls = () => db.getRepository(Call);
    const settings = () => db.getRepository(OrganizationQueueSettings);
    beforeAll(async () => {
      const fixture = await securityDatabase('queue_admission_test');
      db = fixture.db;
      replica = await fixture.connect();
      repository = new QueueAdmissionRepository(db);
      admission = new QueueAdmissionService(repository, config);
      other = new QueueAdmissionService(
        new QueueAdmissionRepository(replica),
        config,
      );
    }, 60000);
    afterAll(async () => {
      if (replica?.isInitialized) await replica.destroy();
      if (db?.isInitialized) await db.destroy();
    });
    beforeEach(async () => {
      await db.query('TRUNCATE organizations CASCADE');
      await db.getRepository(Organization).save([
        { id: orgId, name: 'Queue A', slug: 'queue-a', isActive: true },
        { id: foreignOrg, name: 'Queue B', slug: 'queue-b', isActive: true },
      ]);
      await settings().save({
        organizationId: orgId,
        maxConcurrent: 3,
        maxDialsPerMinute: 20,
        claimBatchSize: 3,
      });
    });
    async function pending(patch: Partial<Call> = {}) {
      return calls().save(
        calls().create({
          ...newCallRow({
            organizationId: orgId,
            direction: AgentDirection.OUTBOUND,
            medium: CallMedium.SIP,
            maxAttempts: 3,
            nextAttemptAt: new Date('2020-01-01'),
            toNumber: '+15550000000',
          }),
          status: CallStatus.PENDING,
          ...patch,
        }),
      );
    }
    async function batch(patch: Partial<CallBatch> = {}) {
      return db
        .getRepository(CallBatch)
        .save({ organizationId: orgId, totalCount: 10, ...patch });
    }
    async function contend(
      actions: Array<() => Promise<unknown>>,
      beforeUnlock?: () => Promise<void>,
    ) {
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      let results: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        await blocker.query(
          'SELECT organization_id FROM organization_queue_settings WHERE organization_id = $1 FOR UPDATE',
          [orgId],
        );
        results = Promise.allSettled(actions.map((action) => action()));
        await waitForSecurityRowWaiters(
          db,
          actions.length,
          'organization_queue_settings',
        );
        if (beforeUnlock) await beforeUnlock();
        await blocker.commitTransaction();
        return await results;
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        if (results) await results;
        await blocker.release();
      }
    }
    async function recentUsage() {
      return repository.countRateUsage(orgId);
    }

    it('competing replicas cannot exceed organization capacity', async () => {
      await Promise.all(Array.from({ length: 8 }, () => pending()));
      const results = await contend([admit, () => other.admitPending(orgId)]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await calls().countBy({ status: CallStatus.CREATING })).toBe(3);
      expect(await db.getRepository(QueueAdmission).count()).toBe(3);
    });
    it('competing replicas cannot exceed the rolling admission rate', async () => {
      await settings().update(orgId, {
        maxConcurrent: 10,
        maxDialsPerMinute: 2,
        claimBatchSize: 10,
      });
      await Promise.all(Array.from({ length: 8 }, () => pending()));
      await contend([admit, () => other.admitPending(orgId)]);
      expect(await calls().countBy({ status: CallStatus.CREATING })).toBe(2);
      expect(await recentUsage()).toBe(2);
    });
    it('respects batch caps and skips a saturated high-priority batch', async () => {
      const a = await batch({ maxConcurrent: 1 }),
        b = await batch({ maxConcurrent: 2 });
      await Promise.all(
        Array.from({ length: 4 }, () =>
          pending({ batchId: a.id, priority: 100 }),
        ),
      );
      await Promise.all(
        Array.from({ length: 4 }, () => pending({ batchId: b.id })),
      );
      await contend([admit, () => other.admitPending(orgId)]);
      expect(
        await calls().countBy({ batchId: a.id, status: CallStatus.CREATING }),
      ).toBe(1);
      expect(
        await calls().countBy({ batchId: b.id, status: CallStatus.CREATING }),
      ).toBe(2);
    });
    it.each([null, 100])(
      'batch cap %s cannot raise the organization ceiling',
      async (cap) => {
        const b = await batch({ maxConcurrent: cap });
        await Promise.all(
          Array.from({ length: 5 }, () => pending({ batchId: b.id })),
        );
        expect(await admit()).toHaveLength(3);
      },
    );
    it('counts creating/dialing/ready reservations and honors claimBatchSize', async () => {
      await pending({ status: CallStatus.DIALING });
      await pending({ status: CallStatus.READY });
      await pending();
      await pending();
      expect(await admit()).toHaveLength(1);
      expect(await admit()).toHaveLength(0);
      await calls().update(
        { status: CallStatus.READY },
        { status: CallStatus.COMPLETED },
      );
      await settings().update(orgId, { claimBatchSize: 1 });
      expect(await admit()).toHaveLength(1);
    });
    it('subtracts existing live legs from each batch capacity', async () => {
      const limited = await batch({ maxConcurrent: 2 }),
        another = await batch();
      await pending({ batchId: limited.id, status: CallStatus.READY });
      await pending({ batchId: limited.id, priority: 100 });
      await pending({ batchId: limited.id, priority: 100 });
      await pending({ batchId: another.id });
      const result = await admit();
      expect(result.filter((a) => a.call.batchId === limited.id)).toHaveLength(
        1,
      );
      expect(result.filter((a) => a.call.batchId === another.id)).toHaveLength(
        1,
      );
    });
    it('excludes inbound calls and web tests from candidates, capacity and rate', async () => {
      await settings().update(orgId, {
        maxConcurrent: 1,
        maxDialsPerMinute: 1,
      });
      for (const patch of [
        { direction: AgentDirection.INBOUND },
        { medium: CallMedium.WEB },
      ]) {
        await pending(patch);
        await pending({
          ...patch,
          status: CallStatus.READY,
          dialStartedAt: new Date(),
        });
      }
      const outbound = await pending();
      expect((await admit()).map((a) => a.call.id)).toEqual([outbound.id]);
      expect(await recentUsage()).toBe(1);
    });
    it('counts immediate/legacy timestamps once without double-counting new admissions', async () => {
      await pending({ status: CallStatus.FAILED, dialStartedAt: new Date() });
      await pending();
      expect(await recentUsage()).toBe(1);
      await admit();
      expect(await recentUsage()).toBe(2);
    });
    it('failed retries and manual retry-now cannot erase recent rate charges', async () => {
      await settings().update(orgId, { maxDialsPerMinute: 2 });
      await pending();
      const [first] = await admit();
      const call = await admission.beginDial(first.admissionId);
      new QueueRetryService().resetForRequeue(call!, {
        action: 'requeue',
        failureCode: CallFailureCode.TIMEOUT,
        nextAttemptAt: new Date('2020-01-01'),
      });
      await calls().save(call!);
      const [second] = await admit();
      await calls().update(second.call.id, { status: CallStatus.FAILED });
      const service = new CallsService(new CallsRepository(calls()), {
        maybeMarkCompleted: async () => {},
      } as never);
      await service.retryNowForOrg(orgId, second.call.id);
      expect(await recentUsage()).toBe(2);
      expect(await admit()).toEqual([]);
    });
    it('deleting a call preserves its admission charge', async () => {
      await pending();
      const [a] = await admit();
      await calls().delete(a.call.id);
      expect(await recentUsage()).toBe(1);
      expect(await admission.beginDial(a.admissionId)).toBeNull();
    });
    it('subsequent entity saves preserve exact timestamp matching and do not double-charge', async () => {
      await pending();
      const [a] = await admit();
      const call = (await admission.beginDial(a.admissionId))!;
      call.status = CallStatus.READY;
      call.errorMessage = 'fixture status update';
      await calls().save(call);
      expect(await recentUsage()).toBe(1);
      const [row] = await db.query(
        'SELECT c.dial_started_at = a.admitted_at AS matches FROM calls c JOIN queue_admissions a ON a.call_id = c.id WHERE a.id = $1',
        [a.admissionId],
      );
      expect(row.matches).toBe(true);
    });
    it('a timestamp collision cannot create a second usable admission identity', async () => {
      await pending();
      const [a] = await admit();
      await expect(
        db.query(
          'INSERT INTO queue_admissions (id, organization_id, call_id, admitted_at) SELECT $1, organization_id, call_id, admitted_at FROM queue_admissions WHERE id = $2',
          [randomUUID(), a.admissionId],
        ),
      ).rejects.toThrow('duplicate key');
      expect(await db.getRepository(QueueAdmission).count()).toBe(1);
      expect((await admission.beginDial(a.admissionId))?.status).toBe(
        CallStatus.DIALING,
      );
    });
    it('old charges age out and bounded cleanup retains recent records', async () => {
      await pending();
      const [a] = await admit();
      await calls().update(a.call.id, {
        status: CallStatus.FAILED,
        dialStartedAt: null,
      });
      await db.query(
        "UPDATE queue_admissions SET admitted_at = clock_timestamp() - INTERVAL '61 seconds'",
      );
      expect(await recentUsage()).toBe(0);
      await db.query(
        "UPDATE queue_admissions SET admitted_at = clock_timestamp() - INTERVAL '25 hours'",
      );
      await pending();
      await admit();
      await repository.prune();
      expect(await db.getRepository(QueueAdmission).count()).toBe(1);
    });
    it('enforces due dates, attempts, batch status and batch tenant ownership', async () => {
      const paused = await batch({ status: CallBatchStatus.PAUSED });
      const cancelled = await batch({ status: CallBatchStatus.CANCELLED });
      const completed = await batch({ status: CallBatchStatus.COMPLETED });
      const foreign = await batch({ organizationId: foreignOrg });
      await pending({ nextAttemptAt: new Date('2099-01-01') });
      await pending({ nextAttemptAt: null });
      await pending({ attemptCount: 3 });
      for (const b of [paused, cancelled, completed, foreign])
        await pending({ batchId: b.id });
      await pending({ batchId: randomUUID() }); // Existing calls.batch_id has no FK.
      await pending({ organizationId: foreignOrg });
      const valid = await pending();
      expect((await admit()).map((a) => a.call.id)).toEqual([valid.id]);
    });
    it('preserves deterministic priority, due-time and creation ordering', async () => {
      const low = await pending({ priority: 0 });
      const high = await pending({ priority: 5 });
      const due = await pending({
        priority: 5,
        nextAttemptAt: new Date('2019-01-01'),
      });
      expect((await admit()).map((a) => a.call.id)).toEqual([
        due.id,
        high.id,
        low.id,
      ]);
    });
    it.each([
      'paused',
      'disabled',
      'inactive',
      'missing settings',
      'quiet',
      'invalid quiet',
    ])('blocks %s organizations', async (mode) => {
      await pending();
      if (mode === 'paused') await settings().update(orgId, { paused: true });
      if (mode === 'disabled')
        await settings().update(orgId, { enabled: false });
      if (mode === 'inactive')
        await db.getRepository(Organization).update(orgId, { isActive: false });
      if (mode === 'missing settings') await settings().delete(orgId);
      if (mode === 'quiet')
        await settings().update(orgId, {
          quietHoursEnabled: true,
          quietHoursStart: '00:00',
          quietHoursEnd: '00:00',
        });
      if (mode === 'invalid quiet')
        await settings().update(orgId, {
          quietHoursEnabled: true,
          quietHoursStart: '99:00',
          quietHoursEnd: '00:00',
        });
      expect(await admit()).toEqual([]);
    });
    it('reloads changed settings and organization activity after waiting for the lock', async () => {
      await pending();
      const result = await contend([admit], async () => {
        await db.getRepository(Organization).update(orgId, { isActive: false });
      });
      expect(result).toEqual([{ status: 'fulfilled', value: [] }]);
    });
    it.each(['pause', 'cancel'] as const)(
      'batch %s commits before a waiting admission',
      async (action) => {
        const b = await batch();
        await pending({ batchId: b.id });
        const blocker = db.createQueryRunner();
        await blocker.connect();
        await blocker.startTransaction();
        let waiting: Promise<unknown> | undefined;
        try {
          await blocker.query(
            'SELECT organization_id FROM organization_queue_settings WHERE organization_id = $1 FOR UPDATE',
            [orgId],
          );
          waiting = admit();
          await waitForSecurityRowWaiters(db, 1, 'organization_queue_settings');
          await blocker.query(
            'UPDATE call_batches SET status = $2 WHERE id = $1',
            [b.id, action === 'pause' ? 'paused' : 'cancelled'],
          );
          await blocker.commitTransaction();
          expect(await waiting).toEqual([]);
        } finally {
          if (blocker.isTransactionActive) await blocker.rollbackTransaction();
          if (waiting) await waiting;
          await blocker.release();
        }
      },
    );
    it('pause and cancellation allow already-admitted calls to begin', async () => {
      const b = await batch();
      await pending({ batchId: b.id });
      const [a] = await admit();
      const controls = new CallBatchesRepository(db.getRepository(CallBatch));
      await controls.transition(orgId, b.id, 'pause');
      await controls.transition(orgId, b.id, 'resume');
      await controls.transition(orgId, b.id, 'cancel');
      await new OrganizationQueueSettingsRepository(settings()).updateLocked(
        orgId,
        { paused: true },
      );
      expect((await admission.beginDial(a.admissionId))?.status).toBe(
        CallStatus.DIALING,
      );
      expect(await admit()).toEqual([]);
    });
    it('settings and batch controls wait on the same admission gate', async () => {
      const b = await batch();
      const results = await contend([
        () =>
          new OrganizationQueueSettingsRepository(
            replica.getRepository(OrganizationQueueSettings),
          ).updateLocked(orgId, { paused: true }),
        () =>
          new CallBatchesRepository(
            replica.getRepository(CallBatch),
          ).transition(orgId, b.id, 'pause'),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(
        (await settings().findOneByOrFail({ organizationId: orgId })).paused,
      ).toBe(true);
      expect(
        (await db.getRepository(CallBatch).findOneByOrFail({ id: b.id }))
          .status,
      ).toBe(CallBatchStatus.PAUSED);
    });
    it('beginDial is single-use even with competing replicas', async () => {
      await pending();
      const [a] = await admit();
      const results = await Promise.all([
        admission.beginDial(a.admissionId),
        other.beginDial(a.admissionId),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.find(Boolean)?.queueLockedAt).toBeNull();
    });
    it('expired/replaced leases cause zero provider requests and preserve rate history', async () => {
      await pending();
      const [old] = await admit();
      await db.query(
        "UPDATE calls SET queue_locked_at = clock_timestamp() - INTERVAL '121 seconds' WHERE id = $1",
        [old.call.id],
      );
      const h = createCallsHarness();
      h.queueAdmission.beginDial.mockImplementation((id: string) =>
        admission.beginDial(id),
      );
      expect(await h.dial.dialClaimedCall(old.admissionId)).toBeNull();
      const [replacement] = await admit();
      expect(replacement.admissionId).not.toBe(old.admissionId);
      expect(await h.dial.dialClaimedCall(old.admissionId)).toBeNull();
      expect(h.livekit.createRoom).not.toHaveBeenCalled();
      expect(h.livekit.createAgentDispatch).not.toHaveBeenCalled();
      expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
      expect(await recentUsage()).toBe(2);
      expect(replacement.call.attemptCount).toBe(1);
    });
    it('forced admission insertion failure rolls back status and attempts', async () => {
      await pending();
      await db.query(
        "CREATE FUNCTION reject_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced fixture failure'; END $$",
      );
      await db.query(
        'CREATE TRIGGER reject_admission BEFORE INSERT ON queue_admissions FOR EACH ROW EXECUTE FUNCTION reject_admission()',
      );
      try {
        await expect(admit()).rejects.toThrow('forced fixture failure');
        expect(
          await calls().countBy({
            status: CallStatus.PENDING,
            attemptCount: 0,
          }),
        ).toBe(1);
        expect(await db.getRepository(QueueAdmission).count()).toBe(0);
      } finally {
        await db.query('DROP TRIGGER reject_admission ON queue_admissions');
        await db.query('DROP FUNCTION reject_admission()');
      }
    });
    it.each(['cancel', 'retry', 'prioritize'])(
      'a stale pending %s cannot undo admission',
      async (action) => {
        const row = await pending();
        const callRepo = new CallsRepository(replica.getRepository(Call));
        const load = callRepo.findByIdAndOrganization.bind(callRepo);
        let loaded!: () => void, proceed!: () => void;
        const read = new Promise<void>((resolve) => {
          loaded = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          proceed = resolve;
        });
        jest
          .spyOn(callRepo, 'findByIdAndOrganization')
          .mockImplementation(async (...args) => {
            const snapshot = await load(...args);
            loaded();
            await gate;
            return snapshot;
          });
        const service = new CallsService(callRepo, {} as CallBatchesService);
        const operation =
          action === 'cancel'
            ? service.cancelPendingForOrg(orgId, row.id)
            : action === 'retry'
              ? service.retryNowForOrg(orgId, row.id)
              : service.prioritizeForOrg(orgId, row.id);
        const outcome = operation.then(
          () => 'success',
          () => 'rejected',
        );
        try {
          await read;
          await admit();
        } finally {
          proceed();
        }
        expect(await outcome).toBe('rejected');
        expect((await calls().findOneByOrFail({ id: row.id })).status).toBe(
          CallStatus.CREATING,
        );
      },
    );
    it('another organization can admit while this organization gate is locked', async () => {
      await settings().save({ organizationId: foreignOrg, maxConcurrent: 1 });
      await pending({ organizationId: foreignOrg });
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      try {
        await blocker.query(
          'SELECT organization_id FROM organization_queue_settings WHERE organization_id = $1 FOR UPDATE',
          [orgId],
        );
        expect(await other.admitPending(foreignOrg)).toHaveLength(1);
      } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
      }
    });
    it('constructs the actual queue/calls module graph without missing providers', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            load: [
              () => ({
                JWT_SECRET: 'fixture-jwt-secret',
                WORKER_CALLBACK_SECRET: 'fixture-worker-secret',
              }),
            ],
          }),
          TypeOrmModule.forRoot({ ...db.options, synchronize: false }),
          EmailModule,
          AuthModule,
          QueueModule,
        ],
      })
        .overrideProvider(LivekitService)
        .useValue({})
        .overrideProvider(EmailService)
        .useValue({ send: jest.fn() })
        .compile();
      try {
        expect(module.get(QueueAdmissionService)).toBeDefined();
        expect(module.get(QueueAdmissionRepository)).toBeDefined();
        expect(module.get(QueueDialerService)).toBeDefined();
      } finally {
        await module.close();
      }
    });
    it.each([CallBatchStatus.CANCELLED, CallBatchStatus.COMPLETED])(
      'cannot pause/resume a %s batch',
      async (status) => {
        const b = await batch({ status });
        const controls = new CallBatchesRepository(db.getRepository(CallBatch));
        await expect(controls.transition(orgId, b.id, 'pause')).rejects.toThrow(
          `Cannot pause a ${status} batch`,
        );
        await expect(
          controls.transition(orgId, b.id, 'resume'),
        ).rejects.toThrow(`Cannot resume a ${status} batch`);
        await expect(
          controls.transition(foreignOrg, b.id, 'cancel'),
        ).rejects.toThrow('Batch not found');
      },
    );
    it('batch cancellation atomically cancels only pending calls, and is idempotent', async () => {
      const b = await batch();
      const first = await pending({ batchId: b.id });
      const second = await pending({ batchId: b.id });
      await settings().update(orgId, { claimBatchSize: 1 });
      const [a] = await admit();
      const controls = new CallBatchesRepository(db.getRepository(CallBatch));
      await controls.transition(orgId, b.id, 'cancel');
      await controls.transition(orgId, b.id, 'cancel');
      const untouched = a.call.id === first.id ? second : first;
      expect((await calls().findOneByOrFail({ id: untouched.id })).status).toBe(
        CallStatus.CANCELLED,
      );
      expect((await calls().findOneByOrFail({ id: a.call.id })).status).toBe(
        CallStatus.CREATING,
      );
    });
    it('lazy defaults cannot overwrite concurrent settings changes', async () => {
      const stale = await settings().findOneByOrFail({ organizationId: orgId });
      await settings().update(orgId, { paused: true, maxConcurrent: 1 });
      const saved = await new OrganizationQueueSettingsRepository(
        settings(),
      ).insertDefaults(stale);
      expect(saved).toMatchObject({ paused: true, maxConcurrent: 1 });
    });
    it('expired lease reclamation excludes inbound and web creating rows', async () => {
      const old = new Date('2020-01-01');
      const inbound = await pending({
        direction: AgentDirection.INBOUND,
        status: CallStatus.CREATING,
        queueLockedAt: old,
      });
      const web = await pending({
        medium: CallMedium.WEB,
        status: CallStatus.CREATING,
        queueLockedAt: old,
      });
      await pending();
      await admit();
      expect((await calls().findOneByOrFail({ id: inbound.id })).status).toBe(
        CallStatus.CREATING,
      );
      expect((await calls().findOneByOrFail({ id: web.id })).status).toBe(
        CallStatus.CREATING,
      );
    });
    it('beginDial rejects a lease with changed tenant ownership', async () => {
      await pending();
      const [a] = await admit();
      await calls().update(a.call.id, { organizationId: foreignOrg });
      expect(await admission.beginDial(a.admissionId)).toBeNull();
    });
    it('beginDial evaluates expiry after waiting for the call lock', async () => {
      await pending();
      const [a] = await admit();
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      let result: Promise<Call | null> | undefined;
      try {
        await blocker.query('SELECT id FROM calls WHERE id = $1 FOR UPDATE', [
          a.call.id,
        ]);
        result = other.beginDial(a.admissionId);
        await waitForSecurityRowWaiters(db, 1, 'Call');
        // Keep the identity matching but expire it while the other connection waits.
        await blocker.query(
          "UPDATE queue_admissions SET admitted_at = clock_timestamp() - INTERVAL '121 seconds' WHERE id = $1",
          [a.admissionId],
        );
        await blocker.query(
          'UPDATE calls SET queue_locked_at = (SELECT admitted_at FROM queue_admissions WHERE id = $1) WHERE id = $2',
          [a.admissionId, a.call.id],
        );
        await blocker.commitTransaction();
        expect(await result).toBeNull();
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        if (result) await result;
        await blocker.release();
      }
    });
  },
);
