import {
  resolveTtsCacheEnabled,
  resolveTtsPreparedSpeechEnabled,
} from '@call-agent/contracts';
import {
  openingSpeechHint,
  speechCachePreference,
  speechCacheSelection,
} from './speech-cache-settings';

describe('opening editor behavior', () => {
  it('explains exact text using the effective inherited preparation setting', () => {
    expect(openingSpeechHint(null, true)).toContain('plays verbatim');
    expect(openingSpeechHint(true, false)).toContain('plays verbatim');
    expect(openingSpeechHint(false, true)).toContain('model to generate');
    expect(openingSpeechHint(null, false)).toContain('model to generate');
  });
  it('retains generated guidance for native realtime despite a saved On preference', () => {
    expect(openingSpeechHint(true, true, 'openai/gpt-realtime-2.1-mini')).toContain('model to generate');
    expect(openingSpeechHint(true, true, 'xai/grok-voice-think-fast-2.0')).toContain('model to generate');
  });
});

describe('speech-cache editor state and save payload', () => {
  it.each([true, false, null])(
    'round trips %s through a selection without flattening inheritance',
    (saved) => {
      const payload = {
        ttsCacheEnabled: speechCachePreference(speechCacheSelection(saved)),
      };
      expect(JSON.parse(JSON.stringify(payload))).toEqual({
        ttsCacheEnabled: saved,
      });
    },
  );
  it('previews template changes without changing the raw selection', () => {
    const preference = speechCachePreference('default');
    expect(resolveTtsCacheEnabled(preference, true)).toBe(true);
    expect(resolveTtsCacheEnabled(preference, false)).toBe(false);
    expect(preference).toBeNull();
    expect(resolveTtsCacheEnabled(speechCachePreference('off'), true)).toBe(
      false,
    );
  });
  it('preserves On through native realtime and re-enables pipeline including Bulbul realtime', () => {
    const preference = speechCachePreference('on');
    expect(
      resolveTtsCacheEnabled(
        preference,
        false,
        'xai/grok-voice-think-fast-2.0',
      ),
    ).toBe(false);
    expect(speechCacheSelection(preference)).toBe('on');
    expect(resolveTtsCacheEnabled(preference, false, null)).toBe(true);
  });
});

describe('prepared-sentence editor preference', () => {
  it.each([true, false, null])(
    'round trips %s independently of speech caching',
    (saved) => {
      const payload = {
        ttsCacheEnabled: false,
        ttsPreparedSpeechEnabled: speechCachePreference(
          speechCacheSelection(saved),
        ),
      };
      expect(payload).toEqual({
        ttsCacheEnabled: false,
        ttsPreparedSpeechEnabled: saved,
      });
      expect(resolveTtsPreparedSpeechEnabled(saved, true)).toBe(saved ?? true);
      expect(
        resolveTtsPreparedSpeechEnabled(saved, true, 'openai/gpt-realtime-2.1'),
      ).toBe(false);
    },
  );
});
