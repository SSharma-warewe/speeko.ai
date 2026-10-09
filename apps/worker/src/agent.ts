import { type JobContext, defineAgent, voice, metrics } from '@livekit/agents';
import {
  OPENING_PREPARATION_ATTRIBUTE,
  requiresOpeningPreparation,
  resolveExactOpening,
  type OpeningPreparationReport,
} from '@call-agent/contracts';
import type { TtsCacheRuntime } from './speech/tts-cache-runtime.js';
import {
  AgentRuntimeBuilder,
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
  private preparedCache?: TtsCacheRuntime;
  private preparationUsage?: metrics.ModelUsageCollector;
  private openingPrepared = false;
  private userData: BuiltAgentRuntime['userData'] | undefined;

  constructor(private readonly ctx: JobContext) {}

  async run(): Promise<void> {
    await this.resolveMetadata();
    this.logJobStart();
    try {
      await this.ctx.connect();
      console.log(
        `[agent] connected room=${this.roomName} agentKey=${this.meta.agentKey} task=${this.meta.task}`,
      );
      await this.prepareOpeningBeforeDial();
      await this.waitForSipParty();
      await this.startRuntime();
    } catch (err) {
      await this.handleJobError(err);
    }
  }

  private async prepareOpeningBeforeDial(): Promise<void> {
    const gate = this.meta.openingPreparation;
    if (!gate) return;
    const { createTts, resolveTtsConfiguration } =
      await import('./builders/model-builder.js');
    const { TtsCacheRuntime } = await import('./speech/tts-cache-runtime.js');
    const { TtsSharedCacheClient } =
      await import('./speech/tts-shared-cache-client.js');
    this.preparationUsage = new metrics.ModelUsageCollector();
    if (!requiresOpeningPreparation(this.meta) || gate.deadline <= Date.now())
      throw new Error('Invalid opening preparation gate');
    const opening = resolveExactOpening(this.meta)! as string;
    const controller = new AbortController();
    const report = async (status: OpeningPreparationReport['status']) => {
      const payload: OpeningPreparationReport = {
        version: 1,
        attemptId: gate.attemptId,
        status,
        usage: { models: this.preparationUsage!.flatten() },
      };
      await this.ctx.room.localParticipant!.setAttributes({
        [OPENING_PREPARATION_ATTRIBUTE]: JSON.stringify(payload),
      });
    };
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(10_000, gate.deadline - Date.now()),
    );
    const onDisconnect = () => controller.abort();
    this.ctx.room.on('disconnected', onDisconnect);
    let provider: ReturnType<typeof createTts> | undefined;
    const collect = (event: metrics.TTSMetrics) =>
      this.preparationUsage!.collect(event);
    this.ctx.addShutdownCallback(async () => {
      controller.abort();
      this.preparedCache?.dispose();
      await provider?.close();
    });
    try {
      await report('preparing');
      provider = createTts(this.meta);
      provider.on('metrics_collected', collect);
      this.preparedCache = new TtsCacheRuntime(
        this.meta,
        resolveTtsConfiguration(this.meta),
        provider,
        { automaticEnabled: this.meta.ttsCacheEnabled === true },
        Date.now,
        TtsSharedCacheClient.create(
          this.meta.callId,
          this.meta.organizationId,
          this.roomName,
        ),
      );
      await this.preparedCache.prepareOpening(opening, controller.signal);
      if (controller.signal.aborted || Date.now() >= gate.deadline)
        throw new Error('Opening preparation timed out');
      await report('ready');
      this.openingPrepared = true;
      console.log(`[agent] opening preparation ready callId=${this.callId}`);
    } catch {
      controller.abort();
      this.preparedCache?.dispose();
      await report('failed').catch(() => {});
      // Leave the failure/usage visible for the API's bounded readiness polling.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(2000, Math.max(0, gate.deadline - Date.now())),
        ),
      );
      throw new Error('Opening preparation failed');
    } finally {
      clearTimeout(timer);
      provider?.off('metrics_collected', collect);
      this.ctx.room.off('disconnected', onDisconnect);
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
      if (!live)
        throw new Error(
          'Inbound live metadata refresh failed; refusing stale configuration',
        );
      this.meta = this.jobMeta.mergeInboundJobMetadata(this.meta, live);
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
    if (
      !this.callId ||
      this.shutdownRegistered ||
      !this.session ||
      !this.userData
    ) {
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
        const transcript = this.jobMeta.serializeTranscript(
          completeSession.history,
        );
        const usage = this.jobMeta.serializeUsage(completeSession.usage);
        if (usage)
          usage.models = [
            ...(this.preparationUsage?.flatten() ?? []),
            ...(usage.models as unknown[]),
          ];
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
          taskResult:
            shutdown.taskResult ?? completeUserData.taskResult ?? null,
          taskCompleted: shutdown.taskCompleted,
          toolEvents: completeUserData.toolEvents ?? [],
        });
        console.log(
          `[agent] tools used callId=${completeCallId} completeStatus=${shutdown.status} ` +
            `count=${completeUserData.toolEvents?.length ?? 0} ` +
            `${
              (completeUserData.toolEvents ?? [])
                .map((e) => `${e.toolId}:${e.ok === false ? 'fail' : 'ok'}`)
                .join(',') || 'none'
            }`,
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
      ...(this.meta.voiceTask
        ? {
            voiceTask: {
              taskId: this.meta.voiceTask.taskId,
              version: this.meta.voiceTask.version,
            },
          }
        : {}),
      context: this.meta.context,
      fromNumber: info?.fromNumber,
      toNumber: info?.toNumber,
      participantIdentity: info?.identity ?? this.meta.participantIdentity,
      livekitSipCallId: info?.sipCallId,
      livekitTrunkId: info?.livekitTrunkId,
    });
    if (!ensuredId) {
      console.warn(
        `[agent] inbound ensure returned no callId room=${this.roomName}`,
      );
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

  private async startRuntime(): Promise<void> {
    const runtime = await new AgentRuntimeBuilder(
      {
        ...this.meta,
        ...(this.callId ? { callId: this.callId } : {}),
      },
      this.roomName,
      this.preparedCache,
    ).build();
    this.ctx.addShutdownCallback(async () => {
      runtime.userData.savedSpeechState?.dispose();
      runtime.userData.ttsCache?.dispose();
    });
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
    this.preparedCache?.dispose();
    this.userData?.savedSpeechState?.dispose();
    this.userData?.ttsCache?.dispose();
    this.failedEarly = true;
    const message = err instanceof Error ? err.message : String(err);
    const unanswered =
      !this.answeredAt && (this.waitForCallee || /no answer/i.test(message));
    const stage = unanswered ? 'join/wait' : 'connect/session';
    console.error(`[agent] ${stage} failed room=${this.roomName}: ${message}`);
    await this.ensureInboundCall(this.sipParticipant);
    if (this.callId) {
      // API owns a gated attempt's pre-dial failure; do not race its status/usage write.
      if (this.meta.openingPreparation && !this.openingPrepared) {
        this.ctx.shutdown('opening_preparation_failed');
        return;
      }
      await this.callbacks.postCallComplete(this.callId, {
        status: 'failed',
        failureCode: stage === 'join/wait' ? 'no_answer' : 'agent_error',
        errorMessage: `Agent failed (${stage}): ${message}`,
        endedAt: new Date().toISOString(),
        usage: { models: this.preparationUsage?.flatten() ?? [] },
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
  let job: unknown;
  try {
    job = JSON.parse(ctx.job.metadata);
  } catch {
    /* existing parser handles legacy metadata */
  }
  if (
    job &&
    typeof job === 'object' &&
    (job as { mode?: string }).mode === 'human_transcription'
  ) {
    const meta = job as import('@call-agent/contracts').HumanTranscriptionJob;
    if (
      typeof meta.callId !== 'string' ||
      !meta.callId ||
      typeof meta.roomName !== 'string' ||
      !meta.roomName
    ) {
      ctx.shutdown('invalid_transcription_job');
      return;
    }
    const { HumanTranscriptionJobRunner } =
      await import('./session/human-transcription-job.js');
    await new HumanTranscriptionJobRunner(ctx, meta).run();
    return;
  }
  return new AgentJob(ctx).run();
}

export default defineAgent({
  entry: runAgentJob,
});
