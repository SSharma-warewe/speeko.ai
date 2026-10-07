import {
  VOICE_TASK_STARTERS,
  type VoiceTaskSnapshot,
} from '@call-agent/contracts';
import { AgentDirection } from '../../agents/agent.entity';
import { CallStatus } from '../call.entity';
import {
  createCallsHarness,
  ORG_ID,
  ORG_AGENT_ID,
  CALL_ID,
  orgAgent,
  template,
} from './helpers/calls-mocks';
const snapshot: VoiceTaskSnapshot = {
  schemaVersion: 1,
  taskId: 'd39d66ab-bd3b-44d3-aed7-ecf45bf68877',
  version: 1,
  definition: VOICE_TASK_STARTERS.general,
};
describe('configured call snapshots', () => {
  it('freezes one version across a batch and dispatches it after another version is published', async () => {
    const h = createCallsHarness();
    h.voiceTasks.resolve.mockResolvedValue(snapshot);
    const batch = await h.dial.enqueueCallsForOrg(ORG_ID, {
      organizationAgentId: ORG_AGENT_ID,
      voiceTaskId: snapshot.taskId,
      calls: [{ toNumber: '+15550001111' }, { toNumber: '+15550002222' }],
    });
    expect(batch.calls.map((c) => c.voiceTaskSnapshot)).toEqual([
      snapshot,
      snapshot,
    ]);
    h.voiceTasks.resolve.mockResolvedValue({ ...snapshot, version: 2 });
    await h.dial.dialClaimedCall(
      h.admitCall(h.makeCall({
        id: CALL_ID,
        status: CallStatus.CREATING,
        taskKey: `custom_${snapshot.taskId}`,
        voiceTaskSnapshot: snapshot,
      })),
    );
    expect(
      JSON.parse(h.livekit.createAgentDispatch.mock.calls[0][0].metadata)
        .voiceTask,
    ).toEqual(snapshot);
    expect(h.voiceTasks.resolve).toHaveBeenCalledTimes(1);
  });
  it('rechecks permissions before dispatch and does not dial after a required tool is revoked', async () => {
    const h = createCallsHarness();
    const configured = {
      ...snapshot,
      definition: VOICE_TASK_STARTERS.demo_booking,
    };
    h.toolProfilesService.resolveEnabledToolIds.mockResolvedValue(['endCall']);
    await h.dial.dialClaimedCall(
      h.admitCall(h.makeCall({
        status: CallStatus.CREATING,
        voiceTaskSnapshot: configured,
      })),
    );
    expect(h.livekit.createAgentDispatch).not.toHaveBeenCalled();
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });
  it('draft web tests use their exact saved revision and never resolve the published default', async () => {
    const h = createCallsHarness();
    const draft = { ...snapshot, version: 0, draftRevision: 3 };
    const call = await h.webTest.createOrgAgentTestCall(
      ORG_ID,
      { organizationAgentId: ORG_AGENT_ID },
      draft,
    );
    expect(call.voiceTaskSnapshot).toEqual(draft);
    expect(h.voiceTasks.resolve).not.toHaveBeenCalled();
    const packed = JSON.parse(
      h.livekit.createAgentDispatch.mock.calls[0][0].metadata,
    );
    expect(packed.voiceTask).toEqual(draft);
    expect(packed.prompt.systemPrompt).toBe(orgAgent.systemPrompt);
  });
  it('inbound ensure persists the version identity used by live metadata despite a newer publication', async () => {
    const h = createCallsHarness();
    h.organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
      ...orgAgent,
      agent: { ...template, direction: AgentDirection.INBOUND },
    });
    h.voiceTasks.resolve.mockResolvedValue({ ...snapshot, version: 2 });
    h.voiceTasks.snapshot.mockResolvedValue(snapshot);
    const call = await h.worker.ensureInboundFromWorker({
      roomName: 'configured-ring',
      organizationId: ORG_ID,
      organizationAgentId: ORG_AGENT_ID,
      voiceTask: { taskId: snapshot.taskId, version: 1 },
    });
    expect(h.voiceTasks.snapshot).toHaveBeenCalledWith(
      ORG_ID,
      snapshot.taskId,
      1,
      true,
    );
    expect(call.voiceTaskSnapshot).toEqual(snapshot);
  });
  it.each([false, undefined])(
    'configured callbacks require explicit true (received %s)',
    async (taskCompleted) => {
      const h = createCallsHarness();
      h.callsRepository.findById.mockResolvedValue(
        h.makeCall({ status: CallStatus.READY, voiceTaskSnapshot: snapshot }),
      );
      const call = await h.worker.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted,
        taskResult: { outcome: 'COMPLETED' },
        toolEvents: [{ toolId: 'complete_voice_task', ok: true }],
      });
      expect(call.status).toBe(CallStatus.INCOMPLETE);
    },
  );
});
