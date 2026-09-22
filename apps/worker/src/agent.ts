import { isRealtimeLlmModel, isSarvamRealtimeTtsModel } from '@call-agent/contracts';
import { type JobContext, defineAgent, voice } from '@livekit/agents';
import {
  AgentRuntimeBuilder,
  warmTtsBeforeStart,
  type BuiltAgentRuntime,
} from './builders/agent-builder.js';
import { CallbackFunctions } from './callbacks/call-callbacks.js';
import { JobMeta, type AgentJobMetadata } from './session/job-metadata.js';
import { classifyShutdownComplete } from './session/shutdown-status.js';
import {
  type SipAnswerParticipant,
  type SipAnswerRoom,
  Sipfunctions,
} from './session/sip-answer.js';

export class AgentJob {
  private readonly callbacks = new CallbackFunctions();
  private readonly jobMeta = new JobMeta();
  private readonly sip = new Sipfunctions();

  private meta!: AgentJobMetadata;
  private roomName = 'unknown';
  private isSip = false;
  private waitForCallee = false;
  private answeredAt: string | null = null;
  private failedEarly = false;
  private callId: string | undefined;
  private shutdownRegistered = false;
  private sipParticipant: SipAnswerParticipant | undefined;
  private session: BuiltAgentRuntime['session'] | undefined;
  private userData: BuiltAgentRuntime['userData'] | undefined;
  private ttsWarm: Promise<void> | null = null;

  constructor(private readonly ctx: JobContext) {}

  async run(): Promise<void> {
    await this.resolveMetadata();
    this.logJobStart();
    try {
      await this.ctx.connect();
      console.log(
        `[agent] connected room=${this.roomName} agentKey=${this.meta.agentKey} task=${this.meta.task}`,
      );
      await this.waitForSipParty();
      await this.startRuntime();
    } catch (err) {
      await this.handleJobError(err);
    }
  }

  private async resolveMetadata(): Promise<void> {
    this.meta = this.jobMeta.parseJobMetadata(this.ctx.job.metadata);
    // Inbound SIP dispatch metadata is snapshotted at publish. Re-read the
    // current org agent so Voice-tab realtime / TTS changes apply on the next ring.
    if (
      this.meta.direction === 'inbound' &&
      this.meta.organizationAgentId &&
      this.meta.organizationId
    ) {
      const live = await this.callbacks.postInboundJobMetadata({
        organizationAgentId: this.meta.organizationAgentId,
        organizationId: this.meta.organizationId,
      });
      if (live) {
        this.meta = this.jobMeta.mergeInboundJobMetadata(this.meta, live);
      }
    }
    this.roomName = this.ctx.job.room?.name ?? 'unknown';
    // Web tests join as Meet. SIP: wait for the party, then only outbound waits
    // for the PSTN callee to answer. Inbound ringing becomes active only after
    // the agent publishes audio (session.start) — waiting first is a deadlock.
    this.isSip = this.meta.medium === 'sip';
    this.waitForCallee = this.isSip && this.meta.direction === 'outbound';
    this.callId = this.meta.callId;
  }

  private logJobStart(): void {
    console.log(
      `[agent] job start room=${this.roomName} callId=${this.meta.callId ?? 'n/a'} ` +
        `agentKey=${this.meta.agentKey} direction=${this.meta.direction} medium=${this.meta.medium ?? 'n/a'} ` +
        `task=${this.meta.task} model=${this.meta.model ?? 'default'} tts=${this.meta.ttsModel ?? 'default'} ` +
        `tools=${this.meta.enabledTools.join(',')}`,
    );
  }

