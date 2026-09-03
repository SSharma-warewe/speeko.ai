import { type JobContext, defineAgent, voice } from '@livekit/agents';
import { buildAgentRuntime } from './builders/agent-builder.js';
import {
  postCallComplete,
  postInboundEnsure,
  postInboundJobMetadata,
  serializeTranscript,
  serializeUsage,
} from './call-callback.js';
import { mergeInboundJobMetadata, parseJobMetadata } from './job-metadata.js';
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
  let meta = parseJobMetadata(ctx.job.metadata);
  // Inbound SIP dispatch metadata is snapshotted at publish. Re-read the
  // current org agent so Voice-tab realtime / TTS changes apply on the next ring.
  if (
    meta.direction === 'inbound' &&
    meta.organizationAgentId &&
    meta.organizationId
  ) {
    const live = await postInboundJobMetadata({
      organizationAgentId: meta.organizationAgentId,
      organizationId: meta.organizationId,
    });
    if (live) {
      meta = mergeInboundJobMetadata(meta, live);
    }
  }
  const roomName = ctx.job.room?.name ?? 'unknown';
  // Web tests join as Meet. SIP: wait for the party, then only outbound waits
  // for the PSTN callee to answer. Inbound ringing becomes active only after
  // the agent publishes audio (session.start) — waiting first is a deadlock.
  const isSip = meta.medium === 'sip';
  const waitForCallee = isSip && meta.direction === 'outbound';

  console.log(
    `[agent] job start room=${roomName} callId=${meta.callId ?? 'n/a'} ` +
      `agentKey=${meta.agentKey} direction=${meta.direction} medium=${meta.medium ?? 'n/a'} ` +
      `task=${meta.task} model=${meta.model ?? 'default'} tts=${meta.ttsModel ?? 'default'} ` +
      `tools=${meta.enabledTools.join(',')}`,
  );

  let answeredAt: string | null = null;
  let failedEarly = false;
  let callId = meta.callId;
  let shutdownRegistered = false;
  let sipParticipant: SipAnswerParticipant | undefined;
  let session: Awaited<ReturnType<typeof buildAgentRuntime>>['session'] | undefined;
  let userData: Awaited<ReturnType<typeof buildAgentRuntime>>['userData'] | undefined;

  const registerShutdownComplete = () => {
    if (!callId || shutdownRegistered || !session || !userData) {
      return;
    }
    shutdownRegistered = true;
    const completeCallId = callId;
    const completeSession = session;
    const completeUserData = userData;
    ctx.addShutdownCallback(async () => {
      if (failedEarly) {
        return;
      }
      try {
        const transcript = serializeTranscript(completeSession.history);
        const usage = serializeUsage(completeSession.usage);
        let sessionReport: Record<string, unknown> | null = null;
        try {
          const report = ctx.makeSessionReport(completeSession);
          sessionReport = report as unknown as Record<string, unknown>;
        } catch {
          // optional
        }
        const shutdown = classifyShutdownComplete({
          requireAnswer: waitForCallee,
          answeredAt,
          taskKey: meta.task,
          taskResult: completeUserData.taskResult,
          taskCompleted: completeUserData.taskCompleted === true,
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
          taskResult: shutdown.taskResult ?? completeUserData.taskResult ?? null,
          taskCompleted: shutdown.taskCompleted,
          toolEvents: completeUserData.toolEvents ?? [],
        });
        console.log(
          `[agent] tools used callId=${completeCallId} completeStatus=${shutdown.status} ` +
            `count=${completeUserData.toolEvents?.length ?? 0} ` +
            `${(completeUserData.toolEvents ?? [])
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
      if (userData) {
        userData.callId = callId;
      }
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
    if (userData) {
      userData.callId = ensuredId;
    }
    registerShutdownComplete();
  };

  try {
    await ctx.connect();
    console.log(
      `[agent] connected room=${roomName} agentKey=${meta.agentKey} task=${meta.task}`,
    );

    // SIP party joins while still ringing. Outbound: wait until the callee
    // answers before constructing models (realtime S2S opens a provider WS
    // and can poison the outbound INVITE SDP) and before greeting. Inbound:
    // we are the callee — start the session so LiveKit can 200 OK
    // (sip.callStatus stays ringing until remote audio).
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

    const runtime = await buildAgentRuntime({
      ...meta,
      ...(callId ? { callId } : {}),
    });
    session = runtime.session;
    userData = runtime.userData;
    if (callId) {
      userData.callId = callId;
    }
    registerShutdownComplete();

    await runtime.session.start({
      agent: runtime.agent,
      room: ctx.room,
    });
    if (isSip && meta.direction === 'inbound' && !answeredAt) {
      answeredAt = new Date().toISOString();
    }

    runtime.session.on(voice.AgentSessionEventTypes.Close, () => {
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
