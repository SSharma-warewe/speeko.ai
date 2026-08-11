import { inference } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import { INFERENCE_MODELS } from '../models.js';

/**
 * Resolve STT/LLM/TTS from metadata overrides + worker model pins.
 * Return type inferred to avoid inference.STT/TTS generic friction.
 */
export function buildModels(meta: AgentJobMetadata) {
  const llmModel =
    typeof meta.model === 'string' && meta.model.trim()
      ? meta.model.trim()
      : INFERENCE_MODELS.llm.model;

  const modelOptions: { temperature?: number } = {};
  if (typeof meta.temperature === 'number' && !Number.isNaN(meta.temperature)) {
    modelOptions.temperature = meta.temperature;
  }

  return {
    stt: new inference.STT({
      model: INFERENCE_MODELS.stt.model,
      language: INFERENCE_MODELS.stt.language,
    }),
    llm: new inference.LLM({
      model: llmModel as typeof INFERENCE_MODELS.llm.model,
      ...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
    }),
    tts: new inference.TTS({
      model: INFERENCE_MODELS.tts.model,
      voice:
        typeof meta.voice === 'string' && meta.voice.trim()
          ? meta.voice.trim()
          : INFERENCE_MODELS.tts.voice,
    }),
    // Cloud turn-detector-v1 via LiveKit Inference (not local v1-mini).
    // Local mini would force the shared EOT inference process (~138 MB idle).
    turnDetection: new inference.TurnDetector({ version: 'v1' }),
  };
}

export type ResolvedModels = ReturnType<typeof buildModels>;
