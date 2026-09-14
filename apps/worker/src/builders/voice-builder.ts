import { CallMedium } from '@call-agent/contracts';
import { voice } from '@livekit/agents';
import type { ResolvedModels } from './model-builder.js';
import type { SessionUserData } from '../tools/types.js';

/**
 * Opening generateReply is uninterruptible. LiveKit default discards user
 * audio while the agent cannot be interrupted — keep a "haan" over the last
 * word for the next turn. Do not raise minDuration / minWords here.
 */
export const PIPELINE_INTERRUPTION = {
  discardAudioIfUninterruptible: false,
} as const;

/** Carrier AEC on SIP — LiveKit's 3s warmup blocks barge-in on inbound. */
export function resolveAecWarmupDuration(
  medium?: string,
): number | null | undefined {
  if (medium === CallMedium.SIP) return null;
  return undefined;
}

export function buildAgentSession(
  models: ResolvedModels,
  userData: SessionUserData,
  options: { medium?: string } = {},
): voice.AgentSession<SessionUserData> {
  const aecWarmupDuration = resolveAecWarmupDuration(options.medium);

  if (models.kind === 'realtime') {
    return new voice.AgentSession<SessionUserData>({
      llm: models.llm,
      // Realtime models own VAD / turn-taking. The AgentSession defaults
      // (Silero VAD + InferenceTurnDetector) fight server-side detection
      // and can publish audio while outbound SIP is still INVITEing.
      vad: null,
      turnHandling: { turnDetection: null },
      ...(aecWarmupDuration !== undefined ? { aecWarmupDuration } : {}),
      userData,
    });
  }

  // Pipeline (Deepgram and Sarvam realtime STT): omit vad so AgentSession
  // auto-provisions bundled Silero. TurnDetector v1 requires a VAD; passing
  // vad: null disables EOT. Do not restack 250/400ms endpointing — that was
  // only for STT-owned turns. SDK streaming EOT defaults (300/2500) apply.
  return new voice.AgentSession<SessionUserData>({
    stt: models.stt,
    llm: models.llm,
    tts: models.tts,
    turnHandling: {
      turnDetection: models.turnDetection,
      interruption: { ...PIPELINE_INTERRUPTION },
    },
    ...(aecWarmupDuration !== undefined ? { aecWarmupDuration } : {}),
    userData,
  });
}
