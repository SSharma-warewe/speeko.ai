import { inference } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import { INFERENCE_MODELS } from '../models.js';

export function resolveLlmModelOptions(
  meta: AgentJobMetadata,
): { temperature?: number } {
  if (typeof meta.temperature === 'number' && !Number.isNaN(meta.temperature)) {
    return { temperature: meta.temperature };
  }
  return {};
}

export function resolveTtsVoice(meta: AgentJobMetadata): string {
  return typeof meta.voice === 'string' && meta.voice.trim()
    ? meta.voice.trim()
    : INFERENCE_MODELS.tts.voice;
}

export function resolveTtsModelOptions(meta: AgentJobMetadata): {
  speaking_rate?: number;
  delivery_mode?: 'STABLE' | 'BALANCED' | 'CREATIVE';
} {
  const options: {
    speaking_rate?: number;
    delivery_mode?: 'STABLE' | 'BALANCED' | 'CREATIVE';
  } = {};
  if (
    typeof meta.speakingRate === 'number' &&
    !Number.isNaN(meta.speakingRate)
  ) {
    options.speaking_rate = meta.speakingRate;
  }
  if (
    meta.deliveryMode === 'STABLE' ||
    meta.deliveryMode === 'BALANCED' ||
    meta.deliveryMode === 'CREATIVE'
  ) {
    options.delivery_mode = meta.deliveryMode;
  }
  return options;
}

/**
 * Resolve STT/LLM/TTS from metadata overrides + worker model pins.
 * Return type inferred to avoid inference.STT/TTS generic friction.
 */
export function buildModels(meta: AgentJobMetadata) {
  const llmModel =
    typeof meta.model === 'string' && meta.model.trim()
      ? meta.model.trim()
      : INFERENCE_MODELS.llm.model;

  const llmOptions = resolveLlmModelOptions(meta);
  const ttsVoice = resolveTtsVoice(meta);
  const ttsOptions = resolveTtsModelOptions(meta);

  return {
    stt: new inference.STT({
      model: INFERENCE_MODELS.stt.model,
      language: INFERENCE_MODELS.stt.language,
    }),
    llm: new inference.LLM({
      model: llmModel as typeof INFERENCE_MODELS.llm.model,
      ...(Object.keys(llmOptions).length > 0 ? { modelOptions: llmOptions } : {}),
    }),
    tts: new inference.TTS({
      model: INFERENCE_MODELS.tts.model,
      voice: ttsVoice,
      ...(Object.keys(ttsOptions).length > 0 ? { modelOptions: ttsOptions } : {}),
    }),
    // Cloud turn-detector-v1 via LiveKit Inference (not local v1-mini).
    // Local mini would force the shared EOT inference process (~138 MB idle).
    turnDetection: new inference.TurnDetector({ version: 'v1' }),
  };
}

export type ResolvedModels = ReturnType<typeof buildModels>;
