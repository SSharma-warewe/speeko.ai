import {
  isDeliveryMode,
  normalizeDeliveryMode,
  normalizeVoice,
  resolveVoiceRuntime,
} from '../voice-settings';

describe('voice-settings', () => {
  describe('normalizeVoice', () => {
    it('trims and keeps a named voice', () => {
      expect(normalizeVoice('  Ashley  ')).toBe('Ashley');
    });

    it('empty / whitespace / null → null', () => {
      expect(normalizeVoice('')).toBeNull();
      expect(normalizeVoice('   ')).toBeNull();
      expect(normalizeVoice(null)).toBeNull();
      expect(normalizeVoice(undefined)).toBeNull();
    });
  });

  describe('normalizeDeliveryMode', () => {
    it('accepts known modes case-insensitively', () => {
      expect(normalizeDeliveryMode('stable')).toBe('STABLE');
      expect(normalizeDeliveryMode('BALANCED')).toBe('BALANCED');
      expect(normalizeDeliveryMode(' Creative ')).toBe('CREATIVE');
    });

    it('unknown / empty → null', () => {
      expect(normalizeDeliveryMode('LOUD')).toBeNull();
      expect(normalizeDeliveryMode('')).toBeNull();
      expect(normalizeDeliveryMode(null)).toBeNull();
    });
  });

  describe('isDeliveryMode', () => {
    it('only STABLE BALANCED CREATIVE', () => {
      expect(isDeliveryMode('STABLE')).toBe(true);
      expect(isDeliveryMode('quiet')).toBe(false);
      expect(isDeliveryMode(null)).toBe(false);
    });
  });

  describe('resolveVoiceRuntime', () => {
    it('org wins; missing fields fall back to template', () => {
      expect(
        resolveVoiceRuntime(
          { voice: 'Olivia', speakingRate: null, deliveryMode: 'CREATIVE' },
          {
            voice: 'Ashley',
            model: 'google/gemma',
            temperature: 0.4,
            speakingRate: 1.1,
            deliveryMode: 'STABLE',
          },
        ),
      ).toEqual({
        voice: 'Olivia',
        model: 'google/gemma',
        temperature: 0.4,
        speakingRate: 1.1,
        deliveryMode: 'CREATIVE',
      });
    });

    it('all-null → nulls', () => {
      expect(resolveVoiceRuntime(null, null)).toEqual({
        voice: null,
        model: null,
        temperature: null,
        speakingRate: null,
        deliveryMode: null,
      });
    });
  });
});
