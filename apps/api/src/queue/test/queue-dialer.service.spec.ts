import { QueueDialerService } from '../queue-dialer.service';
import { Call } from '../../calls/call.entity';

describe('QueueDialerService', () => {
  const config = { get: jest.fn() };
  const settings = { findEnabledAndNotPaused: jest.fn() };
  const admission = { admitPending: jest.fn() };
  const dial = { dialClaimedCall: jest.fn() };
  const failure = { reapStaleInFlight: jest.fn() };
  let service: QueueDialerService;
  const admitted = (id: string) => ({
    admissionId: `admission-${id}`,
    call: { id } as Call,
  });
  beforeEach(() => {
    jest.resetAllMocks();
    settings.findEnabledAndNotPaused.mockResolvedValue([
      { organizationId: 'a' },
      { organizationId: 'b' },
    ]);
    admission.admitPending.mockResolvedValue([]);
    failure.reapStaleInFlight.mockResolvedValue(0);
    service = new QueueDialerService(
      config as never,
      settings as never,
      admission as never,
      dial as never,
      failure as never,
    );
  });
  it.each(['false', '0'])(
    'disabled %s does no scheduling work',
    async (value) => {
      config.get.mockReturnValue(value);
      await service.tick();
      expect(admission.admitPending).not.toHaveBeenCalled();
      expect(failure.reapStaleInFlight).not.toHaveBeenCalled();
    },
  );
  it('uses complete admission and dials by reservation identity', async () => {
    admission.admitPending.mockResolvedValueOnce([
      admitted('1'),
      admitted('2'),
    ]);
    await service.tick();
    expect(admission.admitPending.mock.calls).toEqual([['a'], ['b']]);
    expect(dial.dialClaimedCall.mock.calls).toEqual([
      ['admission-1'],
      ['admission-2'],
    ]);
    expect(service.getHealth()).toMatchObject({
      lastClaimCount: 2,
      lastError: null,
      ticking: false,
    });
  });
  it('does not dial when admission grants no reservations', async () => {
    await service.tick();
    expect(dial.dialClaimedCall).not.toHaveBeenCalled();
  });
  it('continues other organizations after admission failure', async () => {
    admission.admitPending
      .mockRejectedValueOnce(new Error('fixture failure'))
      .mockResolvedValueOnce([admitted('2')]);
    await service.tick();
    expect(dial.dialClaimedCall).toHaveBeenCalledWith('admission-2');
  });
  it('continues remaining reservations after a dial failure', async () => {
    admission.admitPending.mockResolvedValueOnce([
      admitted('1'),
      admitted('2'),
    ]);
    dial.dialClaimedCall.mockRejectedValueOnce(new Error('fixture failure'));
    await service.tick();
    expect(dial.dialClaimedCall).toHaveBeenCalledTimes(2);
  });
  it('continues admission when stale recovery fails', async () => {
    failure.reapStaleInFlight.mockRejectedValue(new Error('fixture failure'));
    await service.tick();
    expect(admission.admitPending).toHaveBeenCalledTimes(2);
  });
  it('records discovery failures and releases its tick guard', async () => {
    settings.findEnabledAndNotPaused.mockRejectedValue(
      new Error('fixture failure'),
    );
    await service.tick();
    expect(service.getHealth()).toMatchObject({
      lastError: 'fixture failure',
      ticking: false,
    });
  });
  it('prevents overlapping ticks in one replica', async () => {
    let resume!: () => void;
    failure.reapStaleInFlight.mockReturnValue(
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
    );
    const first = service.tick();
    await service.tick();
    expect(failure.reapStaleInFlight).toHaveBeenCalledTimes(1);
    resume();
    await first;
    expect(admission.admitPending).toHaveBeenCalledTimes(2);
  });
});
