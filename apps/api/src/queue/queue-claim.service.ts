import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Call, CallStatus } from '../calls/call.entity';
import { CallBatchStatus } from './call-batch.entity';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';
import { QUEUE_DEFAULTS } from './queue.defaults';

@Injectable()
export class QueueClaimService {
  private readonly logger = new Logger(QueueClaimService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Call) private readonly callRepo: Repository<Call>,
    private readonly config: ConfigService,
  ) {}

  async countInProgress(organizationId: string): Promise<number> {
    return this.callRepo.count({
      where: [
        { organizationId, status: CallStatus.CREATING },
        { organizationId, status: CallStatus.DIALING },
        { organizationId, status: CallStatus.READY },
      ],
    });
  }

  /**
   * In-flight count excluding one call (used before dialing a claimed row so
   * that row's own CREATING status does not block itself).
   */
  async countInProgressExcluding(
    organizationId: string,
    excludeCallId: string,
  ): Promise<number> {
    const row = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt
       FROM calls
       WHERE organization_id = $1
         AND id <> $2
         AND status = ANY($3::text[])`,
      [
        organizationId,
        excludeCallId,
        [CallStatus.CREATING, CallStatus.DIALING, CallStatus.READY],
      ],
    );
    return Number(row[0]?.cnt ?? 0);
  }

  /**
   * Put a claimed CREATING call back to pending without burning an attempt.
   * Used when a SIP channel slot opened at claim time but is full before dial
   * (e.g. previous dial in the same tick already answered and is still live).
   */
  async releaseClaimToPending(callId: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `
      UPDATE calls
      SET
        status = $1,
        attempt_count = GREATEST(attempt_count - 1, 0),
        next_attempt_at = NOW(),
        queue_locked_at = NULL,
        dial_started_at = NULL,
        room_name = NULL,
        livekit_dispatch_id = NULL,
        livekit_sip_call_id = NULL,
        error_message = NULL,
        updated_at = NOW()
      WHERE id = $2
        AND status = $3
      `,
      [CallStatus.PENDING, callId, CallStatus.CREATING],
    );
    return this.affectedCount(result) > 0;
  }

  async countDialsLastMinute(organizationId: string): Promise<number> {
    const row = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cnt
       FROM calls
       WHERE organization_id = $1
         AND dial_started_at >= NOW() - INTERVAL '1 minute'`,
      [organizationId],
    );
    return Number(row[0]?.cnt ?? 0);
  }

  /**
   * Atomically claim up to `limit` pending calls for dial.
   * Returns full Call entities loaded after claim.
   */
  async claimPending(
    organizationId: string,
    limit: number,
  ): Promise<Call[]> {
    if (limit <= 0) {
      return [];
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // Select ids under lock first (more reliable than UPDATE RETURNING shape)
      const locked: Array<{ id: string }> = await qr.query(
        `
        SELECT c.id
        FROM calls c
        LEFT JOIN call_batches b ON b.id = c.batch_id
        WHERE c.organization_id = $1
          AND c.status = $2
          AND c.next_attempt_at IS NOT NULL
          AND c.next_attempt_at <= NOW()
          AND (b.id IS NULL OR b.status = $3)
        ORDER BY c.priority DESC, c.next_attempt_at ASC, c.created_at ASC
        FOR UPDATE OF c SKIP LOCKED
        LIMIT $4
        `,
        [
          organizationId,
          CallStatus.PENDING,
          CallBatchStatus.RUNNING,
          limit,
        ],
      );

      const ids = this.extractIds(locked);
      if (ids.length === 0) {
        await qr.commitTransaction();
        return [];
      }

      await qr.query(
        `
        UPDATE calls
        SET
          status = $1,
          attempt_count = attempt_count + 1,
          queue_locked_at = NOW(),
          dial_started_at = NOW(),
          started_at = COALESCE(started_at, NOW()),
          error_message = NULL,
          updated_at = NOW()
        WHERE id = ANY($2::uuid[])
        `,
        [CallStatus.CREATING, ids],
      );

      await qr.commitTransaction();

      const calls = await this.callRepo.find({ where: { id: In(ids) } });
      const byId = new Map(calls.map((c) => [c.id, c]));
      const ordered = ids.map((id) => byId.get(id)).filter((c): c is Call => !!c);

      this.logger.log(
        `Claimed ${ordered.length} call(s) org=${organizationId} ids=${ids.join(',')}`,
      );
      return ordered;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Claim failed org=${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  async reclaimStale(organizationId: string): Promise<number> {
    const lease = this.intEnv(
      'QUEUE_CLAIM_LEASE_SECONDS',
      QUEUE_DEFAULTS.claimLeaseSeconds,
    );
    const result = await this.dataSource.query(
      `
      UPDATE calls
      SET
        status = $1,
        attempt_count = GREATEST(attempt_count - 1, 0),
        next_attempt_at = NOW(),
        queue_locked_at = NULL,
        dial_started_at = NULL,
        room_name = NULL,
        livekit_dispatch_id = NULL,
        livekit_sip_call_id = NULL,
        last_failure_code = COALESCE(last_failure_code, $2),
        last_failure_at = NOW(),
        error_message = COALESCE(error_message, 'Stale claim reclaimed'),
        updated_at = NOW()
      WHERE organization_id = $3
        AND status = $4
        AND queue_locked_at IS NOT NULL
        AND queue_locked_at < NOW() - make_interval(secs => $5)
      `,
      [
        CallStatus.PENDING,
        'unknown',
        organizationId,
        CallStatus.CREATING,
        lease,
      ],
    );
    const count = this.affectedCount(result);
    if (count > 0) {
      this.logger.warn(`Reclaimed ${count} stale creating call(s) org=${organizationId}`);
    }
    return count;
  }

  /**
   * Find dialing/ready rows that never received worker complete.
   * Global (all orgs + null org) so platform web tests are covered too.
   * Caller is responsible for fail/requeue + LiveKit cleanup.
   */
  async findStaleInFlight(limit?: number): Promise<Call[]> {
    const dialingSecs = this.intEnv(
      'QUEUE_STALE_DIALING_SECONDS',
      QUEUE_DEFAULTS.staleDialingSeconds,
    );
    const readySecs = this.intEnv(
      'QUEUE_STALE_READY_SECONDS',
      QUEUE_DEFAULTS.staleReadySeconds,
    );
    const batch =
      limit != null && limit > 0
        ? limit
        : QUEUE_DEFAULTS.staleInFlightBatchSize;

    const rows: Array<{ id: string }> = await this.dataSource.query(
      `
      SELECT id
      FROM calls
      WHERE (
        status = $1
        AND COALESCE(dial_started_at, started_at, updated_at)
            < NOW() - make_interval(secs => $2)
      ) OR (
        status = $3
        AND COALESCE(answered_at, dial_started_at, started_at, updated_at)
            < NOW() - make_interval(secs => $4)
      )
      ORDER BY updated_at ASC
      LIMIT $5
      `,
      [
        CallStatus.DIALING,
        dialingSecs,
        CallStatus.READY,
        readySecs,
        batch,
      ],
    );

    const ids = this.extractIds(rows);
    if (ids.length === 0) {
      return [];
    }

    const calls = await this.callRepo.find({ where: { id: In(ids) } });
    const byId = new Map(calls.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is Call => !!c);
  }

  /** Thresholds used by findStaleInFlight (for log messages). */
  getStaleInFlightThresholds(): {
    dialingSeconds: number;
    readySeconds: number;
  } {
    return {
      dialingSeconds: this.intEnv(
        'QUEUE_STALE_DIALING_SECONDS',
        QUEUE_DEFAULTS.staleDialingSeconds,
      ),
      readySeconds: this.intEnv(
        'QUEUE_STALE_READY_SECONDS',
        QUEUE_DEFAULTS.staleReadySeconds,
      ),
    };
  }

  async forceRequeueCreating(organizationId: string): Promise<number> {
    const result = await this.dataSource.query(
      `
      UPDATE calls
      SET
        status = $1,
        attempt_count = GREATEST(attempt_count - 1, 0),
        next_attempt_at = NOW(),
        queue_locked_at = NULL,
        dial_started_at = NULL,
        room_name = NULL,
        livekit_dispatch_id = NULL,
        livekit_sip_call_id = NULL,
        error_message = 'Forced requeue of stuck creating',
        updated_at = NOW()
      WHERE organization_id = $2
        AND status = $3
      `,
      [CallStatus.PENDING, organizationId, CallStatus.CREATING],
    );
    return this.affectedCount(result);
  }

  effectiveMaxConcurrent(
    settings: OrganizationQueueSettings,
    batchOverride?: number | null,
  ): number {
    if (batchOverride != null && batchOverride > 0) {
      return Math.min(settings.maxConcurrent, batchOverride);
    }
    return settings.maxConcurrent;
  }

  private extractIds(raw: unknown): string[] {
    if (!raw) return [];
    // pg/TypeORM: rows array; sometimes [rows, count]
    let rows: unknown[] = [];
    if (Array.isArray(raw)) {
      if (raw.length === 2 && typeof raw[1] === 'number' && Array.isArray(raw[0])) {
        rows = raw[0] as unknown[];
      } else {
        rows = raw;
      }
    }
    return rows
      .map((r) => {
        if (!r || typeof r !== 'object') return '';
        const o = r as Record<string, unknown>;
        const id = o.id ?? o.ID ?? o.call_id;
        return id != null ? String(id) : '';
      })
      .filter((id) => !!id && id !== 'undefined' && id !== 'null');
  }

  private affectedCount(result: unknown): number {
    if (Array.isArray(result) && typeof (result as unknown[])[1] === 'number') {
      return (result as unknown[])[1] as number;
    }
    return 0;
  }

  private intEnv(key: string, fallback: number): number {
    const raw = this.config.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
}
