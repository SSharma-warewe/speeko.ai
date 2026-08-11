/**
 * LiveKit Inference model pins — change here when swapping providers/models.
 * Requires only LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (no extra AI keys).
 * @see https://docs.livekit.io/agents/models/
 */
export const INFERENCE_MODELS = {
  stt: {
    model: 'deepgram/nova-3' as const,
    language: 'multi' as const,
  },
  llm: {
    model: 'google/gemma-4-31b-it' as const,
  },
  tts: {
    model: 'inworld/inworld-tts-2' as const,
    voice: 'Ashley',
  },
};
