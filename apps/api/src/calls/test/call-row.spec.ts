import { AgentDirection } from '../../agents/agent.entity';
import { newCallRow } from '../lib/call-row';
import { CallMedium, CallStatus, CallTaskStatus } from '../call.entity';

describe('newCallRow', () => {
  it('fills null/zero defaults and requires direction', () => {
    const row = newCallRow({ direction: AgentDirection.OUTBOUND });

    expect(row.direction).toBe(AgentDirection.OUTBOUND);
    expect(row.organizationId).toBeNull();
    expect(row.organizationAgentId).toBeNull();
    expect(row.agentId).toBeNull();
    expect(row.sipTrunkId).toBeNull();
    expect(row.status).toBe(CallStatus.CREATING);
    expect(row.taskStatus).toBe(CallTaskStatus.PENDING);
    expect(row.medium).toBe(CallMedium.WEB);
    expect(row.roomName).toBeNull();
    expect(row.livekitDispatchId).toBeNull();
    expect(row.livekitAgentName).toBeNull();
    expect(row.livekitSipCallId).toBeNull();
    expect(row.participantIdentity).toBeNull();
    expect(row.fromNumber).toBeNull();
    expect(row.toNumber).toBeNull();
    expect(row.context).toBeNull();
    expect(row.taskKey).toBeNull();
    expect(row.taskResult).toBeNull();
    expect(row.transcript).toBeNull();
    expect(row.usage).toBeNull();
    expect(row.sessionReport).toBeNull();
    expect(row.cost).toBeNull();
    expect(row.costUsd).toBeNull();
    expect(row.errorMessage).toBeNull();
    expect(row.attemptCount).toBe(0);
    expect(row.maxAttempts).toBe(1);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.batchId).toBeNull();
    expect(row.priority).toBe(0);
    expect(row.lastFailureCode).toBeNull();
    expect(row.lastFailureAt).toBeNull();
    expect(row.dialStartedAt).toBeNull();
    expect(row.queueLockedAt).toBeNull();
    expect(row.startedAt).toBeNull();
    expect(row.answeredAt).toBeNull();
    expect(row.endedAt).toBeNull();
  });

  it('lets partial override defaults', () => {
    const dialStartedAt = new Date('2024-06-01T00:00:00.000Z');
    const row = newCallRow({
      direction: AgentDirection.INBOUND,
      organizationId: 'org-1',
      status: CallStatus.PENDING,
      medium: CallMedium.SIP,
      attemptCount: 1,
      maxAttempts: 5,
      priority: 2,
      taskKey: 'general',
      roomName: 'call-1',
      dialStartedAt,
    });

    expect(row.organizationId).toBe('org-1');
    expect(row.status).toBe(CallStatus.PENDING);
    expect(row.medium).toBe(CallMedium.SIP);
    expect(row.attemptCount).toBe(1);
    expect(row.maxAttempts).toBe(5);
    expect(row.priority).toBe(2);
    expect(row.taskKey).toBe('general');
    expect(row.roomName).toBe('call-1');
    expect(row.dialStartedAt).toBe(dialStartedAt);
    expect(row.taskResult).toBeNull();
    expect(row.cost).toBeNull();
  });
});
