import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AgentDirection } from '../agents/agent.entity';
import { Call, CallMedium, CallStatus } from '../calls/call.entity';
import { QueueAdmissionRepository } from './queue-admission.repository';
import { QUEUE_DEFAULTS, queuePositiveInt } from './queue.defaults';

@Injectable()
export class QueueClaimService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Call) private readonly callRepo: Repository<Call>,
    private readonly config: ConfigService,
    private readonly admission: QueueAdmissionRepository,
  ) {}

  async countInProgress(organizationId: string): Promise<number> {
    return this.callRepo.count({
      where: [
        {
          organizationId,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.CREATING,
        },
        {
          organizationId,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.DIALING,
        },
        {
          organizationId,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.READY,
        },
      ],
    });
  }

  countDialsLastMinute(organizationId: string): Promise<number> {
    return this.admission.countRateUsage(organizationId);
  }

  /**
   * Find dialing/ready rows that never received worker complete.
   * Global (all orgs + null org) so platform web tests are covered too.
   * Caller is responsible for fail/requeue + LiveKit cleanup.
   */
  async findStaleInFlight(limit?: number): Promise<Call[]> {
    const dialingSecs = queuePositiveInt(
      this.config.get('QUEUE_STALE_DIALING_SECONDS'),
      QUEUE_DEFAULTS.staleDialingSeconds,
    );
    const readySecs = queuePositiveInt(
      this.config.get('QUEUE_STALE_READY_SECONDS'),
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
      dialingSeconds: queuePositiveInt(
        this.config.get('QUEUE_STALE_DIALING_SECONDS'),
        QUEUE_DEFAULTS.staleDialingSeconds,
      ),
      readySeconds: queuePositiveInt(
        this.config.get('QUEUE_STALE_READY_SECONDS'),
        QUEUE_DEFAULTS.staleReadySeconds,
      ),
    };
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

}
