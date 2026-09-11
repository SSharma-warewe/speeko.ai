import { normalizeLanguage, stt } from '@livekit/agents';

export type PluginSttWireType =
  | 'start'
  | 'interim'
  | 'final'
  | 'end'
  | 'usage'
  | 'error';

export type PluginSttWireEvent = {
  type?: PluginSttWireType | string;
  text?: string;
  language?: string;
  requestId?: string;
  startTime?: number;
  endTime?: number;
  audioDuration?: number;
  message?: string;
  retryable?: boolean;
};

export type PluginSttReorderState = {
  language: string;
  requestId: string;
  started: boolean;
  hasInterim: boolean;
  finalEmitted: boolean;
  eosEmitted: boolean;
  pendingEos: boolean;
};

export type PluginSttEventAction =
  | { type: 'ignore' }
  | { type: 'emit'; events: stt.SpeechEvent[] }
  | { type: 'fatal'; message: string; retryable: boolean };

export function createPluginSttReorderState(
  language: string,
): PluginSttReorderState {
  return {
    language,
    requestId: '',
    started: false,
    hasInterim: false,
    finalEmitted: false,
    eosEmitted: false,
    pendingEos: false,
  };
}

function resetUtterance(state: PluginSttReorderState): void {
  state.started = false;
  state.hasInterim = false;
  state.finalEmitted = false;
  state.eosEmitted = false;
  state.pendingEos = false;
}

function startOfSpeech(state: PluginSttReorderState): stt.SpeechEvent {
  return {
    type: stt.SpeechEventType.START_OF_SPEECH,
    requestId: state.requestId || undefined,
  };
}

function endOfSpeech(state: PluginSttReorderState): stt.SpeechEvent {
  state.eosEmitted = true;
  state.pendingEos = false;
  return {
    type: stt.SpeechEventType.END_OF_SPEECH,
    requestId: state.requestId || undefined,
  };
}

function transcriptEvent(
  type: stt.SpeechEventType,
  state: PluginSttReorderState,
  event: PluginSttWireEvent,
): stt.SpeechEvent | null {
  const text = typeof event.text === 'string' ? event.text.trim() : '';
  if (!text) return null;
  const language = normalizeLanguage(
    typeof event.language === 'string' && event.language.trim()
      ? event.language.trim()
      : state.language,
  );
  return {
    type,
    requestId: state.requestId || undefined,
    alternatives: [
      {
        language,
        text: event.text ?? text,
        startTime: typeof event.startTime === 'number' ? event.startTime : 0,
        endTime: typeof event.endTime === 'number' ? event.endTime : 0,
        confidence: 1,
      },
    ],
  };
}

/**
 * Official Python STTRealtime order is EOS (vad.speech_end) then FINAL.
 * That lets LiveKit commit the turn and start preemptive LLM while FINAL
 * arrives. Node skips EOU on empty EOS, so:
 * - interim text already exists → emit EOS immediately, FINAL later
 * - empty EOS and no text yet → hold EOS until FINAL, then FINAL then EOS
 */
export function applyPluginSttWireEvent(
  state: PluginSttReorderState,
  raw: unknown,
): PluginSttEventAction {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { type: 'ignore' };
  }
  const event = raw as PluginSttWireEvent;
  if (typeof event.requestId === 'string' && event.requestId.trim()) {
    state.requestId = event.requestId.trim();
  }
  const kind = typeof event.type === 'string' ? event.type : '';

  if (kind === 'error') {
    return {
      type: 'fatal',
      message: event.message?.trim() || 'Sarvam Python STT plugin error',
      retryable: event.retryable === true,
    };
  }

  if (kind === 'start') {
    resetUtterance(state);
    state.started = true;
    return { type: 'emit', events: [startOfSpeech(state)] };
  }

  if (kind === 'interim') {
    const interim = transcriptEvent(
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      state,
      event,
    );
    if (!interim) return { type: 'ignore' };
    const events: stt.SpeechEvent[] = [];
    if (!state.started) {
      state.started = true;
      events.push(startOfSpeech(state));
    }
    state.hasInterim = true;
    events.push(interim);
    return { type: 'emit', events };
  }

  if (kind === 'final') {
    const finalEvent = transcriptEvent(
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      state,
      event,
    );
    if (!finalEvent) return { type: 'ignore' };
    const events: stt.SpeechEvent[] = [];
    if (!state.started) {
      state.started = true;
      events.push(startOfSpeech(state));
    }
    events.push(finalEvent);
    state.finalEmitted = true;
    if (state.pendingEos && !state.eosEmitted) {
      events.push(endOfSpeech(state));
    }
    return { type: 'emit', events };
  }

  if (kind === 'end') {
    if (state.eosEmitted) return { type: 'ignore' };
    if (state.finalEmitted) {
      return { type: 'emit', events: [endOfSpeech(state)] };
    }
    if (state.hasInterim) {
      const events: stt.SpeechEvent[] = [];
      if (!state.started) {
        state.started = true;
        events.push(startOfSpeech(state));
      }
      events.push(endOfSpeech(state));
      return { type: 'emit', events };
    }
    state.pendingEos = true;
    return { type: 'ignore' };
  }

  if (kind === 'usage') {
    const audioDuration =
      typeof event.audioDuration === 'number' ? event.audioDuration : 0;
    if (audioDuration <= 0) return { type: 'ignore' };
    return {
      type: 'emit',
      events: [
        {
          type: stt.SpeechEventType.RECOGNITION_USAGE,
          requestId: state.requestId || undefined,
          recognitionUsage: { audioDuration },
        },
      ],
    };
  }

  return { type: 'ignore' };
}
