import { llm, voice } from '@livekit/agents';
import { TransformStream, type ReadableStream } from 'node:stream/web';
import type { SavedSentence } from '@call-agent/contracts';
import { sayCached, type CachedSaySession } from './tts-cache.js';
import type { SessionUserData } from '../tools/types.js';

type Playback = {
  waitForPlayout?: () => Promise<void>;
  interrupt?: (force?: boolean) => void;
};
export type SavedSpeechState = ReturnType<typeof createSavedSpeechState>;

/** Defer only completion until all tool choices in this model step are known.
 * Saved playback still starts as soon as its key arrives. No timer or extra LLM call.
 */
export function guardSavedSpeechCompletion(
  input: ReadableStream<llm.ChatChunk | string>,
): ReadableStream<llm.ChatChunk | string> {
  let completion: llm.ChatChunk | undefined;
  let savedQuestion = false;
  return input.pipeThrough(
    new TransformStream<llm.ChatChunk | string, llm.ChatChunk | string>({
      transform(chunk, output) {
        if (typeof chunk === 'string' || !chunk.delta?.toolCalls?.length) {
          output.enqueue(chunk);
          return;
        }
        const tools = chunk.delta.toolCalls;
        savedQuestion ||= tools.some((t) => t.name === 'speak_saved_sentence');
        const finish = tools.find((t) => t.name === 'complete_voice_task');
        if (finish && !completion)
          completion = {
            id: chunk.id,
            delta: { role: chunk.delta.role, toolCalls: [finish] },
          };
        output.enqueue({
          ...chunk,
          delta: {
            ...chunk.delta,
            toolCalls: tools.filter((t) => t.name !== 'complete_voice_task'),
          },
        });
      },
      flush(output) {
        if (completion && !savedQuestion) output.enqueue(completion);
        completion = undefined;
      },
    }),
  );
}

export const savedSpeechLlmNode: NonNullable<
  voice.AgentHooks<unknown>['llmNode']
> = async (ctx, chatCtx, toolCtx, settings) => {
  const stream = await voice.Agent.default.llmNode(
    ctx.agent,
    chatCtx,
    toolCtx,
    settings,
  );
  return stream ? guardSavedSpeechCompletion(stream) : null;
};

/** One call-owned queue. Cancellation never retries speech or retains queued audio. */
export function createSavedSpeechState(userData: SessionUserData) {
  const controller = new AbortController();
  const executed = new Set<string>();
  let tail = Promise.resolve();
  let turn = 0;
  let spokenTurn = -1;
  let disposed = false;
  let pending = 0;
  return {
    get awaitingAnswer() {
      return !disposed && spokenTurn === turn;
    },
    get pending() {
      return pending;
    },
    userTurn() {
      turn++;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      executed.clear();
    },
    async speak(
      sentence: SavedSentence,
      session: CachedSaySession,
      callId: string,
      signal: AbortSignal,
    ): Promise<void> {
      if (disposed || signal.aborted || executed.has(callId)) return;
      if (executed.size >= 256)
        throw new llm.ToolError('Saved speech limit reached for this call.');
      if (spokenTurn === turn) throw new voice.StopResponse();
      executed.add(callId);
      spokenTurn = turn; // Claim synchronously before parallel completion/tools can run.
      pending++;
      const prior = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      let onAbort: (() => void) | undefined;
      let audioAbort: AbortController | undefined;
      try {
        await prior;
        if (disposed || signal.aborted) return;
        let cancel!: () => void;
        const cancelled = new Promise<void>((resolve) => {
          cancel = resolve;
        });
        let handle: Playback | undefined;
        audioAbort = new AbortController();
        let aborted = false;
        onAbort = () => {
          if (aborted) return;
          aborted = true;
          audioAbort?.abort();
          try {
            handle?.interrupt?.(true);
          } catch {
            /* Already interrupted. */
          }
          cancel();
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });
        handle = sayCached(session, userData.ttsCache, sentence.text, {
          addToChatCtx: true,
          allowInterruptions: true,
          signal: audioAbort.signal,
        }) as Playback;
        if (disposed || signal.aborted) onAbort();
        await Promise.race([
          handle?.waitForPlayout?.() ?? Promise.resolve(),
          cancelled,
        ]);
        // undefined is intentional: SDK tool output then has replyRequired=false.
      } finally {
        audioAbort?.abort();
        if (onAbort) {
          controller.signal.removeEventListener('abort', onAbort);
          signal.removeEventListener('abort', onAbort);
        }
        pending--;
        release();
      }
    },
  };
}
