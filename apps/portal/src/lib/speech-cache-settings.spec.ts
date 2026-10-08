import { resolveTtsCacheEnabled } from '@call-agent/contracts';
import {
  speechCachePreference,
  speechCacheSelection,
} from './speech-cache-settings';

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
