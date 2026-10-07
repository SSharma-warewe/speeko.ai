import { AgentDirection } from '../../agents/agent.entity';
import { Call, CallMedium, CallStatus } from '../../calls/call.entity';
import { CallBatchStatus } from '../call-batch.entity';
import { QUEUE_DEFAULTS } from '../queue.defaults';
import { QueueClaimService } from '../queue-claim.service';

describe('QueueClaimService', () => {
  const ORG_ID = 'org-1';
  const CALL_ID = 'call-1';
  const CALL_ID_2 = 'call-2';

  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };
  let callRepo: {
    count: jest.Mock;
    find: jest.Mock;
  };
  let config: { get: jest.Mock };
  let qr: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let service: QueueClaimService;

  beforeEach(() => {
    qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => qr),
    };
    callRepo = {
      count: jest.fn(),
      find: jest.fn(),
    };
    config = { get: jest.fn() };
    service = new QueueClaimService(
      dataSource as never,
      callRepo as never,
      config as never,
      { countRateUsage: jest.fn().mockResolvedValue(7) } as never,
    );
  });

  function makeCall(id: string, overrides: Partial<Call> = {}): Call {
    return {
      id,
      organizationId: ORG_ID,
      status: CallStatus.CREATING,
      ...overrides,
    } as Call;
  }

  it('1. countInProgress queries creating/dialing/ready for org', async () => {
    callRepo.count.mockResolvedValue(2);
    await expect(service.countInProgress(ORG_ID)).resolves.toBe(2);
    expect(callRepo.count).toHaveBeenCalledWith({
      where: [
        {
          organizationId: ORG_ID,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.CREATING,
        },
        {
          organizationId: ORG_ID,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.DIALING,
        },
        {
          organizationId: ORG_ID,
          direction: AgentDirection.OUTBOUND,
          medium: CallMedium.SIP,
          status: CallStatus.READY,
        },
      ],
    });
  });

  it('counts committed admission rate usage through the shared repository', async () => {
    await expect(service.countDialsLastMinute(ORG_ID)).resolves.toBe(7);
  });

  it('11. findStaleInFlight loads calls by id with default thresholds', async () => {
    config.get.mockReturnValue(undefined);
    dataSource.query.mockResolvedValue([{ id: CALL_ID }]);
    const call = makeCall(CALL_ID, { status: CallStatus.DIALING });
    callRepo.find.mockResolvedValue([call]);

    const result = await service.findStaleInFlight();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id'),
      [
        CallStatus.DIALING,
        QUEUE_DEFAULTS.staleDialingSeconds,
        CallStatus.READY,
        QUEUE_DEFAULTS.staleReadySeconds,
        QUEUE_DEFAULTS.staleInFlightBatchSize,
      ],
    );
    expect(result).toEqual([call]);
  });

  it('12. findStaleInFlight empty ids skips find', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.findStaleInFlight()).resolves.toEqual([]);
    expect(callRepo.find).not.toHaveBeenCalled();
  });

  it('13. getStaleInFlightThresholds parses env; invalid falls back', () => {
    config.get.mockReturnValue(undefined);
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: QUEUE_DEFAULTS.staleDialingSeconds,
      readySeconds: QUEUE_DEFAULTS.staleReadySeconds,
    });

    config.get.mockImplementation((key: string) => {
      if (key === 'QUEUE_STALE_DIALING_SECONDS') return '45';
      if (key === 'QUEUE_STALE_READY_SECONDS') return '600';
      return undefined;
    });
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: 45,
      readySeconds: 600,
    });

    config.get.mockImplementation((key: string) => {
      if (key === 'QUEUE_STALE_DIALING_SECONDS') return '0';
      if (key === 'QUEUE_STALE_READY_SECONDS') return 'nope';
      return undefined;
    });
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: QUEUE_DEFAULTS.staleDialingSeconds,
      readySeconds: QUEUE_DEFAULTS.staleReadySeconds,
    });
  });
});
