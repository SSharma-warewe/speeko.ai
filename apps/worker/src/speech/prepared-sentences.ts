import {
  isRealtimeLlmModel,
  type AgentJobMetadata,
  savedSpeechHookText,
} from '@call-agent/contracts';
import { cannedClosingLine } from '../builders/prompt-builder.js';
import {
  demoBookingCacheLines,
  isOutboundDemoBooking,
} from '../tasks/demo-booking-tracks.js';
import {
  inboundServiceTrackLines,
  inboundScriptCacheLines,
} from '../tasks/inbound-service-tracks.js';

/** Exact finite speech only. Prompts and LLM-generated questions are not recordings. */
export function preparedSentences(meta: AgentJobMetadata): string[] {
  if (isRealtimeLlmModel(meta.model)) return [];
  const lines: string[] = [];
  const speech = meta.voiceTask?.definition.savedSpeech;
  const opening = savedSpeechHookText(speech, 'opening');
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
  return [...new Set(lines)];
}
