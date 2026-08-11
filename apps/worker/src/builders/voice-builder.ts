import { voice } from '@livekit/agents';
import type { ResolvedModels } from './model-builder.js';
import type { SessionUserData } from '../tools/types.js';

export function buildAgentSession(
  models: ResolvedModels,
  userData: SessionUserData,
): voice.AgentSession<SessionUserData> {
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
