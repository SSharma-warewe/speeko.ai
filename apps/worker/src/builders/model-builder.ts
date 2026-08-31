import { inference, tts } from '@livekit/agents';
import {
  ttsModelSpec,
  type TtsModelSpec,
} from '@call-agent/contracts';
import type { AgentJobMetadata } from '../job-metadata.js';
import { INFERENCE_MODELS } from '../models.js';
import { OpenRouterTts } from '../tts/openrouter-tts.js';

export function resolveLlmModelOptions(
  meta: AgentJobMetadata,
): { temperature?: number } {
  if (typeof meta.temperature === 'number' && !Number.isNaN(meta.temperature)) {
    return { temperature: meta.temperature };
  }
  return {};
}

export function resolveTtsSpec(meta: AgentJobMetadata): TtsModelSpec {
  return ttsModelSpec(meta.ttsModel);
}

export function resolveTtsVoice(
  meta: AgentJobMetadata,
  spec: TtsModelSpec = resolveTtsSpec(meta),
): string {
  const requested =
    typeof meta.voice === 'string' && meta.voice.trim()
      ? meta.voice.trim()
      : null;
  if (requested && spec.voices.some((v) => v.id === requested)) {
    return requested;
  }
  return spec.defaultVoice;
}

export function resolveTtsModelOptions(
  meta: AgentJobMetadata,
  spec: TtsModelSpec = resolveTtsSpec(meta),
): Record<string, string | number> {
  const options: Record<string, string | number> = {};
  if (
    spec.controls.speakingRate &&
    typeof meta.speakingRate === 'number' &&
    !Number.isNaN(meta.speakingRate)
  ) {
    if (spec.id === 'inworld/inworld-tts-2') {
      options.speaking_rate = meta.speakingRate;
    } else {
      options.speed = meta.speakingRate;
    }
  }
  if (
    spec.controls.deliveryMode &&
    (meta.deliveryMode === 'STABLE' ||
      meta.deliveryMode === 'BALANCED' ||
      meta.deliveryMode === 'CREATIVE')
  ) {
    options.delivery_mode = meta.deliveryMode;
  }
  return options;
}

export function createTts(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): tts.TTS {
  const spec = resolveTtsSpec(meta);
  const voice = resolveTtsVoice(meta, spec);
  if (spec.backend === 'openrouter') {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        `TTS model ${spec.id} requires OPENROUTER_API_KEY on the worker`,
      );
    }
    return new OpenRouterTts({
      apiKey,
      model: spec.runtimeModel,
      voice,
    });
  }

  const ttsOptions = resolveTtsModelOptions(meta, spec);
  return new inference.TTS({
    model: spec.runtimeModel as typeof INFERENCE_MODELS.tts.model,
    voice,
    ...(Object.keys(ttsOptions).length > 0 ? { modelOptions: ttsOptions } : {}),
  });
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

  return {
    stt: new inference.STT({
      model: INFERENCE_MODELS.stt.model,
      language: INFERENCE_MODELS.stt.language,
    }),
    llm: new inference.LLM({
      model: llmModel as typeof INFERENCE_MODELS.llm.model,
      ...(Object.keys(llmOptions).length > 0 ? { modelOptions: llmOptions } : {}),
    }),
    tts: createTts(meta),
    // Cloud turn-detector-v1 via LiveKit Inference (not local v1-mini).
    // Local mini would force the shared EOT inference process (~138 MB idle).
    turnDetection: new inference.TurnDetector({ version: 'v1' }),
  };
}

export type ResolvedModels = ReturnType<typeof buildModels>;
