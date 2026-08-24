import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AgentDirection } from '../../agents/agent.entity';
import {
  Call,
  CallBucket,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';
import {
  BATCH_ID,
  CALL_ID,
  ORG_AGENT_ID,
  ORG_ID,
  OTHER_ORG_ID,
  PROFILE_ID,
  TEMPLATE_ID,
  TRUNK_ID,
  createCallsHarness,
  orgAgent,
  template,
  trunk,
} from './helpers/calls-mocks';

describe('CallWorkerService', () => {
  let callsRepository: ReturnType<typeof createCallsHarness>['callsRepository'];
  let agentsService: ReturnType<typeof createCallsHarness>['agentsService'];
  let organizationAgentsService: ReturnType<typeof createCallsHarness>['organizationAgentsService'];
  let toolProfilesService: ReturnType<typeof createCallsHarness>['toolProfilesService'];
  let sipTrunksService: ReturnType<typeof createCallsHarness>['sipTrunksService'];
  let priceService: ReturnType<typeof createCallsHarness>['priceService'];
  let livekit: ReturnType<typeof createCallsHarness>['livekit'];
  let queueRetryService: ReturnType<typeof createCallsHarness>['queueRetryService'];
  let queueClaimService: ReturnType<typeof createCallsHarness>['queueClaimService'];
  let callBatchesService: ReturnType<typeof createCallsHarness>['callBatchesService'];
  let webTest: ReturnType<typeof createCallsHarness>['webTest'];
  let dial: ReturnType<typeof createCallsHarness>['dial'];
  let worker: ReturnType<typeof createCallsHarness>['worker'];
  let callFailure: ReturnType<typeof createCallsHarness>['callFailure'];
  let calls: ReturnType<typeof createCallsHarness>['calls'];
  let makeCall: ReturnType<typeof createCallsHarness>['makeCall'];

  beforeEach(() => {
    const h = createCallsHarness();
    callsRepository = h.callsRepository;
    agentsService = h.agentsService;
    organizationAgentsService = h.organizationAgentsService;
    toolProfilesService = h.toolProfilesService;
    sipTrunksService = h.sipTrunksService;
    priceService = h.priceService;
    livekit = h.livekit;
    queueRetryService = h.queueRetryService;
    queueClaimService = h.queueClaimService;
    callBatchesService = h.callBatchesService;
    webTest = h.webTest;
    dial = h.dial;
    worker = h.worker;
    callFailure = h.callFailure;
    calls = h.calls;
    makeCall = h.makeCall;
  });

  describe('completeFromWorker', () => {
    it('20. completed happy path persists transcript and marks batch', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        batchId: BATCH_ID,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        transcript: [{ role: 'assistant', content: 'Hello' }],
        usage: { models: [{ name: 'llm' }] },
        taskResult: { outcome: 'ok' },
        toolEvents: [{ toolId: 'endCall', ok: true }],
        answeredAt: '2024-06-01T10:00:00.000Z',
        endedAt: '2024-06-01T10:05:00.000Z',
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.taskStatus).toBe(CallTaskStatus.COMPLETED);
      expect(result.transcript).toEqual([
        { role: 'assistant', content: 'Hello' },
      ]);
      expect(result.taskResult).toEqual({ outcome: 'ok' });
      expect(result.sessionReport?.toolEvents).toEqual([
        { toolId: 'endCall', ok: true },
      ]);
      expect(result.toolEvents).toEqual([{ toolId: 'endCall', ok: true }]);
      expect(callBatchesService.maybeMarkCompleted).toHaveBeenCalledWith(
        BATCH_ID,
      );
    });

    it('21. worker failed + requeue decision resets to pending', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
        maxAttempts: 3,
        attemptCount: 1,
        roomName: 'out-x',
        organizationId: ORG_ID,
      });
      callsRepository.findById.mockResolvedValue(call);
      queueRetryService.classifyFromWorker.mockReturnValue(
        CallFailureCode.TIMEOUT,
      );
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date('2024-06-01T03:00:00.000Z'),
      });

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'failed',
        errorMessage: 'timeout',
        failureCode: 'timeout',
      });

      expect(queueRetryService.resetForRequeue).toHaveBeenCalled();
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-x');
      expect(result.status).toBe(CallStatus.PENDING);
      expect(callBatchesService.maybeMarkCompleted).not.toHaveBeenCalled();
    });

    it('22. worker failed terminal when maxAttempts=1 (skip requeue branch)', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        maxAttempts: 1,
        attemptCount: 1,
        batchId: BATCH_ID,
        roomName: 'out-term',
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'failed',
        errorMessage: 'agent crash',
      });

      expect(queueRetryService.markTerminalFailed).toHaveBeenCalled();
      expect(result.status).toBe(CallStatus.FAILED);
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-term');
      expect(callBatchesService.maybeMarkCompleted).toHaveBeenCalledWith(
        BATCH_ID,
      );
    });

    it('23. idempotent complete on already-completed only fills missing fields', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.COMPLETED,
        transcript: null,
        usage: { models: [] },
        sessionReport: { already: true },
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        transcript: [{ role: 'user', content: 'late' }],
        usage: { models: [{ name: 'ignored' }] },
        sessionReport: { ignored: true },
        toolEvents: [{ toolId: 'endCall', ok: true }],
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.transcript).toEqual([{ role: 'user', content: 'late' }]);
      // existing usage kept
      expect(result.usage).toEqual({ models: [] });
      // toolEvents merged into existing sessionReport
      expect(result.sessionReport).toMatchObject({
        already: true,
        toolEvents: [{ toolId: 'endCall', ok: true }],
      });
    });

    it('24a. completed path appends cost via PriceService', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        batchId: BATCH_ID,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        endedAt: '2024-06-01T10:05:00.000Z',
      });

      expect(priceService.applyAttemptToCall).toHaveBeenCalled();
      expect(result.cost?.totalUsd).toBe(0.01);
      expect(result.cost?.markup).toBe(0);
    });

    it('24b. requeue prices attempt before resetForRequeue', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
        maxAttempts: 3,
        attemptCount: 1,
        roomName: 'out-x',
        organizationId: ORG_ID,
      });
      callsRepository.findById.mockResolvedValue(call);
      queueRetryService.classifyFromWorker.mockReturnValue(
        CallFailureCode.TIMEOUT,
      );
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date('2024-06-01T03:00:00.000Z'),
      });
      const order: string[] = [];
      priceService.applyAttemptToCall.mockImplementation(async () => {
        order.push('price');
      });
      queueRetryService.resetForRequeue.mockImplementation(() => {
        order.push('reset');
      });

      await worker.completeFromWorker(CALL_ID, {
        status: 'failed',
        failureCode: 'timeout',
      });

      expect(order).toEqual(['price', 'reset']);
    });

    it('24c. idempotent complete fills cost only if missing', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.COMPLETED,
        cost: {
          currency: 'USD',
          markup: 0,
          plan: 'ship',
          catalogAsOf: '2026-08-21',
          totalUsd: 0.02,
          billedMinutes: 1,
          unknownModels: [],
          lines: [],
          attempts: [],
        },
        costUsd: 0.02,
      });
      callsRepository.findById.mockResolvedValue(call);

      await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
      });

      expect(priceService.fillCostIfMissing).toHaveBeenCalled();
      expect(priceService.applyAttemptToCall).not.toHaveBeenCalled();
    });

    it('24. session ended without taskCompleted → incomplete, no invented answeredAt', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        startedAt: new Date('2024-06-01T10:00:00.000Z'),
        answeredAt: null,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        endedAt: '2024-06-01T10:01:00.000Z',
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
      expect(result.answeredAt).toBeNull();
    });

    it('24e. omitted taskCompleted but complete_* tool ok → completed', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        toolEvents: [{ toolId: 'complete_demo_booking_task', ok: true }],
        taskResult: { outcome: 'CALLBACK' },
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.taskStatus).toBe(CallTaskStatus.COMPLETED);
    });

    it('24c. taskCompleted false → incomplete even with taskResult leftover', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: false,
        taskResult: { outcome: 'NO_ANSWER' },
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
    });

    it('24d. late complete on incomplete stays incomplete', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.INCOMPLETE,
        taskStatus: CallTaskStatus.INCOMPLETE,
        transcript: null,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        transcript: [{ role: 'user', content: 'late' }],
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
      expect(result.transcript).toEqual([{ role: 'user', content: 'late' }]);
    });

    it('24b. 404 when call missing', async () => {
      callsRepository.findById.mockResolvedValue(null);

      await expect(
        worker.completeFromWorker('missing', { status: 'completed' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('24f. pending + completed is a no-op (late callback after requeue)', async () => {
      const nextAttemptAt = new Date('2024-06-01T04:00:00.000Z');
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.PENDING,
        nextAttemptAt,
        queueLockedAt: null,
        endedAt: null,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        transcript: [{ role: 'user', content: 'late' }],
        endedAt: '2024-06-01T03:00:00.000Z',
      });

      expect(result.status).toBe(CallStatus.PENDING);
      expect(call.nextAttemptAt).toBe(nextAttemptAt);
      expect(call.endedAt).toBeNull();
      expect(call.transcript).toBeNull();
      expect(callsRepository.save).not.toHaveBeenCalled();
      expect(priceService.applyAttemptToCall).not.toHaveBeenCalled();
      expect(priceService.fillCostIfMissing).not.toHaveBeenCalled();
      expect(callBatchesService.maybeMarkCompleted).not.toHaveBeenCalled();
    });

    it('24g. pending + failed does not markTerminalFailed', async () => {
      const nextAttemptAt = new Date('2024-06-01T04:00:00.000Z');
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.PENDING,
        nextAttemptAt,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'failed',
        failureCode: 'no_answer',
      });

      expect(result.status).toBe(CallStatus.PENDING);
      expect(call.nextAttemptAt).toBe(nextAttemptAt);
      expect(queueRetryService.markTerminalFailed).not.toHaveBeenCalled();
      expect(queueRetryService.resetForRequeue).not.toHaveBeenCalled();
      expect(queueRetryService.classifyFromWorker).not.toHaveBeenCalled();
      expect(callsRepository.save).not.toHaveBeenCalled();
    });

    it('24h. creating + completed is a no-op', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.CREATING,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
      });

      expect(result.status).toBe(CallStatus.CREATING);
      expect(callsRepository.save).not.toHaveBeenCalled();
      expect(priceService.applyAttemptToCall).not.toHaveBeenCalled();
    });
  });

  // ─── Org controls ─────────────────────────────────────────────────────────

  describe('ensureInboundFromWorker', () => {
    const ROOM = 'call-+15551212_AbCd';
    const inboundTemplate = {
      ...template,
      key: 'inbound',
      direction: AgentDirection.INBOUND,
    };
    const inboundOrgAgent = {
      ...orgAgent,
      defaultTaskKey: 'confirm_appointment',
      agent: inboundTemplate,
    };
    const inboundTrunk = {
      id: 'in-trunk-id',
      organizationId: ORG_ID,
      livekitTrunkId: 'ST_in_1',
    };

    it('42. creates inbound SIP row as ready with maxAttempts=1', async () => {
      callsRepository.findByRoomName.mockResolvedValue(null);
      organizationAgentsService.getEntityWithTemplate.mockResolvedValue(
        inboundOrgAgent,
      );
      sipTrunksService.findByLivekitTrunkId.mockResolvedValue(inboundTrunk);

      const result = await worker.ensureInboundFromWorker({
        roomName: ROOM,
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        agentKey: 'inbound',
        task: 'confirm_appointment',
        fromNumber: '+15551212',
        toNumber: '+18005550100',
        participantIdentity: '+15551212',
        livekitSipCallId: 'SC_1',
        livekitTrunkId: 'ST_in_1',
      });

      expect(result.direction).toBe(AgentDirection.INBOUND);
      expect(result.medium).toBe(CallMedium.SIP);
      expect(result.status).toBe(CallStatus.READY);
      expect(result.maxAttempts).toBe(1);
      expect(result.roomName).toBe(ROOM);
      expect(result.fromNumber).toBe('+15551212');
      expect(result.toNumber).toBe('+18005550100');
      expect(result.organizationAgentId).toBe(ORG_AGENT_ID);
      expect(result.sipTrunkId).toBe('in-trunk-id');
      expect(result.taskKey).toBe('confirm_appointment');
      expect(callsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: AgentDirection.INBOUND,
          medium: CallMedium.SIP,
          maxAttempts: 1,
          roomName: ROOM,
        }),
      );
    });

    it('43. upserts same roomName: fills blank numbers, does not duplicate', async () => {
      const existing = makeCall({
        id: CALL_ID,
        direction: AgentDirection.INBOUND,
        status: CallStatus.READY,
        medium: CallMedium.SIP,
        roomName: ROOM,
        fromNumber: null,
        toNumber: null,
        participantIdentity: null,
        livekitSipCallId: null,
        maxAttempts: 1,
      });
      callsRepository.findByRoomName.mockResolvedValue(existing);

      const result = await worker.ensureInboundFromWorker({
        roomName: ROOM,
        fromNumber: '+15559999',
        toNumber: '+18005550100',
        participantIdentity: '+15559999',
        livekitSipCallId: 'SC_2',
      });

      expect(callsRepository.create).not.toHaveBeenCalled();
      expect(result.id).toBe(CALL_ID);
      expect(existing.fromNumber).toBe('+15559999');
      expect(existing.toNumber).toBe('+18005550100');
      expect(existing.livekitSipCallId).toBe('SC_2');
      expect(callsRepository.save).toHaveBeenCalled();
    });

    it('44. terminal row upsert is a no-op on status', async () => {
      const existing = makeCall({
        id: CALL_ID,
        direction: AgentDirection.INBOUND,
        status: CallStatus.COMPLETED,
        roomName: ROOM,
        fromNumber: '+15550000',
      });
      callsRepository.findByRoomName.mockResolvedValue(existing);

      const result = await worker.ensureInboundFromWorker({
        roomName: ROOM,
        fromNumber: '+1999',
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(existing.fromNumber).toBe('+15550000');
      expect(callsRepository.save).not.toHaveBeenCalled();
    });

    it('45. complete after ensure maps taskCompleted to completed', async () => {
      const call = makeCall({
        id: CALL_ID,
        direction: AgentDirection.INBOUND,
        status: CallStatus.READY,
        medium: CallMedium.SIP,
        maxAttempts: 1,
        roomName: ROOM,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
    });

    it('46. inbound failed complete never requeues even if retry policy would', async () => {
      const call = makeCall({
        id: CALL_ID,
        direction: AgentDirection.INBOUND,
        status: CallStatus.READY,
        maxAttempts: 3,
        attemptCount: 1,
        roomName: ROOM,
      });
      callsRepository.findById.mockResolvedValue(call);
      queueRetryService.classifyFromWorker.mockReturnValue(
        CallFailureCode.NO_ANSWER,
      );
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date(),
      });

      const result = await worker.completeFromWorker(CALL_ID, {
        status: 'failed',
        failureCode: 'no_answer',
      });

      expect(queueRetryService.decide).not.toHaveBeenCalled();
      expect(queueRetryService.resetForRequeue).not.toHaveBeenCalled();
      expect(queueRetryService.markTerminalFailed).toHaveBeenCalled();
      expect(livekit.deleteRoom).toHaveBeenCalledWith(ROOM);
      expect(result.status).not.toBe(CallStatus.PENDING);
    });
  });
});
