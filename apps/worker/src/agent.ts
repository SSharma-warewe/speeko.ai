import { type JobContext, defineAgent, voice } from '@livekit/agents';
import { buildAgentRuntime } from './builders/agent-builder.js';
import {
  postCallComplete,
  serializeTranscript,
  serializeUsage,
} from './call-callback.js';
import { parseJobMetadata } from './job-metadata.js';
import { classifyShutdownComplete } from './shutdown-status.js';
import {
  type SipAnswerRoom,
  sipCallStatus,
  waitForSipAnswer,
} from './sip-answer.js';

/**
 * LiveKit job entry. Exported so unit tests can invoke it with a fake JobContext
 * (no Cloud, no real SIP, no Inference). defineAgent still wires this as `entry`.
 */
export async function runAgentJob(ctx: JobContext): Promise<void> {
  const meta = parseJobMetadata(ctx.job.metadata);
  const roomName = ctx.job.room?.name ?? 'unknown';
  // API places SIP; wait only for SIP legs (web tests join as Meet participant).
  const waitForCallee = meta.medium === 'sip';

  console.log(
    `[agent] job start room=${roomName} callId=${meta.callId ?? 'n/a'} ` +
      `agentKey=${meta.agentKey} direction=${meta.direction} medium=${meta.medium ?? 'n/a'} ` +
      `task=${meta.task} tools=${meta.enabledTools.join(',')}`,
  );

  let answeredAt: string | null = null;
  let failedEarly = false;

  const { session, agent, userData } = await buildAgentRuntime(meta);

  // Register completion before work so hangups still persist usage/transcript/task result.
  if (meta.callId) {
    const callId = meta.callId;
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
        await postCallComplete(callId, {
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
          `[agent] tools used callId=${callId} completeStatus=${shutdown.status} ` +
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
  }

  try {
    await ctx.connect();
    console.log(
      `[agent] connected room=${roomName} agentKey=${meta.agentKey} task=${meta.task}`,
    );

    // API dials SIP; worker waits for the callee before becoming active (task onEnter greets).
    if (waitForCallee) {
      const identity = meta.participantIdentity;
      console.log(
        `[agent] waiting for SIP participant identity=${identity ?? '(any)'}`,
      );
      const participant = await ctx.waitForParticipant(identity);
      console.log(
        `[agent] SIP participant present room=${roomName} ` +
          `sipStatus=${sipCallStatus(participant) || 'n/a'}`,
      );
      // Participant join is ringing, not answer. Wait for sip.callStatus=active.
      await waitForSipAnswer({
        room: ctx.room as unknown as SipAnswerRoom,
        participant,
      });
      answeredAt = new Date().toISOString();
      console.log(`[agent] callee answered room=${roomName}`);
    }

    await session.start({
      agent,
      room: ctx.room,
    });

    session.on(voice.AgentSessionEventTypes.Close, () => {
      console.log(`[agent] session closed room=${roomName}`);
    });
  } catch (err) {
    failedEarly = true;
    const message = err instanceof Error ? err.message : String(err);
    const stage = waitForCallee && !answeredAt ? 'join/wait' : 'connect/session';
    console.error(`[agent] ${stage} failed room=${roomName}: ${message}`);
    if (meta.callId) {
      await postCallComplete(meta.callId, {
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
