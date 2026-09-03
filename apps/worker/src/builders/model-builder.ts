import { inference, llm, tts } from '@livekit/agents';
import {
  isRealtimeLlmModel,
  llmModelSpec,
  ttsModelSpec,
  type LlmModelSpec,
  type TtsModelSpec,
} from '@call-agent/contracts';
import * as openai from '@livekit/agents-plugin-openai';
import * as xai from '@livekit/agents-plugin-xai';
import type { AgentJobMetadata } from '../job-metadata.js';
import { INFERENCE_MODELS } from '../models.js';

export function resolveLlmSpec(meta: AgentJobMetadata): LlmModelSpec {
  return llmModelSpec(meta.model);
}

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

export function resolveRealtimeVoice(
  meta: AgentJobMetadata,
  spec: LlmModelSpec = resolveLlmSpec(meta),
): string {
  const requested =
    typeof meta.voice === 'string' && meta.voice.trim()
      ? meta.voice.trim()
      : null;
  if (requested && spec.voices.some((v) => v.id === requested)) {
    return requested;
  }
  return spec.defaultVoice ?? 'marin';
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

function requireEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  specId: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Model ${specId} requires ${name} on the worker`);
  }
  return value;
}

export function createTts(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): tts.TTS {
  const spec = resolveTtsSpec(meta);
  const voice = resolveTtsVoice(meta, spec);
  const ttsOptions = resolveTtsModelOptions(meta, spec);
  const speed =
    typeof ttsOptions.speed === 'number' ? ttsOptions.speed : undefined;

  if (spec.backend === 'openai-plugin') {
    return new openai.TTS({
      apiKey: requireEnv(env, 'OPENAI_API_KEY', spec.id),
      model: spec.runtimeModel,
      voice: voice as 'ash',
      ...(speed !== undefined ? { speed } : {}),
    });
  }

  if (spec.backend === 'xai-plugin') {
    return new xai.TTS({
      apiKey: requireEnv(env, 'XAI_API_KEY', spec.id),
      voice,
      ...(speed !== undefined ? { speed } : {}),
    });
  }

  return new inference.TTS({
    model: spec.runtimeModel as typeof INFERENCE_MODELS.tts.model,
    voice,
    ...(Object.keys(ttsOptions).length > 0 ? { modelOptions: ttsOptions } : {}),
  });
}

export function createLlm(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): llm.LLM {
  const spec = resolveLlmSpec(meta);
  const llmOptions = resolveLlmModelOptions(meta);
  const temperature = llmOptions.temperature;

  if (spec.backend === 'openai-plugin' && spec.kind === 'llm') {
    return new openai.responses.LLM({
      apiKey: requireEnv(env, 'OPENAI_API_KEY', spec.id),
      model: spec.runtimeModel,
      ...(temperature !== undefined ? { temperature } : {}),
    });
  }

  if (spec.backend === 'xai-plugin' && spec.kind === 'llm') {
    return openai.LLM.withXAI({
      apiKey: requireEnv(env, 'XAI_API_KEY', spec.id),
      model: spec.runtimeModel,
      ...(temperature !== undefined ? { temperature } : {}),
    });
  }

  return new inference.LLM({
    model: spec.runtimeModel as typeof INFERENCE_MODELS.llm.model,
    ...(temperature !== undefined ? { modelOptions: { temperature } } : {}),
  });
}

export function createRealtimeLlm(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): llm.RealtimeModel {
  const spec = resolveLlmSpec(meta);
  const voice = resolveRealtimeVoice(meta, spec);

  if (spec.backend === 'xai-plugin') {
    return new xai.realtime.RealtimeModel({
      apiKey: requireEnv(env, 'XAI_API_KEY', spec.id),
      model: spec.runtimeModel,
      voice,
    });
  }

  return new openai.realtime.RealtimeModel({
    apiKey: requireEnv(env, 'OPENAI_API_KEY', spec.id),
    model: spec.runtimeModel,
    voice,
    turnDetection: {
      type: 'semantic_vad',
      eagerness: 'medium',
      create_response: true,
      interrupt_response: true,
    },
  });
}

/**
 * Resolve STT/LLM/TTS (pipeline) or a speech-to-speech realtime model.
 * Return type inferred to avoid inference.STT generic friction.
 */
export function buildModels(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (isRealtimeLlmModel(meta.model)) {
    return {
      kind: 'realtime' as const,
      llm: createRealtimeLlm(meta, env),
    };
  }

  return {
    kind: 'pipeline' as const,
    stt: new inference.STT({
      model: INFERENCE_MODELS.stt.model,
      language: INFERENCE_MODELS.stt.language,
    }),
    llm: createLlm(meta, env),
    tts: createTts(meta, env),
    turnDetection: new inference.TurnDetector({ version: 'v1' }),
  };
}

export type ResolvedModels = ReturnType<typeof buildModels>;
