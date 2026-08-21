import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Call, CallMedium } from '../../calls/call.entity';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { PriceService } from '../price.service';

describe('PriceService', () => {
  let dataSource: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let sipTrunksService: { findById: jest.Mock };
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  function makeService(
    env: Record<string, string | undefined> = {},
  ): PriceService {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new PriceService(
      config,
      dataSource as never,
      sipTrunksService as unknown as SipTrunksService,
    );
  }

  function makeCall(overrides: Partial<Call> = {}): Call {
    return {
      id: 'call-1',
      medium: CallMedium.SIP,
      sipTrunkId: 'trunk-1',
      attemptCount: 1,
      usage: {
        models: [
          {
            type: 'llm_usage',
            provider: 'google',
            model: 'gemma-4-31b-it',
            inputTokens: 1_000_000,
            inputCachedTokens: 0,
            outputTokens: 0,
          },
        ],
      },
      answeredAt: new Date('2026-08-01T10:00:00.000Z'),
      endedAt: new Date('2026-08-01T10:01:00.000Z'),
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      dialStartedAt: new Date('2026-08-01T09:59:50.000Z'),
      cost: null,
      costUsd: null,
      ...overrides,
    } as Call;
  }

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (row) => row),
      createQueryBuilder: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      getRepository: jest.fn(() => repo),
    };
    sipTrunksService = {
      findById: jest.fn().mockResolvedValue({ krispEnabled: true }),
    };
  });

  it('runtimeConfig reads plan / agent deployed / vendor rate', () => {
    const service = makeService({
      LIVEKIT_PRICING_PLAN: 'scale',
      LIVEKIT_AGENT_DEPLOYED: 'true',
      LIVEKIT_SIP_VENDOR_USD_PER_MIN: '0.008',
    });
    expect(service.runtimeConfig()).toEqual({
      plan: 'scale',
      agentDeployed: true,
      sipVendorUsdPerMin: 0.008,
    });
  });

  it('applyAttemptToCall appends and sets costUsd; Krisp from trunk', async () => {
    const service = makeService({ LIVEKIT_PRICING_PLAN: 'ship' });
    const call = makeCall();
    await service.applyAttemptToCall(call);
    expect(call.cost?.markup).toBe(0);
    expect(call.cost?.attempts).toHaveLength(1);
    expect(call.costUsd).toBe(call.cost?.totalUsd);
    expect(call.cost?.lines.some((l) => l.key === 'krisp')).toBe(true);
    expect(call.cost?.lines.some((l) => l.key === 'llm')).toBe(true);

    await service.applyAttemptToCall(call);
    expect(call.cost?.attempts).toHaveLength(2);
  });

  it('fillCostIfMissing does not double-count', async () => {
    const service = makeService();
    const call = makeCall();
    await service.fillCostIfMissing(call);
    const first = call.costUsd;
    await service.fillCostIfMissing(call);
    expect(call.cost?.attempts).toHaveLength(1);
    expect(call.costUsd).toBe(first);
  });

  it('summary aggregates SQL rows', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { priced: 4, unpriced: 1, total_usd: 0.12, billed_minutes: 8 },
      ])
      .mockResolvedValueOnce([
        { key: 'tts', amount_usd: 0.08 },
        { key: 'sip', amount_usd: 0.04 },
      ])
      .mockResolvedValueOnce([
        { day: '2026-08-01', call_count: 4, total_usd: 0.12 },
      ]);
    const service = makeService({ LIVEKIT_PRICING_PLAN: 'ship' });
    const summary = await service.summary({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-02T00:00:00.000Z'),
      organizationId: 'org-1',
    });
    expect(summary.callCount).toBe(4);
    expect(summary.unpricedCount).toBe(1);
    expect(summary.totalUsd).toBe(0.12);
    expect(summary.avgUsd).toBe(0.03);
    expect(summary.byKey[0]).toEqual({ key: 'tts', amountUsd: 0.08 });
    expect(summary.daily[0].date).toBe('2026-08-01');
    expect(summary.markup).toBe(0);
  });

  it('recompute by callId 404s when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    const service = makeService();
    await expect(
      service.recompute({ callId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recompute by callId skips when already priced', async () => {
    const call = makeCall();
    const service = makeService();
    await service.fillCostIfMissing(call);
    repo.findOne.mockResolvedValue(call);
    const result = await service.recompute({ callId: 'call-1' });
    expect(result).toEqual({ priced: 0, skipped: 1 });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
