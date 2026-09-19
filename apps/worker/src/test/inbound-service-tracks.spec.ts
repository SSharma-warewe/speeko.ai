import { phrasesToWarm } from '../builders/agent-builder';
import {
  classifyInboundServiceTrack,
  inboundServiceTrackLine,
  inboundServiceTrackLines,
} from '../builders/inbound-service-tracks';
import type { AgentJobMetadata } from '../job-metadata';

describe('classifyInboundServiceTrack', () => {
  it('classifies buy / sell / list / rent', () => {
    expect(classifyInboundServiceTrack('बाय करनी है।')).toBe('buy');
    expect(classifyInboundServiceTrack('I want to buy')).toBe('buy');
    expect(classifyInboundServiceTrack('खरीदना है')).toBe('buy');
    expect(classifyInboundServiceTrack('सेल करनी है')).toBe('sell');
    expect(classifyInboundServiceTrack('बेचना है')).toBe('sell');
    expect(classifyInboundServiceTrack('sell the flat')).toBe('sell');
    expect(classifyInboundServiceTrack('प्रॉपर्टी लिस्ट करवानी है')).toBe('list');
    expect(classifyInboundServiceTrack('listing please')).toBe('list');
    expect(classifyInboundServiceTrack('रेंट देखनी है')).toBe('rent');
    expect(classifyInboundServiceTrack('किराया देखना है')).toBe('rent');
    expect(classifyInboundServiceTrack('rent in sector 42')).toBe('rent');
  });

  it('picks the earliest token in the utterance', () => {
    expect(classifyInboundServiceTrack('लिस्ट नहीं, बाय करनी है')).toBe('list');
    expect(classifyInboundServiceTrack('बाय, लिस्ट नहीं')).toBe('buy');
  });

  it('misses unclear or empty turns', () => {
    expect(classifyInboundServiceTrack('भाई')).toBeNull();
    expect(classifyInboundServiceTrack('पत्ती थी।')).toBeNull();
    expect(classifyInboundServiceTrack('listen')).toBeNull();
    expect(classifyInboundServiceTrack('buyer')).toBeNull();
    expect(classifyInboundServiceTrack('')).toBeNull();
    expect(classifyInboundServiceTrack(null)).toBeNull();
  });
});

describe('inboundServiceTrackLine', () => {
  it('uses the production buy line and parallel location asks', () => {
    expect(inboundServiceTrackLine('buy')).toBe(
      'गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?',
    );
    expect(inboundServiceTrackLine('rent')).toBe(
      inboundServiceTrackLine('buy'),
    );
    expect(inboundServiceTrackLine('sell')).toContain('सेक्टर');
    expect(inboundServiceTrackLine('list')).toContain('लिस्ट');
    expect(inboundServiceTrackLines()).toHaveLength(4);
  });
});

describe('phrasesToWarm', () => {
  it('warms inbound tracks plus ack and goodbye on pipeline', () => {
    const phrases = phrasesToWarm({
      agentKey: 'inbound',
      direction: 'inbound',
      task: 'general',
      prompt: {
        systemPrompt: 'हिंदी में बात करें।',
        onEnterInstructions: null,
        onExitInstructions: null,
      },
      enabledTools: ['endCall'],
    } as AgentJobMetadata);
    expect(phrases).toEqual(
      expect.arrayContaining([
        inboundServiceTrackLine('buy'),
        inboundServiceTrackLine('sell'),
        inboundServiceTrackLine('list'),
        'जी',
        'धन्यवाद, कॉल करने के लिए शुक्रिया।',
      ]),
    );
  });

  it('skips realtime', () => {
    expect(
      phrasesToWarm({
        agentKey: 'inbound',
        direction: 'inbound',
        task: 'general',
        model: 'xai/grok-voice-think-fast-2.0',
        prompt: {
          systemPrompt: 'You are a test agent.',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        enabledTools: ['endCall'],
      } as AgentJobMetadata),
    ).toEqual([]);
  });
});
