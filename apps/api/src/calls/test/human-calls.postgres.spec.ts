import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  securityDatabase,
  securityDatabaseUrl,
} from '../../common/test/api-security-database';
import { Organization } from '../../organizations/organization.entity';
import { User } from '../../users/user.entity';
import { Call } from '../call.entity';
import { HumanCallSession } from '../human-call-session.entity';
import { HumanCallSessionsRepository } from '../human-call-sessions.repository';
import { QueueAdmissionRepository } from '../../queue/queue-admission.repository';
import { OrganizationQueueSettings } from '../../queue/organization-queue-settings.entity';
import { QueueAdmission } from '../../queue/queue-admission.entity';
import { newCallRow } from '../lib/call-row';
import { HumanCallWorkspaceService } from '../services/human-call-workspace.service';
import { HumanCallTranscriptionRepository } from '../human-call-transcription.repository';
import { HumanCallTranscriptionService } from '../services/human-call-transcription.service';
import { initializeHumanTranscription } from '../lib/human-transcription';

jest.setTimeout(30000);
(securityDatabaseUrl ? describe : describe.skip)(
  'Human calls on isolated PostgreSQL',
  () => {
    let db: DataSource,
      replica: DataSource,
      sessions: HumanCallSessionsRepository,
      other: HumanCallSessionsRepository;
    let admission: QueueAdmissionRepository,
      secondAdmission: QueueAdmissionRepository;
    const orgId = randomUUID(),
      userId = randomUUID();
    const actor = {
      id: userId,
      orgId,
      typ: 'user' as const,
      name: 'Caller',
      email: 'caller@example.com',
      role: 'agent',
    };
    const request = () => ({
      crmIntegrationId: randomUUID(),
      crmContactId: 'contact',
      sipTrunkId: randomUUID(),
      requestId: randomUUID(),
    });
    beforeAll(async () => {
      const fixture = await securityDatabase('human_call_test');
      db = fixture.db;
      replica = await fixture.connect();
      sessions = new HumanCallSessionsRepository(db);
      other = new HumanCallSessionsRepository(replica);
      admission = new QueueAdmissionRepository(db);
      secondAdmission = new QueueAdmissionRepository(replica);
    });
    afterAll(async () => {
      await replica?.destroy();
      await db?.destroy();
    });
    beforeEach(async () => {
      await db.query('TRUNCATE human_call_test.organizations CASCADE');
      await db.getRepository(Organization).save({
        id: orgId,
        name: 'Human tests',
        slug: 'human-tests',
        isActive: true,
      });
      await db.getRepository(User).save({
        id: userId,
        organizationId: orgId,
        email: actor.email,
        isActive: true,
      });
      await db.getRepository(OrganizationQueueSettings).save({
        organizationId: orgId,
        maxConcurrent: 1,
        maxDialsPerMinute: 20,
      });
    });
    const newHumanCall = () =>
      db.getRepository(Call).create(
        newCallRow({
          executionType: 'human',
          organizationId: orgId,
          direction: 'outbound',
          medium: 'sip',
          taskStatus: 'not_applicable',
            toNumber: '+919123456789',
        }),
      );
    // Creation uses a real FK; connection/provider ownership is tested by CRM's own suites.
    async function create(repository = sessions, input = request()) {
      const result = await repository.create(
        actor,
        input,
        newHumanCall(),
        'Contact',
      );
      return result;
    }
    it('serializes concurrent starts for the same user across replicas', async () => {
      // Use nullable CRM FK because this test exercises session transactions independently of provider fixtures.
      const original = request();
      const callA = newHumanCall(),
        callB = newHumanCall();
      // Fixture an active CRM connection to satisfy the persisted reference.
      await seedConnection(original.crmIntegrationId);
      const results = await Promise.allSettled([
        sessions.create(actor, original, callA, 'Contact'),
        other.create(
          actor,
          { ...original, requestId: randomUUID() },
          callB,
          'Contact',
        ),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(
        1,
      );
      expect(
        (
          results.find(
            (row) => row.status === 'rejected',
          ) as PromiseRejectedResult
        ).reason,
      ).toBeInstanceOf(ConflictException);
      expect(await db.getRepository(Call).count()).toBe(1);
    });
    async function seedConnection(id: string) {
      // Dynamically import the owner entity; no real credentials are used.
      const { OrganizationIntegration } =
        await import('../../organization-integrations/organization-integration.entity');
      await db.getRepository(OrganizationIntegration).save({
        id,
        organizationId: orgId,
        provider: 'ghl_crm',
        name: 'Test CRM',
        apiKey: 'test-placeholder',
        apiKeyPrefix: 'test',
        locationId: 'test-location',
        isActive: true,
      });
    }
    it('serializes transcript callbacks against supervisor/workspace writes and finalizes after session finish', async () => {
      const input = request(); await seedConnection(input.crmIntegrationId);
      const call = newHumanCall(); call.roomName = `human-${randomUUID()}`; initializeHumanTranscription(call);
      const { session } = await sessions.create(actor, input, call, 'Contact');
      await db.getRepository(HumanCallSession).update(session.id, { phase: 'connected' });
      const repo = new HumanCallTranscriptionRepository(db), replicaRepo = new HumanCallTranscriptionRepository(replica);
      const price = { replaceCost: jest.fn() }, config = { getOrThrow: () => 'test-placeholder' };
      const a = new HumanCallTranscriptionService(repo, config as never, price as never), b = new HumanCallTranscriptionService(replicaRepo, config as never, price as never);
      const claim = { roomName: call.roomName, jobId: 'test-job' };
      const started = await a.start(session.callId, claim);
      await expect(b.start(session.callId, { ...claim, jobId: 'other' })).rejects.toThrow(ConflictException);
      await expect(b.start(session.callId, { ...claim, roomName: 'foreign-room' })).rejects.toThrow(ConflictException);
      const segment = { id: randomUUID(), role: 'caller' as const, content: 'हाँ hello', createdAt: new Date().toISOString() };
      const payload = { jobId: claim.jobId, callbackToken: started.callbackToken, segments: [segment], audioDuration: 3, listenerDuration: 4 };
      await Promise.all([
        a.checkpoint(session.callId, payload), b.checkpoint(session.callId, payload),
        sessions.mutate(session.id, null, (current, row) => { current.phase = 'ending'; row.answeredAt = new Date(); row.status = 'completed'; }),
        other.mutateWorkspace(session.callId, actor, current => { current.workspace.notes = 'Keep these notes'; }),
      ]);
      await sessions.mutate(session.id, null, (current, row) => { current.finishedAt = new Date(); current.phase = 'ended'; row.endedAt = new Date(); });
      const final = { ...payload, answered: true, segments: [{ ...segment, id: randomUUID(), role: 'contact' as const, content: 'Goodbye' }] };
      await Promise.all([a.finish(session.callId, final), b.finish(session.callId, final)]);
      const saved = await sessions.find(session.id);
      expect(saved!.call.transcript).toHaveLength(2);
      expect(saved!.call.status).toBe('completed');
      expect(saved!.workspace.notes).toBe('Keep these notes');
      expect(saved!.call.sessionReport?.transcription).toMatchObject({ status: 'complete', audioDuration: 3 });
      expect(price.replaceCost).toHaveBeenCalledTimes(1);
      await expect(replicaRepo.mutate(randomUUID(), () => {})).rejects.toThrow(NotFoundException);
      const ai = newHumanCall(); ai.executionType = 'agent'; await db.getRepository(Call).save(ai);
      await expect(repo.mutate(ai.id, () => {})).rejects.toThrow(NotFoundException);
    });
    it('replays request IDs without a second call and fences join/end ownership', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const first = await create(sessions, input);
      const replay = await create(other, input);
      expect(replay.created).toBe(false);
      expect(replay.session.callId).toBe(first.session.callId);
      await expect(
        other.owned(first.session.callId, { ...actor, id: randomUUID() }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        other.owned(first.session.callId, { ...actor, orgId: randomUUID() }),
      ).rejects.toThrow(NotFoundException);
    });
    it('leases each due session to only one replica and rejects stale updates', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, input);
      await db
        .getRepository(HumanCallSession)
        .update(session.id, { leaseUntil: null, leaseToken: null });
      const [a, b] = await Promise.all([sessions.claimDue(), other.claimDue()]);
      expect(a.length + b.length).toBe(1);
      expect(
        await sessions.mutate(session.id, randomUUID(), (current) => {
          current.phase = 'ending';
        }),
      ).toBeNull();
    });
    it('returns a typed conflict when different users race on the same request ID', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const secondUser = await db.getRepository(User).save({
        id: randomUUID(),
        organizationId: orgId,
        email: 'second@example.com',
        isActive: true,
      });
      const results = await Promise.allSettled([
        sessions.create(actor, input, newHumanCall(), 'Contact'),
        other.create(
          { ...actor, id: secondUser.id },
          input,
          newHumanCall(),
          'Contact',
        ),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(
        1,
      );
      expect(
        (
          results.find(
            (row) => row.status === 'rejected',
          ) as PromiseRejectedResult
        ).reason,
      ).toBeInstanceOf(ConflictException);
      expect(await db.getRepository(Call).count()).toBe(1);
    });
    it('preserves caller and contact snapshots after user and connection deletion', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, input);
      await db.getRepository(User).delete(userId);
      const { OrganizationIntegration } =
        await import('../../organization-integrations/organization-integration.entity');
      await db
        .getRepository(OrganizationIntegration)
        .delete(input.crmIntegrationId);
      const historical = (await sessions.find(session.id))!;
      expect(historical.userId).toBeNull();
      expect(historical.crmIntegrationId).toBeNull();
      expect(historical.callerName).toBe(actor.name);
      expect(historical.contactName).toBe('Contact');
      expect(historical.contactPhone).toBe('+919123456789');
      expect(await sessions.actorActive(historical)).toBe(false);
    });
    it('counts an immediate AI dial once after downstream call updates', async () => {
      const ai = await db.getRepository(Call).save(newHumanCall());
      await db.getRepository(Call).update(ai.id, { executionType: 'agent' });
      const admitted = await admission.admitImmediate(orgId, ai.id);
      admitted.startedAt = new Date();
      admitted.livekitDispatchId = 'dispatch';
      await db.getRepository(Call).save(admitted);
      expect(await admission.countRateUsage(orgId)).toBe(1);
    });
    it('manual and immediate AI admission contend for one shared slot without counting a prepared session', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, input);
      await db
        .getRepository(HumanCallSession)
        .update(session.id, { phase: 'waiting_for_user' });
      const ai = await db.getRepository(Call).save(
        db.getRepository(Call).create(
          newCallRow({
            organizationId: orgId,
            direction: 'outbound',
            medium: 'sip',
          }),
        ),
      );
      const results = await Promise.allSettled([
        admission.admitImmediate(orgId, session.callId, {
          sessionId: session.id,
          leaseToken: session.leaseToken!,
        }),
        secondAdmission.admitImmediate(orgId, ai.id),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(
        1,
      );
      expect(await db.getRepository(QueueAdmission).count()).toBe(1);
      expect(await admission.countRateUsage(orgId)).toBe(1);
    });
    it('persists selected tools and serializes concurrent workspace edits across replicas after hang-up', async () => {
      const input = { ...request(), selectedTools: ['notes', 'interest', 'bookMeeting'] as const };
      await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, { ...input, selectedTools: [...input.selectedTools] });
      await db.getRepository(HumanCallSession).update(session.id, { phase: 'ended', finishedAt: new Date() });
      const a = new HumanCallWorkspaceService(sessions, {} as never), b = new HumanCallWorkspaceService(other, {} as never);
      const results = await Promise.allSettled([
        a.update(actor, session.callId, { revision: 0, notes: 'first' }),
        b.update(actor, session.callId, { revision: 0, notes: 'second' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const result = await a.get(actor, session.callId);
      expect(result.revision).toBe(1); expect(['first', 'second']).toContain(result.notes);
      expect(result.selectedTools).toEqual(['bookMeeting', 'interest', 'notes']);
      expect((await sessions.find(session.id))?.phase).toBe('ended');
    });
    it('prevents cross-user and cross-tenant workspace reads and writes in PostgreSQL', async () => {
      const input = request(); await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, input);
      const service = new HumanCallWorkspaceService(sessions, {} as never);
      for (const stranger of [{ ...actor, id: randomUUID() }, { ...actor, orgId: randomUUID() }]) {
        await expect(service.get(stranger, session.callId)).rejects.toThrow(NotFoundException);
        await expect(service.update(stranger, session.callId, { revision: 0, notes: 'attack' })).rejects.toThrow(NotFoundException);
      }
    });
    it('journals external claims across replicas before provider I/O and fences duplicate writes', async () => {
      const input = { ...request(), selectedTools: ['bookMeeting'] as ('bookMeeting')[] };
      await seedConnection(input.crmIntegrationId); const { session } = await create(sessions, input);
      let finish!: (value: unknown) => void;
      const crm = { execute: jest.fn(() => new Promise((resolve) => { finish = resolve; })) };
      const a = new HumanCallWorkspaceService(sessions, crm as never), b = new HumanCallWorkspaceService(other, crm as never);
      const action = { requestId: randomUUID(), revision: 0, kind: 'bookMeeting' as const, meeting: {
        calendarId: 'calendar', title: 'Demo', startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 88200000).toISOString(), timezone: 'Asia/Calcutta',
      } };
      const first = a.execute(actor, session.callId, action);
      while (!finish) await new Promise((resolve) => setTimeout(resolve, 10));
      expect((await b.execute(actor, session.callId, action)).actions[0].status).toBe('pending');
      expect(crm.execute).toHaveBeenCalledTimes(1);
      finish({ event: { id: 'receipt' } }); await first;
      expect((await b.get(actor, session.callId)).actions[0]).toMatchObject({ status: 'succeeded', providerId: 'receipt' });
      await b.execute(actor, session.callId, action); expect(crm.execute).toHaveBeenCalledTimes(1);
    });
    it('pause and rolling rate limits block manual admission without an external-write marker', async () => {
      const input = request();
      await seedConnection(input.crmIntegrationId);
      const { session } = await create(sessions, input);
      await db
        .getRepository(HumanCallSession)
        .update(session.id, { phase: 'waiting_for_user' });
      await db
        .getRepository(OrganizationQueueSettings)
        .update({ organizationId: orgId }, { paused: true });
      await expect(
        admission.admitImmediate(orgId, session.callId, {
          sessionId: session.id,
          leaseToken: session.leaseToken!,
        }),
      ).rejects.toThrow(ConflictException);
      expect((await sessions.find(session.id))?.dialAttemptedAt).toBeNull();
      await db
        .getRepository(OrganizationQueueSettings)
        .update(
          { organizationId: orgId },
          { paused: false, maxDialsPerMinute: 1 },
        );
      await db
        .getRepository(QueueAdmission)
        .save({ organizationId: orgId, admittedAt: new Date() });
      await expect(
        admission.admitImmediate(orgId, session.callId, {
          sessionId: session.id,
          leaseToken: session.leaseToken!,
        }),
      ).rejects.toThrow(ConflictException);
    });
  },
);
