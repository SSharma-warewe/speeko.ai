import {
  parsePricingPlan,
  resolveLlmRate,
  resolveSttRate,
  resolveTtsRate,
  resolveTransportRates,
} from '../price.catalog';

describe('price.catalog', () => {
  it('maps worker pins to Gemma / Nova-3 multilingual / Inworld TTS 2', () => {
    const llm = resolveLlmRate('google/gemma-4-31b-it', 'ship');
    expect(llm?.key).toBe('gemma-4-31b');
    expect(llm?.input).toBe(0.4);
    expect(llm?.cached).toBe(0.2);
    expect(llm?.output).toBe(1.2);

    const stt = resolveSttRate('deepgram/nova-3', 'ship');
    expect(stt?.key).toBe('deepgram-nova-3-multilingual');
    expect(stt?.usdPerMinute).toBe(0.0058);

    const tts = resolveTtsRate('inworld/inworld-tts-2', 'ship');
    expect(tts?.key).toBe('inworld-tts-2');
    expect(tts?.usdPerMillionChars).toBe(25);
  });

  it('scale discounts STT/TTS/SIP/WebRTC, not Gemma', () => {
    expect(resolveSttRate('nova-3', 'scale')?.usdPerMinute).toBe(0.005);
    expect(resolveTtsRate('inworld-tts-2', 'scale')?.usdPerMillionChars).toBe(
      15,
    );
    expect(resolveTransportRates('scale').sipUsdPerMinute).toBe(0.003);
    expect(resolveTransportRates('scale').webrtcUsdPerMinute).toBe(0.0004);
    expect(resolveLlmRate('gemma-4-31b-it', 'scale')?.input).toBe(0.4);
  });

  it('parsePricingPlan defaults to ship', () => {
    expect(parsePricingPlan(undefined)).toBe('ship');
    expect(parsePricingPlan('SCALE')).toBe('scale');
    expect(parsePricingPlan('nope')).toBe('ship');
  });
});
