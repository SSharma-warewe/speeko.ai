import { type JobContext, defineAgent, voice } from '@livekit/agents';
import { buildAgentRuntime } from './builders/agent-builder.js';
import {
  postCallComplete,
  postInboundEnsure,
  serializeTranscript,
  serializeUsage,
} from './call-callback.js';
import { parseJobMetadata } from './job-metadata.js';
import { classifyShutdownComplete } from './shutdown-status.js';
import {
  type SipAnswerParticipant,
  type SipAnswerRoom,
  sipCallStatus,
  sipParticipantInfo,
  waitForSipAnswer,
} from './sip-answer.js';

/**
 * LiveKit job entry. Exported so unit tests can invoke it with a fake JobContext
 * (no Cloud, no real SIP, no Inference). defineAgent still wires this as `entry`.
 */
export async function runAgentJob(ctx: JobContext): Promise<void> {
  const meta = parseJobMetadata(ctx.job.metadata);
  const roomName = ctx.job.room?.name ?? 'unknown';
  // Web tests join as Meet. SIP: wait for the party, then only outbound waits
  // for the PSTN callee to answer. Inbound ringing becomes active only after
  // the agent publishes audio (session.start) — waiting first is a deadlock.
  const isSip = meta.medium === 'sip';
  const waitForCallee = isSip && meta.direction === 'outbound';

  console.log(
    `[agent] job start room=${roomName} callId=${meta.callId ?? 'n/a'} ` +
      `agentKey=${meta.agentKey} direction=${meta.direction} medium=${meta.medium ?? 'n/a'} ` +
      `task=${meta.task} tools=${meta.enabledTools.join(',')}`,
  );

  let answeredAt: string | null = null;
  let failedEarly = false;
  let callId = meta.callId;
  let shutdownRegistered = false;
  let sipParticipant: SipAnswerParticipant | undefined;

  const { session, agent, userData } = await buildAgentRuntime(meta);

  const registerShutdownComplete = () => {
    if (!callId || shutdownRegistered) {
      return;
    }
    shutdownRegistered = true;
    const completeCallId = callId;
    ctx.addShutdownCallback(async () => {
      if (failedEarly) {
        return;
      }
      try {
        const transcript = serializeTranscript(session.history);
        const usage = serializeUsage(session.usage);
        let sessionReport: Record<string, unknown> | null = null;
        try {
          const report = ctx.makeSessionReport(session);
          sessionReport = report as unknown as Record<string, unknown>;
        } catch {
          // optional
        }
        const shutdown = classifyShutdownComplete({
          requireAnswer: waitForCallee,
          answeredAt,
          taskKey: meta.task,
          taskResult: userData.taskResult,
          taskCompleted: userData.taskCompleted === true,
        });
        await postCallComplete(completeCallId, {
          status: shutdown.status,
          failureCode: shutdown.failureCode,
          errorMessage: shutdown.errorMessage,
          answeredAt,
          endedAt: new Date().toISOString(),
          transcript,
          usage,
          sessionReport,
          taskResult: shutdown.taskResult ?? userData.taskResult ?? null,
          taskCompleted: shutdown.taskCompleted,
          toolEvents: userData.toolEvents ?? [],
        });
        console.log(
          `[agent] tools used callId=${completeCallId} completeStatus=${shutdown.status} ` +
            `count=${userData.toolEvents?.length ?? 0} ` +
            `${(userData.toolEvents ?? [])
              .map((e) => `${e.toolId}:${e.ok === false ? 'fail' : 'ok'}`)
              .join(',') || 'none'}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[agent] shutdown complete error: ${message}`);
      }
    });
  };

  const ensureInboundCall = async (
    participant?: SipAnswerParticipant,
  ): Promise<void> => {
    if (callId) {
      return;
    }
    if (meta.direction !== 'inbound' || meta.medium !== 'sip') {
      return;
    }
    const info = participant ? sipParticipantInfo(participant) : null;
    const ensuredId = await postInboundEnsure({
      roomName,
      organizationId: meta.organizationId,
      organizationAgentId: meta.organizationAgentId,
      agentKey: meta.agentKey,
      task: meta.task,
      fromNumber: info?.fromNumber,
      toNumber: info?.toNumber,
      participantIdentity: info?.identity ?? meta.participantIdentity,
      livekitSipCallId: info?.sipCallId,
      livekitTrunkId: info?.livekitTrunkId,
    });
    if (!ensuredId) {
      console.warn(`[agent] inbound ensure returned no callId room=${roomName}`);
      return;
    }
    callId = ensuredId;
    userData.callId = ensuredId;
    registerShutdownComplete();
  };

  registerShutdownComplete();

  try {
    await ctx.connect();
    console.log(
      `[agent] connected room=${roomName} agentKey=${meta.agentKey} task=${meta.task}`,
    );

    // SIP party joins while still ringing. Outbound: wait until the callee
    // answers before greeting. Inbound: we are the callee — start the session
    // so LiveKit can 200 OK (sip.callStatus stays ringing until remote audio).
    if (isSip) {
      const identity = meta.participantIdentity;
      console.log(
        `[agent] waiting for SIP participant identity=${identity ?? '(any)'}`,
      );
      const participant = await ctx.waitForParticipant(identity);
      sipParticipant = participant as SipAnswerParticipant;
      const status = sipCallStatus(sipParticipant) || 'n/a';
      console.log(
        `[agent] SIP participant present room=${roomName} sipStatus=${status}`,
      );
      // Persist the inbound ring as soon as the SIP party is in the room so
      // unanswered hangup still has a callId for the existing complete path.
      await ensureInboundCall(sipParticipant);
      if (status === 'hangup') {
        throw new Error('SIP callee hung up before answer (no answer)');
      }
      if (waitForCallee) {
        await waitForSipAnswer({
          room: ctx.room as unknown as SipAnswerRoom,
          participant,
        });
        answeredAt = new Date().toISOString();
        console.log(`[agent] callee answered room=${roomName}`);
      } else {
        console.log(
          `[agent] inbound pickup room=${roomName} sipStatus=${status} (skip waitForSipAnswer)`,
        );
      }
    }

    await session.start({
      agent,
      room: ctx.room,
    });
    if (isSip && meta.direction === 'inbound' && !answeredAt) {
      answeredAt = new Date().toISOString();
    }

    session.on(voice.AgentSessionEventTypes.Close, () => {
      console.log(`[agent] session closed room=${roomName}`);
    });
  } catch (err) {
    failedEarly = true;
    const message = err instanceof Error ? err.message : String(err);
    const unanswered =
      !answeredAt && (waitForCallee || /no answer/i.test(message));
    const stage = unanswered ? 'join/wait' : 'connect/session';
    console.error(`[agent] ${stage} failed room=${roomName}: ${message}`);
    await ensureInboundCall(sipParticipant);
    if (callId) {
      await postCallComplete(callId, {
        status: 'failed',
        failureCode: stage === 'join/wait' ? 'no_answer' : 'agent_error',
        errorMessage: `Agent failed (${stage}): ${message}`,
        endedAt: new Date().toISOString(),
        taskCompleted: false,
        taskResult: {
          task: meta.task,
          outcome: stage === 'join/wait' ? 'NO_ANSWER' : 'AGENT_ERROR',
        },
      });
    }
    try {
      ctx.shutdown('agent_error');
    } catch {
      // ignore double-shutdown
    }
  }
}

export default defineAgent({
  entry: runAgentJob,
});
