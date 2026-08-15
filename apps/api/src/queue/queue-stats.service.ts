import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CallStatus } from '../calls/call.entity';
import { CallBatchStatus } from './call-batch.entity';
import { CallBatchesRepository } from './call-batches.repository';
import {
  AdminQueueStatsResponseDto,
  OrgQueueStatsResponseDto,
  QueueStatsDailyDto,
} from './dto/queue-stats-response.dto';
import { OrganizationQueueSettingsService } from './organization-queue-settings.service';
import { QueueClaimService } from './queue-claim.service';
import { QueueDialerService } from './queue-dialer.service';

export const DAILY_HISTORY_DAYS = 14;

type DailyQueryRow = {
  day: Date | string;
  total: number | string;
  completed: number | string;
  failed: number | string;
  cancelled: number | string;
};

@Injectable()
export class QueueStatsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settingsService: OrganizationQueueSettingsService,
    private readonly claimService: QueueClaimService,
    private readonly dialer: QueueDialerService,
    private readonly batchesRepo: CallBatchesRepository,
  ) {}

  async forOrganization(
    organizationId: string,
  ): Promise<OrgQueueStatsResponseDto> {
    const settings = await this.settingsService.getOrCreate(organizationId);
    const counts = await this.countByStatus(organizationId);
    const pendingReadyNow = await this.countPendingReady(organizationId);
    const scheduledRetries = await this.countScheduledRetries(organizationId);
    const avgAttempt = await this.avgAttemptCount(organizationId);
    const inProgress =
      (counts[CallStatus.CREATING] ?? 0) +
      (counts[CallStatus.DIALING] ?? 0) +
      (counts[CallStatus.READY] ?? 0);
    const dialsLastMinute =
      await this.claimService.countDialsLastMinute(organizationId);
    const runningBatches = await this.batchesRepo.countByOrganizationAndStatus(
      organizationId,
      CallBatchStatus.RUNNING,
    );
    const pausedBatches = await this.batchesRepo.countByOrganizationAndStatus(
      organizationId,
      CallBatchStatus.PAUSED,
    );
    const dialer = this.dialer.getHealth();
    const daily = await this.dailyVolume(organizationId);

    return {
      organizationId,
      queue: {
        enabled: settings.enabled,
        paused: settings.paused,
        maxConcurrent: settings.maxConcurrent,
        maxDialsPerMinute: settings.maxDialsPerMinute,
        inProgress,
        availableSlots: Math.max(0, settings.maxConcurrent - inProgress),
        dialsLastMinute,
      },
      counts: {
        pending: counts[CallStatus.PENDING] ?? 0,
        pendingReadyNow,
        creating: counts[CallStatus.CREATING] ?? 0,
        dialing: counts[CallStatus.DIALING] ?? 0,
        ready: counts[CallStatus.READY] ?? 0,
        completed: counts[CallStatus.COMPLETED] ?? 0,
        failed: counts[CallStatus.FAILED] ?? 0,
        cancelled: counts[CallStatus.CANCELLED] ?? 0,
      },
      retries: {
        scheduled: scheduledRetries,
        avgAttemptCount: avgAttempt,
      },
      batches: {
        running: runningBatches,
        paused: pausedBatches,
      },
      dialer: {
        globalEnabled: dialer.globalEnabled,
        lastTickAt: dialer.lastTickAt,
        lastClaimCount: dialer.lastClaimCount,
        lastError: dialer.lastError,
      },
      daily,
      asOf: new Date(),
    };
  }

  async adminSummary(): Promise<AdminQueueStatsResponseDto> {
    const allSettings = await this.settingsService.findAll();
    const orgs: OrgQueueStatsResponseDto[] = [];
    for (const s of allSettings) {
      orgs.push(await this.forOrganization(s.organizationId));
    }
    const dialer = this.dialer.getHealth();
    const totals = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      orgsEnabled: 0,
      orgsPaused: 0,
    };
    for (const o of orgs) {
      totals.pending += o.counts.pending;
      totals.inProgress += o.queue.inProgress;
      totals.completed += o.counts.completed;
      totals.failed += o.counts.failed;
      totals.cancelled += o.counts.cancelled;
      if (o.queue.enabled) totals.orgsEnabled += 1;
      if (o.queue.paused) totals.orgsPaused += 1;
    }
    return {
      totals,
      dialer: {
        globalEnabled: dialer.globalEnabled,
        lastTickAt: dialer.lastTickAt,
        lastClaimCount: dialer.lastClaimCount,
        lastError: dialer.lastError,
      },
      organizations: orgs,
      asOf: new Date(),
    };
  }

  private async countByStatus(
    organizationId: string,
  ): Promise<Record<string, number>> {
    const rows = await this.dataSource.query(
      `
      SELECT status, COUNT(*)::int AS cnt
      FROM calls
      WHERE organization_id = $1
      GROUP BY status
      `,
      [organizationId],
    );
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.status] = Number(r.cnt);
    }
    return out;
  }

  private async countPendingReady(organizationId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM calls c
      LEFT JOIN call_batches b ON b.id = c.batch_id
      WHERE c.organization_id = $1
        AND c.status = $2
        AND c.next_attempt_at IS NOT NULL
        AND c.next_attempt_at <= NOW()
        AND (b.id IS NULL OR b.status = $3)
      `,
      [organizationId, CallStatus.PENDING, CallBatchStatus.RUNNING],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  private async countScheduledRetries(
    organizationId: string,
  ): Promise<number> {
    const rows = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM calls
      WHERE organization_id = $1
        AND status = $2
        AND attempt_count > 0
        AND next_attempt_at > NOW()
      `,
      [organizationId, CallStatus.PENDING],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  private async avgAttemptCount(organizationId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `
      SELECT COALESCE(AVG(attempt_count), 0)::float AS avg
      FROM calls
      WHERE organization_id = $1
        AND medium = 'sip'
      `,
      [organizationId],
    );
    return Math.round(Number(rows[0]?.avg ?? 0) * 100) / 100;
  }

  private async dailyVolume(
    organizationId: string,
    now = new Date(),
  ): Promise<QueueStatsDailyDto[]> {
    const rows = (await this.dataSource.query(
      `
      SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = $2)::int AS completed,
             COUNT(*) FILTER (WHERE status = $3)::int AS failed,
             COUNT(*) FILTER (WHERE status = $4)::int AS cancelled
      FROM calls
      WHERE organization_id = $1
        AND created_at >= ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - ($5::int - 1))
      GROUP BY 1
      ORDER BY 1
      `,
      [
        organizationId,
        CallStatus.COMPLETED,
        CallStatus.FAILED,
        CallStatus.CANCELLED,
        DAILY_HISTORY_DAYS,
      ],
    )) as DailyQueryRow[];
    return this.padDailyWindow(rows, DAILY_HISTORY_DAYS, now);
  }

  padDailyWindow(
    rows: DailyQueryRow[],
    days = DAILY_HISTORY_DAYS,
    now = new Date(),
  ): QueueStatsDailyDto[] {
    const byDay = new Map<string, QueueStatsDailyDto>();
    for (const row of rows) {
      const date = utcDateKey(row.day);
      byDay.set(date, {
        date,
        total: Number(row.total) || 0,
        completed: Number(row.completed) || 0,
        failed: Number(row.failed) || 0,
        cancelled: Number(row.cancelled) || 0,
      });
    }
    const end = utcDateKey(now);
    const start = shiftUtcDateKey(end, -(days - 1));
    const out: QueueStatsDailyDto[] = [];
    for (let i = 0; i < days; i++) {
      const date = shiftUtcDateKey(start, i);
      out.push(
        byDay.get(date) ?? {
          date,
          total: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        },
      );
    }
    return out;
  }
}

function utcDateKey(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return trimmed.slice(0, 10);
}

function shiftUtcDateKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
