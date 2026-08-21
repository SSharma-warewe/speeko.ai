import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Call, CallMedium } from '../calls/call.entity';
import { SipTrunksService } from '../sip-trunks/sip-trunks.service';
import {
  isCallCostSnapshot,
  mergeAttemptIntoSnapshot,
  priceAttempt,
  snapshotFromSingleAttempt,
} from './price.calculator';
import { parsePricingPlan, PRICE_CATALOG_AS_OF } from './price.catalog';
import { roundUsd } from './price.money';
import type {
  CallCostSnapshot,
  CostLineKey,
  PriceAttemptInput,
  PriceRuntimeConfig,
} from './price.types';

export type CostSummaryFilter = {
  from?: Date;
  to?: Date;
  organizationId?: string;
};

export type CostSummaryByKey = {
  key: CostLineKey | string;
  amountUsd: number;
};

export type CostSummaryDaily = {
  date: string;
  callCount: number;
  totalUsd: number;
};

export type CostSummary = {
  currency: 'USD';
  markup: 0;
  plan: PriceRuntimeConfig['plan'];
  catalogAsOf: string;
  from: string;
  to: string;
  organizationId: string | null;
  callCount: number;
  unpricedCount: number;
  totalUsd: number;
  avgUsd: number;
  billedMinutes: number;
  byKey: CostSummaryByKey[];
  daily: CostSummaryDaily[];
};

export type CostRecomputeFilter = {
  callId?: string;
  organizationId?: string;
  from?: Date;
  to?: Date;
  replace?: boolean;
  limit?: number;
};

export type CostRecomputeResult = {
  priced: number;
  skipped: number;
};