  private registerShutdownComplete(): void {
    if (!this.callId || this.shutdownRegistered || !this.session || !this.userData) {
      return;
    }
    this.shutdownRegistered = true;
    const completeCallId = this.callId;
    const completeSession = this.session;
    const completeUserData = this.userData;
    this.ctx.addShutdownCallback(async () => {
      if (this.failedEarly) {
        return;
      }
      try {
        const transcript = this.jobMeta.serializeTranscript(completeSession.history);
        const usage = this.jobMeta.serializeUsage(completeSession.usage);
        let sessionReport: Record<string, unknown> | null = null;
        try {
          const report = this.ctx.makeSessionReport(completeSession);
          sessionReport = report as unknown as Record<string, unknown>;
        } catch {
          // optional
        }
        const shutdown = classifyShutdownComplete({
          requireAnswer: this.waitForCallee,
          answeredAt: this.answeredAt,
          taskKey: this.meta.task,
          taskResult: completeUserData.taskResult,
          taskCompleted: completeUserData.taskCompleted === true,
        });
        await this.callbacks.postCallComplete(completeCallId, {
          status: shutdown.status,
          failureCode: shutdown.failureCode,
          errorMessage: shutdown.errorMessage,
          answeredAt: this.answeredAt,
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
  }

  private async ensureInboundCall(
    participant?: SipAnswerParticipant,
  ): Promise<void> {
    if (this.callId) {
      if (this.userData) {
        this.userData.callId = this.callId;
      }
      return;
    }
    if (this.meta.direction !== 'inbound' || this.meta.medium !== 'sip') {
      return;
    }
    const info = participant ? this.sip.sipParticipantInfo(participant) : null;
    const ensuredId = await this.callbacks.postInboundEnsure({
      roomName: this.roomName,
      organizationId: this.meta.organizationId,
      organizationAgentId: this.meta.organizationAgentId,
      agentKey: this.meta.agentKey,
      task: this.meta.task,
      fromNumber: info?.fromNumber,
      toNumber: info?.toNumber,
      participantIdentity: info?.identity ?? this.meta.participantIdentity,
      livekitSipCallId: info?.sipCallId,
      livekitTrunkId: info?.livekitTrunkId,
    });
    if (!ensuredId) {
      console.warn(`[agent] inbound ensure returned no callId room=${this.roomName}`);
      return;
    }
    this.callId = ensuredId;
    if (this.userData) {
      this.userData.callId = ensuredId;
    }
    this.registerShutdownComplete();
  }

  private async waitForSipParty(): Promise<void> {
    // SIP party joins while still ringing. Outbound: wait until the callee
    // answers before constructing models (realtime S2S opens a provider WS
    // and can poison the outbound INVITE SDP) and before greeting. Inbound:
    // we are the callee — start the session so LiveKit can 200 OK
    // (sip.callStatus stays ringing until remote audio).
    if (!this.isSip) {
      return;
    }
    const identity = this.meta.participantIdentity;
    console.log(
      `[agent] waiting for SIP participant identity=${identity ?? '(any)'}`,
    );
    const participant = await this.ctx.waitForParticipant(identity);
    this.sipParticipant = participant as SipAnswerParticipant;
    const status = this.sip.sipCallStatus(this.sipParticipant) || 'n/a';
    console.log(
      `[agent] SIP participant present room=${this.roomName} sipStatus=${status}`,
    );
    // Persist the inbound ring as soon as the SIP party is in the room so
    // unanswered hangup still has a callId for the existing complete path.
    await this.ensureInboundCall(this.sipParticipant);
    if (status === 'hangup') {
      throw new Error('SIP callee hung up before answer (no answer)');
    }
    // Pipeline: REST-synthesize ack / script / goodbye while still ringing
    // (inbound) or waiting for the callee (outbound). Do not build the
    // full runtime here — unanswered outbound must not open STT / realtime.
    this.startTtsWarm();
    if (this.waitForCallee) {
      await this.sip.waitForSipAnswer({
        room: this.ctx.room as unknown as SipAnswerRoom,
        participant,
      });
      this.answeredAt = new Date().toISOString();
      console.log(`[agent] callee answered room=${this.roomName}`);
    } else {
      console.log(
        `[agent] inbound pickup room=${this.roomName} sipStatus=${status} (skip waitForSipAnswer)`,
      );
    }
  }

  private startTtsWarm(): void {
    if (
      this.ttsWarm ||
      isRealtimeLlmModel(this.meta.model) ||
      isSarvamRealtimeTtsModel(this.meta.ttsModel)
    ) {
      return;
    }
    this.ttsWarm = warmTtsBeforeStart(this.meta);
  }

  private async startRuntime(): Promise<void> {
    // Web jobs skip waitForSipParty; still warm before session.start.
    this.startTtsWarm();
    if (this.ttsWarm) {
      await this.ttsWarm;
    }
    const runtime = await new AgentRuntimeBuilder({
      ...this.meta,
      ...(this.callId ? { callId: this.callId } : {}),
    }).build();
    this.session = runtime.session;
    this.userData = runtime.userData;
    if (this.callId) {
      this.userData.callId = this.callId;
    }
    this.registerShutdownComplete();

    await runtime.session.start({
      agent: runtime.agent,
      room: this.ctx.room,
    });
    if (this.isSip && this.meta.direction === 'inbound' && !this.answeredAt) {
      this.answeredAt = new Date().toISOString();
    }

    runtime.session.on(voice.AgentSessionEventTypes.Close, () => {
      console.log(`[agent] session closed room=${this.roomName}`);
    });
  }

  private async handleJobError(err: unknown): Promise<void> {
    this.failedEarly = true;
    const message = err instanceof Error ? err.message : String(err);
    const unanswered =
      !this.answeredAt && (this.waitForCallee || /no answer/i.test(message));
    const stage = unanswered ? 'join/wait' : 'connect/session';
    console.error(`[agent] ${stage} failed room=${this.roomName}: ${message}`);
    await this.ensureInboundCall(this.sipParticipant);
    if (this.callId) {
      await this.callbacks.postCallComplete(this.callId, {
        status: 'failed',
        failureCode: stage === 'join/wait' ? 'no_answer' : 'agent_error',
        errorMessage: `Agent failed (${stage}): ${message}`,
        endedAt: new Date().toISOString(),
        taskCompleted: false,
        taskResult: {
          task: this.meta.task,
          outcome: stage === 'join/wait' ? 'NO_ANSWER' : 'AGENT_ERROR',
        },
      });
    }
    try {
      this.ctx.shutdown('agent_error');
    } catch {
      // ignore double-shutdown
    }
  }
}

/**
 * LiveKit job entry. Exported so unit tests can invoke it with a fake JobContext
 * (no Cloud, no real SIP, no Inference). defineAgent still wires this as `entry`.
 */
export async function runAgentJob(ctx: JobContext): Promise<void> {
  return new AgentJob(ctx).run();
}

export default defineAgent({
  entry: runAgentJob,
});
