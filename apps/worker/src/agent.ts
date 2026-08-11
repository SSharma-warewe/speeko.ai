import { type JobContext, defineAgent, voice } from '@livekit/agents';
import { buildAgentRuntime } from './builders/agent-builder.js';
import {
  postCallComplete,
  serializeTranscript,
  serializeUsage,
} from './call-callback.js';
import { parseJobMetadata } from './job-metadata.js';

export default defineAgent({
  entry: async (ctx: JobContext) => {
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
          await postCallComplete(callId, {
            status: 'completed',
            answeredAt,
            endedAt: new Date().toISOString(),
            transcript,
            usage,
            sessionReport,
            taskResult: userData.taskResult ?? null,
            toolEvents: userData.toolEvents ?? [],
          });
          console.log(
            `[agent] tools used callId=${callId} count=${userData.toolEvents?.length ?? 0} ` +
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
        await ctx.waitForParticipant(identity);
        answeredAt = new Date().toISOString();
        console.log(`[agent] callee joined room=${roomName}`);
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
          errorMessage: `Agent failed (${stage}): ${message}`,
          endedAt: new Date().toISOString(),
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
  },
});