const DEFAULT_SUMMARY_DAYS = 30;
const RECOMPUTE_LIMIT = 500;

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sipTrunksService: SipTrunksService,
  ) {}

  runtimeConfig(): PriceRuntimeConfig {
    return {
      plan: parsePricingPlan(this.config.get<string>('LIVEKIT_PRICING_PLAN')),
      agentDeployed: this.isEnabled('LIVEKIT_AGENT_DEPLOYED'),
      sipVendorUsdPerMin: this.sipVendorRate(),
    };
  }

  priceAttempt(input: PriceAttemptInput) {
    return priceAttempt(input, this.runtimeConfig());
  }

  /**
   * Price the current attempt from usage + timestamps and append onto call.cost.
   * Call before resetForRequeue so dial timestamps are still present.
   */
  async applyAttemptToCall(call: Call): Promise<CallCostSnapshot> {
    const krispEnabled = await this.resolveKrispEnabled(call);
    const config = this.runtimeConfig();
    const attempt = priceAttempt(
      this.inputFromCall(call, krispEnabled),
      config,
    );
    const snapshot = mergeAttemptIntoSnapshot(
      isCallCostSnapshot(call.cost) ? call.cost : null,
      attempt,
      config,
    );
    call.cost = snapshot;
    call.costUsd = snapshot.totalUsd;
    return snapshot;
  }

  /** Fill cost only when missing (idempotent complete / backfill). */
  async fillCostIfMissing(call: Call): Promise<CallCostSnapshot | null> {
    if (isCallCostSnapshot(call.cost)) {
      if (call.costUsd == null) call.costUsd = call.cost.totalUsd;
      return call.cost;
    }
    const krispEnabled = await this.resolveKrispEnabled(call);
    const config = this.runtimeConfig();
    const attempt = priceAttempt(
      this.inputFromCall(call, krispEnabled),
      config,
    );
    const snapshot = snapshotFromSingleAttempt(attempt, config);
    call.cost = snapshot;
    call.costUsd = snapshot.totalUsd;
    return snapshot;
  }

  /** Replace cost with a single attempt priced from current usage (admin backfill). */
  async replaceCost(call: Call): Promise<CallCostSnapshot> {
    const krispEnabled = await this.resolveKrispEnabled(call);
    const config = this.runtimeConfig();
    const attempt = priceAttempt(
      this.inputFromCall(call, krispEnabled),
      config,
    );
    const snapshot = snapshotFromSingleAttempt(attempt, config);
    call.cost = snapshot;
    call.costUsd = snapshot.totalUsd;
    return snapshot;
  }

  async summary(filter: CostSummaryFilter = {}): Promise<CostSummary> {
    const { from, to } = this.resolveRange(filter.from, filter.to);
    const orgId = filter.organizationId ?? null;
    const params: unknown[] = [from, to];
    let orgSql = '';
    if (orgId) {
      params.push(orgId);
      orgSql = ` AND organization_id = $${params.length}`;
    }

    const totals = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE cost_usd IS NOT NULL)::int AS priced,
        COUNT(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced,
        COALESCE(SUM(cost_usd), 0)::float AS total_usd,
        COALESCE(
          SUM(COALESCE((cost->>'billedMinutes')::numeric, 0)),
          0
        )::float AS billed_minutes
      FROM calls
      WHERE created_at >= $1 AND created_at < $2
      ${orgSql}
      `,
      params,
    );

    const byKeyRows = await this.dataSource.query(
      `
      SELECT line->>'key' AS key,
             COALESCE(SUM((line->>'amountUsd')::numeric), 0)::float AS amount_usd
      FROM calls
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cost->'lines', '[]'::jsonb)) AS line
      WHERE created_at >= $1 AND created_at < $2
        AND cost IS NOT NULL
      ${orgSql}
      GROUP BY 1
      ORDER BY 2 DESC
      `,
      params,
    );

    const dailyRows = await this.dataSource.query(
      `
      SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE cost_usd IS NOT NULL)::int AS call_count,
             COALESCE(SUM(cost_usd), 0)::float AS total_usd
      FROM calls
      WHERE created_at >= $1 AND created_at < $2
      ${orgSql}
      GROUP BY 1
      ORDER BY 1
      `,
      params,
    );

    const priced = Number(totals[0]?.priced ?? 0);
    const totalUsd = roundUsd(Number(totals[0]?.total_usd ?? 0));
    const config = this.runtimeConfig();

    return {
      currency: 'USD',
      markup: 0,
      plan: config.plan,
      catalogAsOf: PRICE_CATALOG_AS_OF,
      from: from.toISOString(),
      to: to.toISOString(),
      organizationId: orgId,
      callCount: priced,
      unpricedCount: Number(totals[0]?.unpriced ?? 0),
      totalUsd,
      avgUsd: priced > 0 ? roundUsd(totalUsd / priced) : 0,
      billedMinutes: roundUsd(Number(totals[0]?.billed_minutes ?? 0)),
      byKey: (byKeyRows as Array<{ key: string; amount_usd: number }>).map(
        (r) => ({
          key: r.key,
          amountUsd: roundUsd(Number(r.amount_usd ?? 0)),
        }),
      ),
      daily: (dailyRows as Array<{
        day: string;
        call_count: number;
        total_usd: number;
      }>).map((r) => ({
        date: r.day,
        callCount: Number(r.call_count ?? 0),
        totalUsd: roundUsd(Number(r.total_usd ?? 0)),
      })),
    };
  }

  async recompute(filter: CostRecomputeFilter = {}): Promise<CostRecomputeResult> {
    if (filter.callId) {
      const call = await this.dataSource.getRepository(Call).findOne({
        where: { id: filter.callId },
      });
      if (!call) {
        throw new NotFoundException(`Call not found: ${filter.callId}`);
      }
      if (isCallCostSnapshot(call.cost) && !filter.replace) {
        return { priced: 0, skipped: 1 };
      }
      if (filter.replace) {
        await this.replaceCost(call);
      } else {
        await this.fillCostIfMissing(call);
      }
      await this.dataSource.getRepository(Call).save(call);
      return { priced: 1, skipped: 0 };
    }

    const { from, to } = this.resolveRange(filter.from, filter.to);
    const limit = Math.min(
      Math.max(1, filter.limit ?? RECOMPUTE_LIMIT),
      RECOMPUTE_LIMIT,
    );
    const qb = this.dataSource
      .getRepository(Call)
      .createQueryBuilder('c')
      .where('c.created_at >= :from', { from })
      .andWhere('c.created_at < :to', { to })
      .orderBy('c.created_at', 'ASC')
      .take(limit);

    if (filter.organizationId) {
      qb.andWhere('c.organization_id = :orgId', {
        orgId: filter.organizationId,
      });
    }
    if (!filter.replace) {
      qb.andWhere('c.cost IS NULL');
    }

    const rows = await qb.getMany();
    let priced = 0;
    let skipped = 0;
    for (const call of rows) {
      if (isCallCostSnapshot(call.cost) && !filter.replace) {
        skipped += 1;
        continue;
      }
      if (filter.replace) {
        await this.replaceCost(call);
      } else {
        await this.fillCostIfMissing(call);
      }
      await this.dataSource.getRepository(Call).save(call);
      priced += 1;
    }
    this.logger.log(
      `Cost recompute priced=${priced} skipped=${skipped} replace=${!!filter.replace}`,
    );
    return { priced, skipped };
  }

  private inputFromCall(call: Call, krispEnabled: boolean): PriceAttemptInput {
    return {
      attempt: Math.max(1, call.attemptCount || 1),
      medium: call.medium ?? CallMedium.WEB,
      usage: call.usage,
      answeredAt: call.answeredAt,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      dialStartedAt: call.dialStartedAt,
      krispEnabled,
    };
  }

  private async resolveKrispEnabled(call: Call): Promise<boolean> {
    if (call.medium !== CallMedium.SIP || !call.sipTrunkId) return false;
    try {
      const trunk = await this.sipTrunksService.findById(call.sipTrunkId);
      return trunk?.krispEnabled === true;
    } catch {
      return false;
    }
  }

  private isEnabled(key: string): boolean {
    const raw = this.config.get<string>(key);
    return raw === 'true' || raw === '1';
  }

  private sipVendorRate(): number {
    const raw = this.config.get<string | number>('LIVEKIT_SIP_VENDOR_USD_PER_MIN');
    const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private resolveRange(from?: Date, to?: Date): { from: Date; to: Date } {
    const end = to ?? new Date();
    const start =
      from ??
      new Date(end.getTime() - DEFAULT_SUMMARY_DAYS * 24 * 60 * 60 * 1000);
    return { from: start, to: end };
  }
}
