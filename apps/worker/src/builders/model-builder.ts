import { inference, llm, stt, tts } from '@livekit/agents';
import {
  DEFAULT_STT_SPEECH_LANGUAGE_ID,
  DEFAULT_TTS_SPEECH_LANGUAGE_ID,
  canonicalizeSpeechLanguageId,
  isRealtimeLlmModel,
  isTtsSpeechLanguage,
  llmModelSpec,
  sttModelSpec,
  ttsModelSpec,
  type LlmModelSpec,
  type SttModelSpec,
  type TtsModelSpec,
} from '@call-agent/contracts';
import * as openai from '@livekit/agents-plugin-openai';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as xai from '@livekit/agents-plugin-xai';
import type { AgentJobMetadata } from '../job-metadata.js';
import { INFERENCE_MODELS } from '../models.js';
import { personaSpeaksHindi } from './prompt-builder.js';
import {
  SpeekoOpenaiRealtimeModel,
  SpeekoXaiRealtimeModel,
} from './realtime-models.js';

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

export function resolveSttSpec(meta: AgentJobMetadata): SttModelSpec {
  return sttModelSpec(meta.sttModel);
}

/** Explicit metadata language, if it is a known catalog id. */
export function resolveSpeechLanguage(
  meta: AgentJobMetadata,
): string | null {
  return canonicalizeSpeechLanguageId(meta.speechLanguage) ?? null;
}

/** Bulbul requires a real BCP-47 code — never `unknown`. */
export function resolveTtsLanguage(meta: AgentJobMetadata): string {
  const explicit = resolveSpeechLanguage(meta);
  if (explicit && isTtsSpeechLanguage(explicit)) return explicit;
  if (personaSpeaksHindi(meta)) return 'hi-IN';
  return DEFAULT_TTS_SPEECH_LANGUAGE_ID;
}

/** Saaras accepts `unknown` for auto-detect. */
export function resolveSttLanguage(meta: AgentJobMetadata): string {
  return resolveSpeechLanguage(meta) ?? DEFAULT_STT_SPEECH_LANGUAGE_ID;
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
    } else if (spec.backend === 'sarvam-plugin') {
      options.pace = meta.speakingRate;
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
  const pace =
    typeof ttsOptions.pace === 'number' ? ttsOptions.pace : undefined;

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

  if (spec.backend === 'sarvam-plugin') {
    return new sarvam.TTS({
      apiKey: requireEnv(env, 'SARVAM_API_KEY', spec.id),
      model: spec.runtimeModel as 'bulbul:v3',
      speaker: voice,
      targetLanguageCode: resolveTtsLanguage(meta) as 'en-IN',
      ...(pace !== undefined ? { pace } : {}),
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

/**
 * xAI plugin default is 200ms silence + interrupt_response, which clips Hindi
 * and talks over the greeting. Pin a phone-call VAD: wait out a short pause,
 * do not barge in on the agent.
 */
export const XAI_REALTIME_TURN_DETECTION = {
  type: 'server_vad' as const,
  threshold: 0.5,
  prefix_padding_ms: 400,
  silence_duration_ms: 700,
  create_response: true,
  interrupt_response: false,
};

export function createRealtimeLlm(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): llm.RealtimeModel {
  const spec = resolveLlmSpec(meta);
  const voice = resolveRealtimeVoice(meta, spec);

  if (spec.backend === 'xai-plugin') {
    // xAI RealtimeModelOptions omits turnDetection in its published types,
    // but the constructor spreads options onto OpenAI RealtimeModel which
    // accepts it (plugin default is 200ms / interrupt on).
    const xaiOptions = {
      apiKey: requireEnv(env, 'XAI_API_KEY', spec.id),
      model: spec.runtimeModel,
      voice,
      turnDetection: XAI_REALTIME_TURN_DETECTION,
    };
    return new SpeekoXaiRealtimeModel(xaiOptions);
  }

  return new SpeekoOpenaiRealtimeModel({
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

export function createStt(
  meta: AgentJobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): stt.STT {
  const spec = resolveSttSpec(meta);
  if (spec.backend === 'sarvam-plugin') {
    return new sarvam.STT({
      apiKey: requireEnv(env, 'SARVAM_API_KEY', spec.id),
      model: spec.runtimeModel as 'saaras:v3',
      languageCode: resolveSttLanguage(meta) as 'unknown',
      mode: 'transcribe',
      highVadSensitivity: true,
    });
  }

  return new inference.STT({
    model: INFERENCE_MODELS.stt.model,
    language: INFERENCE_MODELS.stt.language,
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
    stt: createStt(meta, env),
    llm: createLlm(meta, env),
    tts: createTts(meta, env),
    turnDetection: new inference.TurnDetector({ version: 'v1' }),
  };
}

export type ResolvedModels = ReturnType<typeof buildModels>;
