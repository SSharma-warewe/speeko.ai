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

/**
 * Sarvam saaras:v3-realtime owns VAD. Node delays are milliseconds
 * (Python LiveKit docs use seconds). Keep a short hold so preemptive LLM
 * can start after EOS while FINAL arrives — do not restack 500–2500ms.
 */
export const SARVAM_REALTIME_TURN_HANDLING = {
  turnDetection: 'stt' as const,
  endpointing: { mode: 'fixed' as const, minDelay: 250, maxDelay: 400 },
  interruption: {
    enabled: true,
    mode: 'vad' as const,
    minWords: 1,
    falseInterruptionTimeout: 1500,
    ...PIPELINE_INTERRUPTION,
  },
  preemptiveGeneration: { enabled: true },
};

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

  if (models.turnDetection === 'stt') {
    return new voice.AgentSession<SessionUserData>({
      stt: models.stt,
      llm: models.llm,
      tts: models.tts,
      vad: null,
      turnHandling: { ...SARVAM_REALTIME_TURN_HANDLING },
      ...(aecWarmupDuration !== undefined ? { aecWarmupDuration } : {}),
      userData,
    });
  }

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
