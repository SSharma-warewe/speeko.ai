import { BadRequestException } from '@nestjs/common';
import {
  applyVoicePatch,
  isDeliveryMode,
  normalizeDeliveryMode,
  normalizeVoice,
  parseStoredLlmModel,
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

    it('realtime model drops pipeline TTS even if template still has Inworld', () => {
      expect(
        resolveVoiceRuntime(
          {
            model: 'openai/gpt-realtime-2.1-mini',
            ttsModel: null,
            voice: 'marin',
          },
          { ttsModel: 'inworld/inworld-tts-2', voice: 'Ashley' },
        ),
      ).toMatchObject({
        model: 'openai/gpt-realtime-2.1-mini',
        ttsModel: null,
        voice: 'marin',
        speakingRate: null,
        deliveryMode: null,
      });
    });
  });

  describe('parseStoredLlmModel', () => {
    it('empty / Gemma → null; aliases normalize; unknown throws', () => {
      expect(parseStoredLlmModel(null)).toBeNull();
      expect(parseStoredLlmModel('  ')).toBeNull();
      expect(parseStoredLlmModel('google/gemma-4-31b-it')).toBeNull();
      expect(parseStoredLlmModel('gpt-4.1-mini')).toBe('openai/gpt-4.1-mini');
      expect(parseStoredLlmModel('grok-voice-latest')).toBe(
        'xai/grok-voice-think-fast-2.0',
      );
      expect(() => parseStoredLlmModel('not-an-llm')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('parseStoredTtsModel', () => {
    it('empty → null; aliases normalize; unknown throws', () => {
      expect(parseStoredTtsModel(null)).toBeNull();
      expect(parseStoredTtsModel('  ')).toBeNull();
      expect(parseStoredTtsModel('fish-audio/s2.1-pro-free:free')).toBe(
        'fishaudio/s2.1-pro-free',
      );
      expect(() =>
        parseStoredTtsModel('google/gemini-3.1-flash-tts-preview'),
      ).toThrow(BadRequestException);
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
          ttsModel: 'fishaudio/s2.1-pro-free',
          voice: 'Ashley',
        }),
      ).toThrow(BadRequestException);
    });

    it('accepts a matching Fish voice', () => {
      const row: {
        voice: string | null;
        ttsModel: string | null;
      } = { voice: null, ttsModel: null };
      applyVoicePatch(row, {
        ttsModel: 'fishaudio/s2.1-pro-free',
        voice: '933563129e564b19a115bedd57b7406a',
      });
      expect(row.ttsModel).toBe('fishaudio/s2.1-pro-free');
      expect(row.voice).toBe('933563129e564b19a115bedd57b7406a');
    });

    it('realtime model rejects a pipeline TTS voice', () => {
      const row: {
        voice: string | null;
        model: string | null;
        ttsModel: string | null;
      } = { voice: 'Ashley', model: null, ttsModel: null };
      expect(() =>
        applyVoicePatch(row, {
          model: 'openai/gpt-realtime-2.1-mini',
          voice: 'Ashley',
        }),
      ).toThrow(BadRequestException);
    });

    it('accepts a matching realtime voice', () => {
      const row: {
        voice: string | null;
        model: string | null;
        ttsModel: string | null;
      } = { voice: null, model: null, ttsModel: null };
      applyVoicePatch(row, {
        model: 'openai/gpt-realtime-2.1-mini',
        voice: 'marin',
      });
      expect(row.model).toBe('openai/gpt-realtime-2.1-mini');
      expect(row.voice).toBe('marin');
    });

    it('realtime model clears leftover pipeline TTS without a ttsModel patch', () => {
      const row: {
        voice: string | null;
        model: string | null;
        ttsModel: string | null;
        speakingRate: number | null;
        deliveryMode: string | null;
      } = {
        voice: 'marin',
        model: null,
        ttsModel: 'fishaudio/s2.1-pro-free',
        speakingRate: 1.1,
        deliveryMode: 'CREATIVE',
      };
      applyVoicePatch(row, {
        model: 'openai/gpt-realtime-2.1-mini',
        voice: 'marin',
      });
      expect(row.model).toBe('openai/gpt-realtime-2.1-mini');
      expect(row.ttsModel).toBeNull();
      expect(row.speakingRate).toBeNull();
      expect(row.deliveryMode).toBeNull();
    });
  });
});
