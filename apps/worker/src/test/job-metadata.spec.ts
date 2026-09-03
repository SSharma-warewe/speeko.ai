import { mergeInboundJobMetadata, parseJobMetadata } from '../job-metadata';

describe('parseJobMetadata voice extras', () => {
  it('empty raw → null speakingRate / deliveryMode', () => {
    const meta = parseJobMetadata('');
    expect(meta.speakingRate).toBeNull();
    expect(meta.deliveryMode).toBeNull();
    expect(meta.voice).toBeNull();
    expect(meta.temperature).toBeNull();
  });

  it('parses organizationAgentId from dispatch JSON', () => {
    const meta = parseJobMetadata(
      JSON.stringify({
        organizationId: 'org-1',
        organizationAgentId: 'oa-9',
        agentKey: 'inbound',
        direction: 'inbound',
        task: 'general',
        prompt: { systemPrompt: 'Hi' },
        enabledTools: ['endCall'],
      }),
    );
    expect(meta.organizationId).toBe('org-1');
    expect(meta.organizationAgentId).toBe('oa-9');
    expect(meta.callId).toBeUndefined();
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

  it('parses ttsModel', () => {
    const meta = parseJobMetadata(
      JSON.stringify({
        agentKey: 'outbound',
        direction: 'outbound',
        task: 'general',
        prompt: { systemPrompt: 'Hi' },
        enabledTools: ['endCall'],
        ttsModel: 'fishaudio/s2.1-pro-free',
        voice: '933563129e564b19a115bedd57b7406a',
      }),
    );
    expect(meta.ttsModel).toBe('fishaudio/s2.1-pro-free');
    expect(meta.voice).toBe('933563129e564b19a115bedd57b7406a');
  });

  it('empty raw → null ttsModel', () => {
    expect(parseJobMetadata('').ttsModel).toBeNull();
  });

  it('mergeInboundJobMetadata overlays live voice/model and keeps ring fields', () => {
    const dispatched = parseJobMetadata(
      JSON.stringify({
        organizationId: 'org-1',
        organizationAgentId: 'oa-1',
        agentKey: 'inbound',
        direction: 'inbound',
        medium: 'sip',
        task: 'general',
        prompt: { systemPrompt: 'old' },
        enabledTools: ['endCall'],
        participantIdentity: '+1555',
        model: null,
        ttsModel: null,
      }),
    );
    const live = parseJobMetadata(
      JSON.stringify({
        organizationId: 'org-1',
        organizationAgentId: 'oa-1',
        agentKey: 'inbound',
        direction: 'inbound',
        medium: 'sip',
        task: 'general',
        prompt: { systemPrompt: 'new' },
        enabledTools: ['endCall'],
        model: 'openai/gpt-realtime-2.1-mini',
        ttsModel: null,
        voice: 'marin',
      }),
    );
    const merged = mergeInboundJobMetadata(dispatched, live);
    expect(merged.model).toBe('openai/gpt-realtime-2.1-mini');
    expect(merged.voice).toBe('marin');
    expect(merged.prompt.systemPrompt).toBe('new');
    expect(merged.participantIdentity).toBe('+1555');
    expect(merged.callId).toBeUndefined();
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
