import { normalizeLanguage, stt } from '@livekit/agents';

export type SarvamRealtimeClose = {
  code: number | null;
  reason: string;
};

export type SarvamRealtimeEventAction =
  | { type: 'ignore' }
  | { type: 'emit'; events: stt.SpeechEvent[] }
  | { type: 'fatal'; message: string; statusCode: number; retryable: boolean };

export type SarvamRealtimeSessionState = {
  requestId: string;
  language: string;
  speaking: boolean;
  started: boolean;
  speechEnded: boolean;
  finalEmitted: boolean;
  eosEmitted: boolean;
};

export function createSarvamRealtimeSessionState(
  language: string,
): SarvamRealtimeSessionState {
  return {
    requestId: '',
    language,
    speaking: false,
    started: false,
    speechEnded: false,
    finalEmitted: false,
    eosEmitted: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function transcriptEvent(
  type: stt.SpeechEventType,
  state: SarvamRealtimeSessionState,
  data: Record<string, unknown>,
): stt.SpeechEvent | null {
  const text = asString(data.text);
  if (!text) return null;
  const language = normalizeLanguage(asString(data.language) ?? state.language);
  const startTime = asNumber(data.start_s) ?? 0;
  const endTime = asNumber(data.end_s) ?? 0;
  return {
    type,
    requestId: state.requestId || undefined,
    alternatives: [
      {
        language,
        text,
        startTime,
        endTime,
        confidence: 1,
      },
    ],
  };
}

function resetUtterance(state: SarvamRealtimeSessionState): void {
  state.speaking = false;
  state.started = false;
  state.speechEnded = false;
  state.finalEmitted = false;
  state.eosEmitted = false;
}

function startOfSpeech(
  state: SarvamRealtimeSessionState,
): stt.SpeechEvent {
  return {
    type: stt.SpeechEventType.START_OF_SPEECH,
    requestId: state.requestId || undefined,
  };
}

function endOfSpeech(state: SarvamRealtimeSessionState): stt.SpeechEvent {
  state.eosEmitted = true;
  return {
    type: stt.SpeechEventType.END_OF_SPEECH,
    requestId: state.requestId || undefined,
  };
}

/**
 * Map one Sarvam realtime JSON message onto LiveKit STT events.
 *
 * Node Agents skip EOU when END_OF_SPEECH arrives with an empty transcript,
 * so FINAL must be emitted before EOS. Preemptive generation still starts
 * on FINAL; the delayed EOS is what commits the turn and plays the reply.
 */
export function applySarvamRealtimeMessage(
  state: SarvamRealtimeSessionState,
  payload: unknown,
): SarvamRealtimeEventAction {
  const data = asRecord(payload);
  if (!data) return { type: 'ignore' };

  const event = asString(data.event);
  const requestId = asString(data.request_id);
  if (requestId) state.requestId = requestId;

  if (event === 'session.begin' || event === 'config.updated' || event === 'pong') {
    return { type: 'ignore' };
  }

  if (event === 'vad.speech_start') {
    resetUtterance(state);
    state.speaking = true;
    state.started = true;
    return { type: 'emit', events: [startOfSpeech(state)] };
  }

  if (event === 'transcript.partial') {
    const interim = transcriptEvent(
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      state,
      data,
    );
    if (!interim) return { type: 'ignore' };
    const events: stt.SpeechEvent[] = [];
    if (!state.started) {
      state.started = true;
      state.speaking = true;
      events.push(startOfSpeech(state));
    }
    events.push(interim);
    return { type: 'emit', events };
  }

  if (event === 'transcript.final') {
    const finalEvent = transcriptEvent(
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      state,
      data,
    );
    if (!finalEvent) return { type: 'ignore' };
    const events: stt.SpeechEvent[] = [];
    if (!state.started) {
      state.started = true;
      state.speaking = true;
      events.push(startOfSpeech(state));
    }
    events.push(finalEvent);
    state.finalEmitted = true;
    if (state.speechEnded && !state.eosEmitted) {
      events.push(endOfSpeech(state));
      state.speaking = false;
    }
    return { type: 'emit', events };
  }

  if (event === 'vad.speech_end') {
    state.speechEnded = true;
    state.speaking = false;
    if (state.finalEmitted && !state.eosEmitted) {
      return { type: 'emit', events: [endOfSpeech(state)] };
    }
    return { type: 'ignore' };
  }

  if (event === 'session.end') {
    const events: stt.SpeechEvent[] = [];
    if (state.speechEnded && state.finalEmitted && !state.eosEmitted) {
      events.push(endOfSpeech(state));
    } else if (state.speechEnded && !state.eosEmitted) {
      events.push(endOfSpeech(state));
    }
    const audioDuration = asNumber(data.audio_duration_s);
    if (audioDuration != null && audioDuration > 0) {
      events.push({
        type: stt.SpeechEventType.RECOGNITION_USAGE,
        requestId: state.requestId || undefined,
        recognitionUsage: { audioDuration },
      });
    }
    return events.length ? { type: 'emit', events } : { type: 'ignore' };
  }

  if (event === 'error') {
    const fatal = data.is_fatal === true;
    if (!fatal) return { type: 'ignore' };
    const message =
      asString(data.message) ?? 'Sarvam realtime STT error';
    const statusCode = asNumber(data.status_code) ?? -1;
    return {
      type: 'fatal',
      message,
      statusCode,
      retryable: asString(data.code) === 'model_unavailable',
    };
  }

  return { type: 'ignore' };
}

export function closeErrorFromSarvamRealtime(
  close: SarvamRealtimeClose,
): SarvamRealtimeEventAction {
  const code = close.code;
  if (code == null || code === 1000 || code === 1001) {
    return { type: 'ignore' };
  }
  let message = `Sarvam realtime STT WebSocket closed unexpectedly: ${close.reason}`;
  let retryable = false;
  if (code === 1003) {
    message = 'Sarvam realtime STT authentication, quota, or rate limit error';
  } else if (code === 1008) {
    message =
      'Sarvam realtime STT session timed out or exceeded the maximum duration';
  } else if (code === 1013) {
    message = 'Sarvam realtime STT backend temporarily unavailable';
    retryable = true;
  } else if (code === 4000) {
    message = `Sarvam realtime STT rejected the session: ${close.reason}`;
  }
  return {
    type: 'fatal',
    message,
    statusCode: code,
    retryable,
  };
}
