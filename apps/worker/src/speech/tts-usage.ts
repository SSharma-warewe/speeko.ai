import type { tts } from '@livekit/agents';

const guarded = new WeakSet<tts.TTS>();

/**
 * LiveKit 1.7.1 StreamAdapterWrapper emits streamed metrics on the original
 * non-streaming provider, in addition to its ChunkedStream's request metrics.
 * Keep the request metrics (including tokens and partial/error usage) once.
 * This does not deduplicate real requests, retries, or native streaming events.
 */
export function preserveTtsRequestUsage<T extends tts.TTS>(provider: T): T {
  if (provider.capabilities?.streaming !== false || guarded.has(provider))
    return provider;
  guarded.add(provider);
  const emit = provider.emit;
  provider.emit = ((event: string, ...args: unknown[]) => {
    if (
      event === 'metrics_collected' &&
      (args[0] as { streamed?: boolean } | undefined)?.streamed === true
    )
      return false;
    return Reflect.apply(emit, provider, [event, ...args]);
  }) as typeof provider.emit;
  return provider;
}
