import {
  isRealtimeLlmModel,
  type AgentJobMetadata,
} from '@call-agent/contracts';
import type { llm } from '@livekit/agents';
import type { SessionUserData } from '../tools/types.js';
import { sayCached } from './tts-cache.js';

/** Session-wide guard and teardown for ephemeral filler schedulers. */
export class ToolWaitingState {
  active?: symbol;
  private cleanups = new Set<() => void>();
  disposed = false;
  register(cleanup: () => void): () => void {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }
  dispose(): void {
    this.disposed = true;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
    this.active = undefined;
  }
}

export async function withToolWaiting<T>(
  meta: AgentJobMetadata,
  userData: SessionUserData,
  toolId: string,
  opts: llm.ToolOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const speech = meta.voiceTask?.definition.savedSpeech;
  const waiting = speech?.toolWaiting;
  const config = waiting?.tools[toolId as keyof typeof waiting.tools];
  const sentence =
    config && config.mode !== 'off'
      ? speech?.sentences.find(
          (s) => s.key === config.sentenceKey && s.purpose === 'toolWaiting',
        )
      : undefined;
  if (
    !waiting?.enabled ||
    !config ||
    config.mode === 'off' ||
    !sentence ||
    isRealtimeLlmModel(meta.model) ||
    !opts?.ctx?.filler
  )
    return operation();

  const state = (userData.toolWaitingState ??= new ToolWaitingState());
  if (state.disposed) return operation();
  const token = Symbol(toolId);
  const controller = new AbortController();
  let handle: { interrupt: () => void } | undefined;
  const stop = () => {
    controller.abort();
    try {
      handle?.interrupt();
    } catch {
      /* Session may already be closed. */
    }
    if (state.active === token) state.active = undefined;
  };
  const unregister = state.register(stop);
  opts.abortSignal?.addEventListener('abort', stop, { once: true });
  if (opts.abortSignal?.aborted) stop();
  try {
    return await opts.ctx.filler(
      () => {
        if (controller.signal.aborted || state.disposed || state.active)
          return undefined;
        state.active = token;
        try {
          const speechHandle = sayCached(
            opts.ctx.session,
            userData.ttsCache,
            sentence.text,
            {
              addToChatCtx: false,
              allowInterruptions: true,
              signal: controller.signal,
            },
          );
          handle = speechHandle as typeof handle;
          return speechHandle as ReturnType<typeof opts.ctx.session.say>;
        } catch {
          if (state.active === token) state.active = undefined;
          // Filler playback is optional; never fail or retry the tool operation.
          return undefined;
        }
      },
      { delay: config.delayMs, maxSteps: 1, signal: controller.signal },
      async () => {
        try {
          return await operation();
        } finally {
          stop();
        }
      },
    );
  } finally {
    stop();
    unregister();
    opts.abortSignal?.removeEventListener('abort', stop);
  }
}
