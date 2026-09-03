/**
 * LiveKit Inference model pins for the default pipeline (Gemma + Deepgram + Inworld).
 * OpenAI / xAI catalog ids use worker plugins and need OPENAI_API_KEY / XAI_API_KEY.
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
