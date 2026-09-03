import { voice } from '@livekit/agents';
import type { ResolvedModels } from './model-builder.js';
import type { SessionUserData } from '../tools/types.js';

export function buildAgentSession(
  models: ResolvedModels,
  userData: SessionUserData,
): voice.AgentSession<SessionUserData> {
  if (models.kind === 'realtime') {
    return new voice.AgentSession<SessionUserData>({
      llm: models.llm,
      // Realtime models own VAD / turn-taking. The AgentSession defaults
      // (Silero VAD + InferenceTurnDetector) fight server-side detection
      // and can publish audio while outbound SIP is still INVITEing.
      vad: null,
      turnHandling: { turnDetection: null },
      userData,
    });
  }

  return new voice.AgentSession<SessionUserData>({
    stt: models.stt,
    llm: models.llm,
    tts: models.tts,
    turnHandling: {
      turnDetection: models.turnDetection,
    },
    userData,
  });
}
