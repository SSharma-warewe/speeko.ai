import { phrasesToWarm, warmTtsBeforeStart } from '../../builders/agent-builder';
import { clearTtsCache } from '../../speech/tts-cache';
import {
  classifyInboundBhkBudget,
  classifyInboundLocation,
  classifyInboundServiceTrack,
  classifyInboundTiming,
  inboundScriptCacheLines,
  inboundServiceTrackLine,
  inboundServiceTrackLines,
  INBOUND_BHK_BUDGET_LINE,
  INBOUND_BUDGET_ONLY_LINE,
  INBOUND_LOCATION_CLARIFY_LINE,
  INBOUND_TIMING_CLARIFY_LINE,
  INBOUND_TIMING_LINE,
} from '../../tasks/inbound-service-tracks';
import type { AgentJobMetadata } from '../../session/job-metadata';

describe('classifyInboundServiceTrack', () => {
  it('classifies buy / sell / list / rent', () => {
    expect(classifyInboundServiceTrack('बाय करनी है।')).toBe('buy');
    expect(classifyInboundServiceTrack('मैं कोई बाए करनी है।')).toBe('buy');
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

describe('classifyInboundLocation', () => {
  it('treats any sector 1–88 as the sector keyword', () => {
    expect(classifyInboundLocation('Sector 42')).toBe('sector');
    expect(classifyInboundLocation('सेक्टर 7')).toBe('sector');
    expect(classifyInboundLocation('Hector 65')).toBe('sector');
    expect(classifyInboundLocation('88')).toBe('sector');
    expect(classifyInboundLocation('1')).toBe('sector');
  });

  it('rejects 0 and 89+', () => {
    expect(classifyInboundLocation('0')).toBeNull();
    expect(classifyInboundLocation('89')).toBeNull();
    expect(classifyInboundLocation('sector 89')).toBeNull();
    expect(classifyInboundLocation('पत्ती थी।')).toBeNull();
  });

  it('classifies locality and anywhere', () => {
    expect(classifyInboundLocation('golf course')).toBe('locality');
    expect(classifyInboundLocation('DLF phase 2')).toBe('locality');
    expect(classifyInboundLocation('कहीं भी')).toBe('anywhere');
  });
});

describe('classifyInboundTiming', () => {
  it('classifies this week / this month / later', () => {
    expect(classifyInboundTiming('इस हफ्ते।')).toBe('this_week');
    expect(classifyInboundTiming('आज')).toBe('this_week');
    expect(classifyInboundTiming('this month')).toBe('this_month');
    expect(classifyInboundTiming('बाद में।')).toBe('later');
    expect(classifyInboundTiming('भाई')).toBeNull();
  });

  it('treats Sarvam हफ्ते near-misses as this week', () => {
    expect(classifyInboundTiming('इस वास्ते।')).toBe('this_week');
    expect(classifyInboundTiming('इस हस्ते')).toBe('this_week');
    expect(classifyInboundTiming('इस हफ्ता')).toBe('this_week');
    expect(classifyInboundTiming('अभी')).toBe('this_week');
    expect(classifyInboundTiming('इस महीने।')).toBe('this_month');
    expect(classifyInboundTiming('इस सब के इस सब के।')).toBeNull();
    expect(classifyInboundTiming('ते।')).toBeNull();
  });
});

describe('classifyInboundBhkBudget', () => {
  it('splits BHK-only from budget, both, and refuse', () => {
    expect(classifyInboundBhkBudget('2 BHK')).toBe('bhk');
    expect(classifyInboundBhkBudget('1 मिलियन।')).toBe('budget');
    expect(classifyInboundBhkBudget('3 BHK 2 crore')).toBe('both');
    expect(classifyInboundBhkBudget('नहीं बताना चाहता हूँ।')).toBe('refuse');
    expect(classifyInboundBhkBudget('ओके।')).toBeNull();
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
    expect(inboundScriptCacheLines()).toEqual(
      expect.arrayContaining([
        INBOUND_TIMING_LINE,
        INBOUND_TIMING_CLARIFY_LINE,
        INBOUND_BHK_BUDGET_LINE,
        INBOUND_LOCATION_CLARIFY_LINE,
      ]),
    );
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
        INBOUND_TIMING_LINE,
        INBOUND_TIMING_CLARIFY_LINE,
        INBOUND_BHK_BUDGET_LINE,
        INBOUND_LOCATION_CLARIFY_LINE,
        INBOUND_BUDGET_ONLY_LINE,
        'जी',
        'धन्यवाद, कॉल करने के लिए शुक्रिया।',
      ]),
    );
  });

  it('warmTtsBeforeStart synthesizes the phrase list', async () => {
    clearTtsCache();
    const synthesize = jest.fn(async function* (text: string) {
      yield { frame: { id: text } };
    });
    await warmTtsBeforeStart(
      {
        agentKey: 'inbound',
        direction: 'inbound',
        task: 'general',
        prompt: {
          systemPrompt: 'हिंदी में बात करें।',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        enabledTools: ['endCall'],
      } as AgentJobMetadata,
      { synthesize },
    );
    expect(synthesize).toHaveBeenCalled();
    expect(synthesize.mock.calls.some(([text]) => text === 'जी')).toBe(true);
  });

  it('warmTtsBeforeStart is a no-op on realtime', async () => {
    const synthesize = jest.fn();
    await warmTtsBeforeStart(
      {
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
      } as AgentJobMetadata,
      { synthesize },
    );
    expect(synthesize).not.toHaveBeenCalled();
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

  it('skips Sarvam Bulbul realtime TTS', () => {
    expect(
      phrasesToWarm({
        agentKey: 'inbound',
        direction: 'inbound',
        task: 'general',
        ttsModel: 'sarvam/bulbul-v3-realtime',
        prompt: {
          systemPrompt: 'हिंदी में बात करें।',
          onEnterInstructions: null,
          onExitInstructions: null,
        },
        enabledTools: ['endCall'],
      } as AgentJobMetadata),
    ).toEqual([]);
  });
});
