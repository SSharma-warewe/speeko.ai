import { createHash, randomUUID } from 'node:crypto';
import {
  TTS_CACHE_NAMESPACE,
  type AgentJobMetadata,
  type TtsBackend,
} from '@call-agent/contracts';

export type ResolvedTtsConfiguration = {
  backend: TtsBackend;
  runtimeModel: string;
  voice: string;
  language: string | null;
  streaming: boolean;
  options: Record<string, string | number | boolean | null>;
};

export function cacheTenantScope(meta: AgentJobMetadata): string {
  return meta.organizationId || `job:${randomUUID()}`;
}

function stable(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function ttsCacheIdentity(
  scope: string,
  config: ResolvedTtsConfiguration,
  format: { sampleRate: number; numChannels: number },
  transport: string,
  transform: string,
  text: string,
): string {
  return createHash('sha256')
    .update(
      stable({
        revision: 1,
        namespaceVersion: TTS_CACHE_NAMESPACE,
        compatibility: 'livekit-1.7.1',
        organizationScope: scope,
        backend: config.backend,
        runtimeModel: config.runtimeModel,
        voice: config.voice,
        language: config.language,
        options: config.options,
        ...format,
        outputFormat: 'pcm-s16le',
        transport,
        transformRevision: transform,
        spokenText: text,
      }),
    )
    .digest('hex');
}
