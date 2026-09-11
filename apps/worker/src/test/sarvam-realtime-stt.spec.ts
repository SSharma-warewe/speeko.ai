import { stt } from '@livekit/agents';
import { toSarvamRealtimeLanguage } from '../sarvam/realtime-language';
import {
  applySarvamRealtimeMessage,
  closeErrorFromSarvamRealtime,
  createSarvamRealtimeSessionState,
} from '../sarvam/realtime-stt-events';
import {
  buildSarvamRealtimeWsUrl,
  resolveSarvamRealtimeSttOptions,
} from '../sarvam/realtime-stt';

describe('Sarvam realtime language mapper', () => {
  it('maps portal unknown and Odia onto the realtime wire codes', () => {
    expect(toSarvamRealtimeLanguage('unknown')).toBe('auto');
    expect(toSarvamRealtimeLanguage('')).toBe('auto');
    expect(toSarvamRealtimeLanguage('od-IN')).toBe('or-IN');
    expect(toSarvamRealtimeLanguage('hi-IN')).toBe('hi-IN');
    expect(toSarvamRealtimeLanguage('en-IN')).toBe('en-IN');
  });
});

describe('Sarvam realtime WS URL', () => {
  it('pins telephony fast VAD knobs and language mapping', () => {
    const opts = resolveSarvamRealtimeSttOptions({
      apiKey: 'sk_test',
      language: 'unknown',
    });
    expect(opts.language).toBe('auto');
    expect(opts.streamType).toBe('fast');
    expect(opts.vadMinSilenceMs).toBe(500);
    const url = buildSarvamRealtimeWsUrl(opts);
    expect(url).toContain('language_code=auto');
    expect(url).toContain('stream_type=fast');
    expect(url).toContain('model=saaras%3Av3-realtime');
    expect(url).toContain('silence_duration_ms=500');
  });
});

describe('Sarvam realtime event mapping', () => {
  function typesOf(payloads: unknown[]) {
    const state = createSarvamRealtimeSessionState('hi-IN');
    const types: stt.SpeechEventType[] = [];
    for (const payload of payloads) {
      const action = applySarvamRealtimeMessage(state, payload);
      if (action.type === 'emit') {
        for (const event of action.events) types.push(event.type);
      }
    }
    return { state, types };
  }

  it('emits FINAL before END_OF_SPEECH when Sarvam ends speech first', () => {
    const { types } = typesOf([
      { event: 'session.begin', request_id: 'req-1' },
      { event: 'vad.speech_start', utterance_idx: 0 },
      { event: 'transcript.partial', text: 'haan', utterance_idx: 0 },
      { event: 'vad.speech_end', utterance_idx: 0 },
      { event: 'transcript.final', text: 'Haan.', utterance_idx: 0 },
    ]);
    expect(types).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
    ]);
  });

  it('emits FINAL immediately, then EOS, when the final arrives first', () => {
    const { types } = typesOf([
      { event: 'vad.speech_start' },
      { event: 'transcript.final', text: 'Hello.' },
      { event: 'vad.speech_end' },
    ]);
    expect(types).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
    ]);
  });

  it('ignores non-fatal errors and fails closed sockets', () => {
    const state = createSarvamRealtimeSessionState('en-IN');
    expect(
      applySarvamRealtimeMessage(state, {
        event: 'error',
        is_fatal: false,
        message: 'blip',
      }),
    ).toEqual({ type: 'ignore' });
    expect(closeErrorFromSarvamRealtime({ code: 1000, reason: '' })).toEqual({
      type: 'ignore',
    });
    expect(closeErrorFromSarvamRealtime({ code: 1003, reason: 'quota' })).toEqual(
      {
        type: 'fatal',
        message: 'Sarvam realtime STT authentication, quota, or rate limit error',
        statusCode: 1003,
        retryable: false,
      },
    );
    expect(closeErrorFromSarvamRealtime({ code: 1013, reason: 'busy' })).toEqual(
      {
        type: 'fatal',
        message: 'Sarvam realtime STT backend temporarily unavailable',
        statusCode: 1013,
        retryable: true,
      },
    );
  });
});
