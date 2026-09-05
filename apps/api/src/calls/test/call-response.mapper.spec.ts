import { AgentDirection } from '../../agents/agent.entity';
import {
  Call,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';
import {
  toCallResponse,
  toTestCallResponse,
} from '../mappers/call-response.mapper';

describe('call-response.mapper', () => {
  const baseCall = {
    id: 'call-1',
    organizationId: 'org-1',
    organizationAgentId: 'oa-1',
    agentId: 'agent-1',
    sipTrunkId: 'trunk-1',
    direction: AgentDirection.OUTBOUND,
    status: CallStatus.READY,
    medium: CallMedium.SIP,
    roomName: 'out-abc',
    livekitDispatchId: 'disp-1',
    livekitAgentName: 'call-agent',
    livekitSipCallId: 'sip-call-1',
    participantIdentity: '+15551234567',
    fromNumber: '+918000000001',
    toNumber: '+15551234567',
    context: { bookingId: 'bk_1' },
    taskKey: 'interview_booking',
    taskResult: { status: 'CONFIRMED' },
    taskStatus: CallTaskStatus.PENDING,
    transcript: [{ role: 'user', content: 'hi' }],
    usage: { models: [] },
    sessionReport: null as Record<string, unknown> | null,
    cost: {
      currency: 'USD' as const,
      markup: 0 as const,
      plan: 'ship',
      catalogAsOf: '2026-08-21',
      totalUsd: 0.042,
      billedMinutes: 1,
      unknownModels: [],
      lines: [],
      attempts: [],
    },
    costUsd: 0.042,
    errorMessage: null,
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: null,
    batchId: 'batch-1',
    priority: 5,
    lastFailureCode: null,
    lastFailureAt: null,
    dialStartedAt: new Date('2024-06-01T10:00:00.000Z'),
    queueLockedAt: null,
    startedAt: new Date('2024-06-01T10:00:01.000Z'),
    answeredAt: new Date('2024-06-01T10:00:05.000Z'),
    endedAt: null,
    createdAt: new Date('2024-06-01T09:59:00.000Z'),
    updatedAt: new Date('2024-06-01T10:00:05.000Z'),
  } as Call;

  describe('toCallResponse', () => {
    it('1. maps core call fields 1:1', () => {
      const dto = toCallResponse(baseCall);

      expect(dto.id).toBe('call-1');
      expect(dto.organizationId).toBe('org-1');
      expect(dto.organizationAgentId).toBe('oa-1');
      expect(dto.agentId).toBe('agent-1');
      expect(dto.sipTrunkId).toBe('trunk-1');
      expect(dto.direction).toBe(AgentDirection.OUTBOUND);
      expect(dto.status).toBe(CallStatus.READY);
      expect(dto.medium).toBe(CallMedium.SIP);
      expect(dto.roomName).toBe('out-abc');
      expect(dto.taskKey).toBe('interview_booking');
      expect(dto.taskResult).toEqual({ status: 'CONFIRMED' });
      expect(dto.taskStatus).toBe(CallTaskStatus.PENDING);
      expect(dto.context).toEqual({ bookingId: 'bk_1' });
      expect(dto.attemptCount).toBe(1);
      expect(dto.maxAttempts).toBe(3);
      expect(dto.batchId).toBe('batch-1');
      expect(dto.priority).toBe(5);
    });

    it('2. defaults taskStatus to pending when undefined on a live call', () => {
      const call = { ...baseCall, taskStatus: undefined } as unknown as Call;
      expect(toCallResponse(call).taskStatus).toBe(CallTaskStatus.PENDING);
    });

    it('2c. legacy completed rows with pending taskStatus display as completed', () => {
      const call = {
        ...baseCall,
        status: CallStatus.COMPLETED,
        taskStatus: CallTaskStatus.PENDING,
      } as Call;
      expect(toCallResponse(call).taskStatus).toBe(CallTaskStatus.COMPLETED);
    });

    it('2b. defaults priority to 0 when undefined', () => {
      const call = { ...baseCall, priority: undefined } as unknown as Call;
      expect(toCallResponse(call).priority).toBe(0);
    });

    it('3. defaults lastFailureCode / lastFailureAt / dialStartedAt / queueLockedAt to null when undefined', () => {
      const call = {
        ...baseCall,
        lastFailureCode: undefined,
        lastFailureAt: undefined,
        dialStartedAt: undefined,
        queueLockedAt: undefined,
      } as unknown as Call;

      const dto = toCallResponse(call);
      expect(dto.lastFailureCode).toBeNull();
      expect(dto.lastFailureAt).toBeNull();
      expect(dto.dialStartedAt).toBeNull();
      expect(dto.queueLockedAt).toBeNull();
    });

    it('3b. includes cost snapshot by default (null when unpriced)', () => {
      expect(toCallResponse(baseCall).cost?.totalUsd).toBe(0.042);
      expect(toCallResponse({ ...baseCall, cost: null }).cost).toBeNull();
      expect(toCallResponse(baseCall, { includeCost: false }).cost).toBeUndefined();
    });

    it('4. toolEvents is null when sessionReport is null', () => {
      expect(toCallResponse({ ...baseCall, sessionReport: null }).toolEvents).toBeNull();
    });

    it('5. toolEvents is null when sessionReport.toolEvents is missing or empty', () => {
      expect(
        toCallResponse({
          ...baseCall,
          sessionReport: { other: true },
        }).toolEvents,
      ).toBeNull();
      expect(
        toCallResponse({
          ...baseCall,
          sessionReport: { toolEvents: [] },
        }).toolEvents,
      ).toBeNull();
    });

    it('6. extracts object toolEvents and drops non-objects', () => {
      const dto = toCallResponse({
        ...baseCall,
        sessionReport: {
          toolEvents: [
            { toolId: 'endCall', ok: true },
            'string-noise',
            null,
            42,
            { toolId: 'booking', ok: false, args: { id: '1' } },
            ['array'],
          ],
        },
      });

      expect(dto.toolEvents).toEqual([
        { toolId: 'endCall', ok: true },
        { toolId: 'booking', ok: false, args: { id: '1' } },
      ]);
    });
  });

  describe('toTestCallResponse', () => {
    it('7. spreads call fields and adds Meet extras', () => {
      const dto = toTestCallResponse(baseCall, {
        agentKey: 'outbound',
        livekitUrl: 'wss://test.livekit.cloud',
        participantToken: 'tok_abc',
        meetUrl: 'https://meet.livekit.io/custom?…',
      });

      expect(dto.id).toBe('call-1');
      expect(dto.agentKey).toBe('outbound');
      expect(dto.livekitUrl).toBe('wss://test.livekit.cloud');
      expect(dto.participantToken).toBe('tok_abc');
      expect(dto.meetUrl).toBe('https://meet.livekit.io/custom?…');
      expect(dto.status).toBe(CallStatus.READY);
    });
  });
});
