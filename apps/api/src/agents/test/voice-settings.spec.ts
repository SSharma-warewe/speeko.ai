import { BadRequestException } from '@nestjs/common';
import {
  applyVoicePatch,
  isDeliveryMode,
  normalizeDeliveryMode,
  normalizeVoice,
  parseStoredTtsModel,
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
            ttsModel: 'inworld/inworld-tts-2',
            temperature: 0.4,
            speakingRate: 1.1,
            deliveryMode: 'STABLE',
          },
        ),
      ).toEqual({
        voice: 'Olivia',
        model: 'google/gemma',
        ttsModel: 'inworld/inworld-tts-2',
        temperature: 0.4,
        speakingRate: 1.1,
        deliveryMode: 'CREATIVE',
      });
    });

    it('all-null → nulls', () => {
      expect(resolveVoiceRuntime(null, null)).toEqual({
        voice: null,
        model: null,
        ttsModel: null,
        temperature: null,
        speakingRate: null,
        deliveryMode: null,
      });
    });

    it('org ttsModel overrides template', () => {
      expect(
        resolveVoiceRuntime(
          { ttsModel: 'fishaudio/s2.1-pro-free' },
          { ttsModel: 'inworld/inworld-tts-2', voice: 'Ashley' },
        ).ttsModel,
      ).toBe('fishaudio/s2.1-pro-free');
    });
  });

  describe('parseStoredTtsModel', () => {
    it('empty → null; aliases normalize; unknown throws', () => {
      expect(parseStoredTtsModel(null)).toBeNull();
      expect(parseStoredTtsModel('  ')).toBeNull();
      expect(parseStoredTtsModel('fish-audio/s2.1-pro-free:free')).toBe(
        'fishaudio/s2.1-pro-free',
      );
      expect(parseStoredTtsModel('google/gemini-3.1-flash-tts-preview')).toBe(
        'google/gemini-3.1-flash-tts-preview',
      );
      expect(() => parseStoredTtsModel('not-a-tts')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('applyVoicePatch', () => {
    it('rejects a voice that is not on the selected TTS model', () => {
      const row: {
        voice: string | null;
        ttsModel: string | null;
      } = { voice: 'Ashley', ttsModel: null };
      expect(() =>
        applyVoicePatch(row, {
          ttsModel: 'google/gemini-3.1-flash-tts-preview',
          voice: 'Ashley',
        }),
      ).toThrow(BadRequestException);
    });

    it('accepts a matching Gemini voice', () => {
      const row: {
        voice: string | null;
        ttsModel: string | null;
      } = { voice: null, ttsModel: null };
      applyVoicePatch(row, {
        ttsModel: 'google/gemini-3.1-flash-tts-preview',
        voice: 'Kore',
      });
      expect(row.ttsModel).toBe('google/gemini-3.1-flash-tts-preview');
      expect(row.voice).toBe('Kore');
    });
  });
});
