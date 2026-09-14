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
 * Streaming TurnDetector v1 defaults are 300 / 2500. Fragments sit on the
 * 2.5s ceiling; cap at 1s so short Hindi replies do not wait that long.
 * Keep the 300ms floor — complete turns already commit there.
 */
export const PIPELINE_ENDPOINTING = {
  minDelay: 300,
  maxDelay: 1000,
} as const;

/** Start TTS during the EOT wait so Bulbul TTFB (~700ms) is not stacked after commit. */
export const PIPELINE_PREEMPTIVE = {
  preemptiveTts: true,
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
  // only for STT-owned turns. Override streaming 300/2500 with 300/1000 and
  // start TTS during the EOT wait.
  return new voice.AgentSession<SessionUserData>({
    stt: models.stt,
    llm: models.llm,
    tts: models.tts,
    turnHandling: {
      turnDetection: models.turnDetection,
      interruption: { ...PIPELINE_INTERRUPTION },
      endpointing: { ...PIPELINE_ENDPOINTING },
      preemptiveGeneration: { ...PIPELINE_PREEMPTIVE },
    },
    ...(aecWarmupDuration !== undefined ? { aecWarmupDuration } : {}),
    userData,
  });
}
