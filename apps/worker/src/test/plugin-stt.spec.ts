import { stt } from '@livekit/agents';
import {
  applyPluginSttWireEvent,
  createPluginSttReorderState,
} from '../sarvam/plugin-stt-events';
import {
  SarvamPluginSTT,
  buildSarvamPluginSttWsUrl,
  resolveSarvamRealtimePluginUrl,
} from '../sarvam/plugin-stt';

function typesOf(payloads: unknown[]) {
  const state = createPluginSttReorderState('hi-IN');
  const types: stt.SpeechEventType[] = [];
  for (const payload of payloads) {
    const action = applyPluginSttWireEvent(state, payload);
    if (action.type === 'emit') {
      for (const event of action.events) types.push(event.type);
    }
  }
  return { state, types };
}

describe('Sarvam Python plugin STT client', () => {
  it('reads the sidecar URL from env and leaves homemade as the unset path', () => {
    expect(resolveSarvamRealtimePluginUrl({})).toBeNull();
    expect(resolveSarvamRealtimePluginUrl({ SARVAM_STT_PLUGIN_URL: '  ' })).toBeNull();
    expect(
      resolveSarvamRealtimePluginUrl({
        SARVAM_STT_PLUGIN_URL: 'ws://127.0.0.1:8091/stt',
      }),
    ).toBe('ws://127.0.0.1:8091/stt');
  });

  it('pins stream_type=fast, SIP VAD, and maps unknown language to auto', () => {
    const url = buildSarvamPluginSttWsUrl({
      url: 'ws://127.0.0.1:8091/stt',
      language: 'unknown',
    });
    expect(url).toContain('language=auto');
    expect(url).toContain('stream_type=fast');
    expect(url).toContain('vad_min_silence_ms=500');
    expect(url).toContain('vad_min_speech_ms=200');
    expect(url).toContain('vad_sot_threshold=0.7');
  });

  it('emits EOS before FINAL when an interim already has text', () => {
    const { types } = typesOf([
      { type: 'start', requestId: 'r1' },
      { type: 'interim', text: 'haan', language: 'hi-IN' },
      { type: 'end', requestId: 'r1' },
      { type: 'final', text: 'Haan.', language: 'hi-IN', requestId: 'r1' },
    ]);
    expect(types).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.INTERIM_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
    ]);
  });

  it('holds empty EOS until FINAL when there was no interim text', () => {
    const { types } = typesOf([
      { type: 'start', requestId: 'r1' },
      { type: 'end', requestId: 'r1' },
      { type: 'final', text: 'Haan.', language: 'hi-IN', requestId: 'r1' },
    ]);
    expect(types).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
    ]);
  });

  it('passes FINAL then EOS through when the plugin already used that order', () => {
    const { types } = typesOf([
      { type: 'start' },
      { type: 'final', text: 'Hello.' },
      { type: 'end' },
    ]);
    expect(types).toEqual([
      stt.SpeechEventType.START_OF_SPEECH,
      stt.SpeechEventType.FINAL_TRANSCRIPT,
      stt.SpeechEventType.END_OF_SPEECH,
    ]);
  });

  it('surfaces plugin errors as fatal', () => {
    const state = createPluginSttReorderState('en-IN');
    expect(
      applyPluginSttWireEvent(state, {
        type: 'error',
        message: 'quota',
        retryable: false,
      }),
    ).toEqual({
      type: 'fatal',
      message: 'quota',
      retryable: false,
    });
  });

  it('labels the STT as the Python plugin', () => {
    const plugin = new SarvamPluginSTT({
      url: 'ws://127.0.0.1:8091/stt',
      language: 'auto',
    });
    expect(plugin.label).toBe('sarvam.STTRealtime.python');
    expect(plugin.model).toBe('saaras:v3-realtime');
  });
});
