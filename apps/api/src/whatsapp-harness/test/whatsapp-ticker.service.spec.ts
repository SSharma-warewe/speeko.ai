import { ConfigService } from '@nestjs/config';
import { WhatsAppTickerService } from '../whatsapp-ticker.service';
import type { WhatsAppHarnessRepository } from '../whatsapp-harness.repository';
import type { WhatsAppHarnessService } from '../whatsapp-harness.service';
import type { OtpDeliveryRepository } from '../otp-delivery.repository';

describe('WhatsApp API ticker', () => {
  const originalFetch = global.fetch;
  const repository = { reap: jest.fn(), claim: jest.fn(), fail: jest.fn() };
  const harness = {
    readiness: jest.fn(),
    runtime: jest.fn(),
    sendOne: jest.fn(),
  };
  let ticker: WhatsAppTickerService;
  beforeEach(() => {
    jest.resetAllMocks();
    harness.readiness.mockReturnValue({
      platformEnabled: false,
      otpEnabled: false,
    });
    harness.runtime.mockResolvedValue({ id: 'turn' });
    harness.sendOne.mockResolvedValue(false);
    repository.claim.mockResolvedValue([{ id: 'turn', leaseToken: 'lease' }]);
    ticker = new WhatsAppTickerService(
      new ConfigService({
        WHATSAPP_WORKER_URL: 'http://worker.internal:8082',
        WORKER_CALLBACK_SECRET: 'secret',
        WHATSAPP_TICKER_MAX_CONCURRENT: 4,
      }),
      repository as unknown as WhatsAppHarnessRepository,
      harness as unknown as WhatsAppHarnessService,
      { reap: jest.fn() } as unknown as OtpDeliveryRepository,
    );
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('does not run overlapping ticks and dispatches without waiting for generation', async () => {
    let release!: () => void;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve({ status: 202 } as Response);
        }),
    );
    const first = ticker.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await ticker.tick();
    expect(repository.claim).toHaveBeenCalledTimes(1);
    release();
    await first;
    await ticker.sendTick();
    expect(harness.sendOne).toHaveBeenCalledTimes(4);
    expect(repository.fail).not.toHaveBeenCalled();
  });
  it('refunds a capacity rejection and lets an ambiguous dispatch lease expire', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 429 });
    await ticker.tick();
    expect(repository.fail).toHaveBeenCalledWith(
      'turn',
      'lease',
      'dispatch_http_429',
      true,
    );
    repository.fail.mockClear();
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    await ticker.tick();
    expect(repository.fail).not.toHaveBeenCalled();
  });
  it('runs without rollout flags and reports optional configuration readiness', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 202 });
    await ticker.tick();
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(ticker.health()).toMatchObject({
      enabled: true,
      platformEnabled: false,
      otpEnabled: false,
      lastTickAt: expect.any(Date),
      lastError: null,
    });
    harness.readiness.mockReturnValue({
      platformEnabled: true,
      otpEnabled: true,
    });
    expect(ticker.health()).toMatchObject({
      enabled: true,
      platformEnabled: true,
      otpEnabled: true,
    });
  });
  it('continues delivery when dispatch is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await Promise.all([ticker.tick(), ticker.sendTick()]);
    expect(harness.sendOne).toHaveBeenCalledTimes(4);
    expect(ticker.health().lastSendError).toBeNull();
  });
  it('never dispatches task jobs to a worker without task protocol support', async () => {
    harness.runtime.mockResolvedValue({
      id: 'turn',
      task: { sessionId: 'task' },
    });
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ready: true }) });
    await ticker.tick();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(
      'turn',
      'lease',
      'worker_task_protocol_unavailable',
      true,
    );
    repository.fail.mockClear();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ taskProtocolVersion: 1 }),
      })
      .mockResolvedValueOnce({ status: 202 });
    await ticker.tick();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(repository.fail).not.toHaveBeenCalled();
  });
  it('requires explicit version 2 support for configurable jobs while preserving legacy health', async () => {
    harness.runtime.mockResolvedValue({
      id: 'turn',
      taskProtocolVersion: 2,
      task: { sessionId: 'task' },
    });
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ taskProtocolVersion: 1 }),
      });
    await ticker.tick();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(
      'turn',
      'lease',
      'worker_task_protocol_unavailable',
      true,
    );
    repository.fail.mockClear();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskProtocolVersion: 1,
          supportedTaskProtocolVersions: [1, 2],
        }),
      })
      .mockResolvedValueOnce({ status: 202 });
    await ticker.tick();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(repository.fail).not.toHaveBeenCalled();
  });
});
