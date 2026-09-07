/**
 * BCP-47 speech language for Sarvam STT / TTS.
 * Deepgram STT and non-Sarvam TTS ignore this field.
 */

export const SPEECH_LANGUAGE_IDS = {
  unknown: 'unknown',
  hiIN: 'hi-IN',
  enIN: 'en-IN',
  bnIN: 'bn-IN',
  taIN: 'ta-IN',
  teIN: 'te-IN',
  knIN: 'kn-IN',
  mlIN: 'ml-IN',
  mrIN: 'mr-IN',
  guIN: 'gu-IN',
  paIN: 'pa-IN',
  odIN: 'od-IN',
} as const;

export type SpeechLanguageId =
  (typeof SPEECH_LANGUAGE_IDS)[keyof typeof SPEECH_LANGUAGE_IDS];

export type SpeechLanguageOption = {
  id: SpeechLanguageId;
  name: string;
  /** True when Bulbul TTS accepts this code. */
  tts: boolean;
};

export const SPEECH_LANGUAGES: readonly SpeechLanguageOption[] = [
  { id: SPEECH_LANGUAGE_IDS.unknown, name: 'Auto-detect', tts: false },
  { id: SPEECH_LANGUAGE_IDS.hiIN, name: 'Hindi', tts: true },
  { id: SPEECH_LANGUAGE_IDS.enIN, name: 'English (India)', tts: true },
  { id: SPEECH_LANGUAGE_IDS.bnIN, name: 'Bengali', tts: true },
  { id: SPEECH_LANGUAGE_IDS.taIN, name: 'Tamil', tts: true },
  { id: SPEECH_LANGUAGE_IDS.teIN, name: 'Telugu', tts: true },
  { id: SPEECH_LANGUAGE_IDS.knIN, name: 'Kannada', tts: true },
  { id: SPEECH_LANGUAGE_IDS.mlIN, name: 'Malayalam', tts: true },
  { id: SPEECH_LANGUAGE_IDS.mrIN, name: 'Marathi', tts: true },
  { id: SPEECH_LANGUAGE_IDS.guIN, name: 'Gujarati', tts: true },
  { id: SPEECH_LANGUAGE_IDS.paIN, name: 'Punjabi', tts: true },
  { id: SPEECH_LANGUAGE_IDS.odIN, name: 'Odia', tts: true },
];

export const TTS_SPEECH_LANGUAGES: readonly SpeechLanguageOption[] =
  SPEECH_LANGUAGES.filter((l) => l.tts);

export const DEFAULT_TTS_SPEECH_LANGUAGE_ID = SPEECH_LANGUAGE_IDS.enIN;
export const DEFAULT_STT_SPEECH_LANGUAGE_ID = SPEECH_LANGUAGE_IDS.unknown;

const SPEECH_LANGUAGE_ALIASES: Record<string, SpeechLanguageId> = {
  unknown: SPEECH_LANGUAGE_IDS.unknown,
  auto: SPEECH_LANGUAGE_IDS.unknown,
  'hi-in': SPEECH_LANGUAGE_IDS.hiIN,
  'hi-IN': SPEECH_LANGUAGE_IDS.hiIN,
  hindi: SPEECH_LANGUAGE_IDS.hiIN,
  'en-in': SPEECH_LANGUAGE_IDS.enIN,
  'en-IN': SPEECH_LANGUAGE_IDS.enIN,
  'bn-in': SPEECH_LANGUAGE_IDS.bnIN,
  'bn-IN': SPEECH_LANGUAGE_IDS.bnIN,
  'ta-in': SPEECH_LANGUAGE_IDS.taIN,
  'ta-IN': SPEECH_LANGUAGE_IDS.taIN,
  'te-in': SPEECH_LANGUAGE_IDS.teIN,
  'te-IN': SPEECH_LANGUAGE_IDS.teIN,
  'kn-in': SPEECH_LANGUAGE_IDS.knIN,
  'kn-IN': SPEECH_LANGUAGE_IDS.knIN,
  'ml-in': SPEECH_LANGUAGE_IDS.mlIN,
  'ml-IN': SPEECH_LANGUAGE_IDS.mlIN,
  'mr-in': SPEECH_LANGUAGE_IDS.mrIN,
  'mr-IN': SPEECH_LANGUAGE_IDS.mrIN,
  'gu-in': SPEECH_LANGUAGE_IDS.guIN,
  'gu-IN': SPEECH_LANGUAGE_IDS.guIN,
  'pa-in': SPEECH_LANGUAGE_IDS.paIN,
  'pa-IN': SPEECH_LANGUAGE_IDS.paIN,
  'od-in': SPEECH_LANGUAGE_IDS.odIN,
  'od-IN': SPEECH_LANGUAGE_IDS.odIN,
  'or-IN': SPEECH_LANGUAGE_IDS.odIN,
  'or-in': SPEECH_LANGUAGE_IDS.odIN,
};

export function canonicalizeSpeechLanguageId(
  raw: string | null | undefined,
): SpeechLanguageId | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return (
    SPEECH_LANGUAGE_ALIASES[trimmed] ??
    SPEECH_LANGUAGE_ALIASES[trimmed.toLowerCase()]
  );
}

export function isKnownSpeechLanguage(
  id: string,
): id is SpeechLanguageId {
  return canonicalizeSpeechLanguageId(id) != null;
}

export function isTtsSpeechLanguage(
  id: string | null | undefined,
): boolean {
  const canonical = canonicalizeSpeechLanguageId(id);
  if (!canonical) return false;
  return SPEECH_LANGUAGES.some((l) => l.id === canonical && l.tts);
}
