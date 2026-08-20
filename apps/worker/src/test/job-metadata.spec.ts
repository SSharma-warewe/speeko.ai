import { parseJobMetadata } from '../job-metadata';

describe('parseJobMetadata voice extras', () => {
  it('empty raw → null speakingRate / deliveryMode', () => {
    const meta = parseJobMetadata('');
    expect(meta.speakingRate).toBeNull();
    expect(meta.deliveryMode).toBeNull();
    expect(meta.voice).toBeNull();
    expect(meta.temperature).toBeNull();
  });

  it('parses speakingRate and known deliveryMode', () => {
    const meta = parseJobMetadata(
      JSON.stringify({
        agentKey: 'outbound',
        direction: 'outbound',
        task: 'general',
        prompt: { systemPrompt: 'Hi' },
        enabledTools: ['endCall'],
        voice: 'Olivia',
        temperature: 0.6,
        speakingRate: 1.25,
        deliveryMode: 'CREATIVE',
      }),
    );
    expect(meta.voice).toBe('Olivia');
    expect(meta.temperature).toBe(0.6);
    expect(meta.speakingRate).toBe(1.25);
    expect(meta.deliveryMode).toBe('CREATIVE');
  });

  it('unknown deliveryMode and non-number speakingRate → null', () => {
    const meta = parseJobMetadata(
      JSON.stringify({
        agentKey: 'inbound',
        prompt: { systemPrompt: 'Hi' },
        speakingRate: 'fast',
        deliveryMode: 'LOUD',
      }),
    );
    expect(meta.speakingRate).toBeNull();
    expect(meta.deliveryMode).toBeNull();
  });
});
