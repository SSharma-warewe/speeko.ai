import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { applyCallEvent, CallLifecycleEvent } from '../calls/lib/call-state-machine';
import { HumanCallSession } from '../calls/human-call-session.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Call, CallStatus } from '../calls/call.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';
import { QueueAdmission } from './queue-admission.entity';
import { quietHoursState } from './quiet-hours';

export type AdmittedCall = { admissionId: string; call: Call };

/** Shared by admission and observational stats; never double-count a queued start. */
export const QUEUE_RATE_USAGE_SQL = `SELECT (
  (SELECT COUNT(*) FROM queue_admissions a
   WHERE a.organization_id = $1 AND a.admitted_at > $2::timestamptz - INTERVAL '60 seconds'
     AND a.admitted_at <= $2::timestamptz)
  + (SELECT COUNT(*) FROM calls c
     WHERE c.organization_id = $1 AND c.direction = 'outbound' AND c.medium = 'sip'
       AND c.dial_started_at > $2::timestamptz - INTERVAL '60 seconds'
       AND c.dial_started_at <= $2::timestamptz
       AND NOT EXISTS (SELECT 1 FROM queue_admissions a
         WHERE a.organization_id = c.organization_id AND a.call_id = c.id
           AND a.admitted_at = c.dial_started_at))
)::int AS count`;

