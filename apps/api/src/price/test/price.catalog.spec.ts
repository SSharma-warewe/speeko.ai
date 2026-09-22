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

  it('maps GPT-5.6 Luna Fast at 2× Luna list rates', () => {
    const luna = resolveLlmRate('openai/gpt-5.6-luna', 'ship');
    expect(luna?.key).toBe('gpt-5.6-luna');
    expect(luna?.input).toBe(0.2);
    expect(luna?.output).toBe(1.2);

    const fast = resolveLlmRate('openai/gpt-5.6-luna-fast', 'ship');
    expect(fast?.key).toBe('gpt-5.6-luna-fast');
    expect(fast?.input).toBe(0.4);
    expect(fast?.cached).toBe(0.04);
    expect(fast?.output).toBe(2.4);
  });

  it('maps Sarvam Saaras and Bulbul, including plugin colon ids', () => {
    const stt = resolveSttRate('Sarvam/saaras:v3', 'ship');
    expect(stt?.key).toBe('sarvam-saaras-v3');
    expect(stt?.usdPerMinute).toBe(0.005218);
    expect(resolveSttRate('sarvam/saaras-v3', 'scale')?.usdPerMinute).toBe(
      0.005218,
    );

    const realtime = resolveSttRate('saaras:v3-realtime', 'ship');
    expect(realtime?.key).toBe('sarvam-saaras-v3-realtime');
    expect(realtime?.usdPerMinute).toBe(0.005218);

    const tts = resolveTtsRate('sarvam/bulbul:v3', 'ship');
    expect(tts?.key).toBe('sarvam-bulbul-v3');
    expect(tts?.usdPerMillionChars).toBe(31.308704);
    expect(resolveTtsRate('bulbul-v3', 'scale')?.usdPerMillionChars).toBe(
      31.308704,
    );
  });

  it('parsePricingPlan defaults to ship', () => {
    expect(parsePricingPlan(undefined)).toBe('ship');
    expect(parsePricingPlan('SCALE')).toBe('scale');
    expect(parsePricingPlan('nope')).toBe('ship');
  });
});
