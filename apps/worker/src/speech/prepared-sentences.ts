import {
  isRealtimeLlmModel,
  type AgentJobMetadata,
  savedSpeechHookText,
} from '@call-agent/contracts';
import { cannedClosingLine, resolveExactOpening } from '../builders/prompt-builder.js';
import {
  demoBookingCacheLines,
  isOutboundDemoBooking,
} from '../tasks/demo-booking-tracks.js';
import {
  inboundServiceTrackLines,
  inboundScriptCacheLines,
} from '../tasks/inbound-service-tracks.js';

/** Foreground opening eligibility is separate from speculative preparation. */
export function preparedOpeningText(meta: AgentJobMetadata): string | undefined {
  if (meta.ttsPreparedSpeechEnabled !== true) return undefined;
  const opening = resolveExactOpening(meta);
  if (typeof opening !== 'string') return undefined;
  const speech = meta.voiceTask?.definition.savedSpeech;
  if (savedSpeechHookText(speech, 'opening') === undefined) return opening;
  return speech?.sentences.some((s) => s.text === opening && s.prepare) ? opening : undefined;
}

/** Exact finite speech only. The opening always has foreground priority. */
export function preparedSentences(meta: AgentJobMetadata): string[] {
  if (isRealtimeLlmModel(meta.model)) return [];
  const lines: string[] = [];
  const speech = meta.voiceTask?.definition.savedSpeech;
  const opening = resolveExactOpening(meta);
  if (speech)
    lines.push(
      ...speech.sentences
        .filter((s) => s.prepare && s.text !== opening)
        .map((s) => s.text),
    );
  if (!meta.voiceTask && meta.direction === 'inbound') {
    lines.push(...inboundServiceTrackLines(), ...inboundScriptCacheLines());
  }
  if (isOutboundDemoBooking(meta)) lines.push(...demoBookingCacheLines(meta));
  const closing = cannedClosingLine(meta);
  const closingHook = speech?.closing;
  if (
    closing &&
    (closingHook?.mode !== 'sentence' ||
      speech?.sentences.find((s) => s.key === closingHook.key)?.prepare)
  )
    lines.push(closing);
  return [...new Set(lines)].filter((line) => line !== opening);
}