@Injectable()
export class QueueAdmissionRepository {
  private readonly logger = new Logger(QueueAdmissionRepository.name);
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async admitPending(
    organizationId: string,
    leaseSeconds: number,
  ): Promise<AdmittedCall[]> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const settings = await manager.findOne(OrganizationQueueSettings, {
        where: { organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settings) return [];
      // Preserve database microseconds: JS Date truncation must not break lease identity.
      const [{ now }] = await manager.query(
        'SELECT clock_timestamp()::text AS now',
      );
      const org = await manager.findOneBy(Organization, { id: organizationId });

      // RELEASE_CLAIM: expired, unstarted reservations only; rate charges survive.
      await manager.query(
        `UPDATE calls SET status = 'pending',
        attempt_count = GREATEST(attempt_count - 1, 0), next_attempt_at = $2,
        queue_locked_at = NULL, dial_started_at = NULL, room_name = NULL,
        livekit_dispatch_id = NULL, livekit_sip_call_id = NULL,
        last_failure_code = COALESCE(last_failure_code, 'unknown'), last_failure_at = $2,
        error_message = COALESCE(error_message, 'Stale claim reclaimed'), updated_at = $2
        WHERE organization_id = $1 AND direction = 'outbound' AND medium = 'sip'
          AND status = 'creating' AND queue_locked_at IS NOT NULL
          AND execution_type = 'agent'
          AND queue_locked_at <= $2::timestamptz - make_interval(secs => $3)`,
        [organizationId, now, leaseSeconds],
      );

      const quiet = quietHoursState(new Date(now), settings);
      if (quiet === 'invalid')
        this.logger.warn(
          `Invalid quiet hours org=${organizationId}; admission blocked`,
        );
      if (
        !org?.isActive ||
        !settings.enabled ||
        settings.paused ||
        quiet !== 'open'
      )
        return [];
      const [usage] = await manager.query(
        `SELECT COUNT(*)::int AS count FROM calls
        WHERE organization_id = $1 AND direction = 'outbound' AND medium = 'sip'
          AND (status IN ('dialing', 'ready') OR (status = 'creating' AND execution_type = 'agent' AND queue_locked_at IS NOT NULL))`,
        [organizationId],
      );
      const [rate] = await manager.query(QUEUE_RATE_USAGE_SQL, [
        organizationId,
        now,
      ]);
      const limit = Math.max(
        0,
        Math.min(
          settings.maxConcurrent - usage.count,
          settings.maxDialsPerMinute - rate.count,
          settings.claimBatchSize,
        ),
      );
      if (!Number.isInteger(limit) || limit <= 0) return [];

      // Controls use settings -> batches -> calls too. Only these locked batches
      // may supply candidates, including if new rows are enqueued during admission.
      const batches: Array<{ id: string; max_concurrent: number | null }> =
        await manager.query(
          `SELECT b.id, b.max_concurrent FROM call_batches b
        WHERE b.organization_id = $1 AND b.status = 'running' AND EXISTS (
          SELECT 1 FROM calls c WHERE c.batch_id = b.id AND c.organization_id = $1
            AND c.direction = 'outbound' AND c.medium = 'sip' AND c.status = 'pending'
            AND c.next_attempt_at <= $2 AND c.attempt_count < c.max_attempts)
        ORDER BY b.id FOR UPDATE OF b`,
          [organizationId, now],
        );
      const batchIds = batches.map((b) => b.id);
      const occupied: Array<{ batch_id: string; count: number }> =
        await manager.query(
          `SELECT batch_id, COUNT(*)::int AS count FROM calls
         WHERE organization_id = $1 AND batch_id = ANY($2::uuid[])
           AND direction = 'outbound' AND medium = 'sip'
           AND status IN ('creating', 'dialing', 'ready') GROUP BY batch_id`,
          [organizationId, batchIds],
        );
      const byBatch = new Map(occupied.map((row) => [row.batch_id, row.count]));
      const batchSlots = new Map(
        batches.map((batch) => [
          batch.id,
          Math.max(
            0,
            Math.min(
              batch.max_concurrent ?? settings.maxConcurrent,
              settings.maxConcurrent,
            ) - (byBatch.get(batch.id) ?? 0),
          ),
        ]),
      );
      const admitted: AdmittedCall[] = [];
      for (let n = 0; n < limit; n++) {
        // Locked batch configuration and initial occupancy are authoritative.
        // Decrement the budget for each reservation made by this transaction.
        const availableBatches = [...batchSlots]
          .filter(([, slots]) => slots > 0)
          .map(([id]) => id);
        const [candidate] = await manager.query(
          `SELECT c.id, c.batch_id FROM calls c
          WHERE c.organization_id = $1 AND c.direction = 'outbound' AND c.medium = 'sip'
            AND c.execution_type = 'agent'
            AND c.status = 'pending' AND c.next_attempt_at IS NOT NULL AND c.next_attempt_at <= $2
            AND c.attempt_count < c.max_attempts
            AND (c.batch_id IS NULL OR c.batch_id = ANY($3::uuid[]))
          ORDER BY c.priority DESC, c.next_attempt_at, c.created_at, c.id
          LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
          [organizationId, now, availableBatches],
        );
        if (!candidate) break;
        if (candidate.batch_id)
          batchSlots.set(
            candidate.batch_id,
            batchSlots.get(candidate.batch_id)! - 1,
          );
        // CLAIM: pending -> creating, and the immutable rate charge, commit together.
        await manager.query(
          `UPDATE calls SET status = 'creating', attempt_count = attempt_count + 1,
          queue_locked_at = $2, dial_started_at = $2, started_at = COALESCE(started_at, $2),
          error_message = NULL, updated_at = $2 WHERE id = $1`,
          [candidate.id, now],
        );
        const admissionId = randomUUID();
        await manager.query(
          `INSERT INTO queue_admissions (id, organization_id, call_id, admitted_at)
          VALUES ($1, $2, $3, $4)`,
          [admissionId, organizationId, candidate.id, now],
        );
        admitted.push({
          admissionId,
          call: await manager.findOneByOrFail(Call, { id: candidate.id }),
        });
      }
      return admitted;
    });
  }

  async beginDial(
    admissionId: string,
    leaseSeconds: number,
  ): Promise<Call | null> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      const admission = await manager.findOneBy(QueueAdmission, {
        id: admissionId,
      });
      if (!admission?.callId) return null;
      const call = await manager.findOne(Call, {
        where: { id: admission.callId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!call) return null;
      // DISPATCH: creating -> dialing BEFORE external work. No capacity recount.
      const result = await manager
        .createQueryBuilder()
        .update(Call)
        .set({ status: CallStatus.DIALING, queueLockedAt: null })
        .where(
          `id = :callId AND execution_type = 'agent' AND status = 'creating' AND direction = 'outbound' AND medium = 'sip'
          AND EXISTS (SELECT 1 FROM queue_admissions a WHERE a.id = :admissionId
            AND a.call_id = calls.id AND a.organization_id = calls.organization_id
            AND a.admitted_at = calls.queue_locked_at
            AND a.admitted_at > clock_timestamp() - make_interval(secs => :leaseSeconds))`,
          { callId: call.id, admissionId, leaseSeconds },
        )
        .execute();
      return result.affected
        ? manager.findOneByOrFail(Call, { id: call.id })
        : null;
    });
  }

  async countRateUsage(organizationId: string): Promise<number> {
    const [{ now }] = await this.db.query(
      'SELECT clock_timestamp()::text AS now',
    );
    const [row] = await this.db.query(QUEUE_RATE_USAGE_SQL, [
      organizationId,
      now,
    ]);
    return Number(row.count);
  }

  /** Immediate AI and human starts serialize with queued admission on settings. */
  async admitImmediate(organizationId: string, callId: string, human?: { sessionId: string; leaseToken: string }): Promise<Call> {
    return this.db.transaction('READ COMMITTED', async manager => {
      const settings = await manager.findOne(OrganizationQueueSettings, { where: { organizationId }, lock: { mode: 'pessimistic_write' } });
      const org = await manager.findOneBy(Organization, { id: organizationId });
      const [{ now }] = await manager.query('SELECT clock_timestamp()::text AS now');
      if (!org?.isActive || !settings?.enabled || settings.paused || quietHoursState(new Date(now), settings) !== 'open') {
        throw new ConflictException('Outbound calling is disabled, paused, or outside allowed hours');
      }
      const call = await manager.findOne(Call, { where: { id: callId, organizationId }, lock: { mode: 'pessimistic_write' } });
      if (!call || call.status !== CallStatus.CREATING || call.direction !== 'outbound' || call.medium !== 'sip') throw new ConflictException('Call is no longer ready for admission');
      let session: HumanCallSession | null = null;
      if (human) {
        session = await manager.findOne(HumanCallSession, { where: { id: human.sessionId, callId }, lock: { mode: 'pessimistic_write' } });
        if (!session || session.phase !== 'waiting_for_user' || session.leaseToken !== human.leaseToken || !session.leaseUntil || session.leaseUntil <= new Date(now) || session.dialAttemptedAt) throw new ConflictException('Human call is no longer ready to dial');
      } else if (call.executionType === 'human') throw new ConflictException('Human call requires a supervisor lease');
      const [usage] = await manager.query(`SELECT COUNT(*)::int AS count FROM calls WHERE organization_id = $1 AND direction = 'outbound' AND medium = 'sip'
        AND id <> $2 AND (status IN ('dialing','ready') OR (status = 'creating' AND execution_type = 'agent' AND queue_locked_at IS NOT NULL))`, [organizationId, callId]);
      const [rate] = await manager.query(QUEUE_RATE_USAGE_SQL, [organizationId, now]);
      if (usage.count >= settings.maxConcurrent || rate.count >= settings.maxDialsPerMinute) throw new ConflictException('Outbound concurrency or dial-rate limit reached');
      applyCallEvent(call, human ? CallLifecycleEvent.HUMAN_DIAL_STARTED : CallLifecycleEvent.DISPATCH, CallStatus.DIALING);
      await manager.update(Call, { id: call.id }, { status: call.status, taskStatus: call.taskStatus, attemptCount: 1, queueLockedAt: null });
      // Preserve database microseconds so the rate query does not double-count.
      await manager.query('UPDATE calls SET dial_started_at = $2::timestamptz WHERE id = $1', [call.id, now]);
      await manager.insert(QueueAdmission, { id: randomUUID(), organizationId, callId, admittedAt: now });
      if (session) await manager.update(HumanCallSession, { id: session.id }, { phase: 'dialing', dialAttemptedAt: now });
      return manager.findOneByOrFail(Call, { id: callId });
    });
  }

  async prune(): Promise<void> {
    await this.db.query(`DELETE FROM queue_admissions WHERE id IN (
      SELECT id FROM queue_admissions WHERE admitted_at < clock_timestamp() - INTERVAL '24 hours'
      ORDER BY admitted_at LIMIT 1000 FOR UPDATE SKIP LOCKED)`);
  }
}
