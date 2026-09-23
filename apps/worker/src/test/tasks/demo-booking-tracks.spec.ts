import { phrasesToWarm } from '../../builders/agent-builder';
import type { AgentJobMetadata } from '../../session/job-metadata';
import {
  classifyDemoGoodTime,
  DEMO_ASK_WHEN_LINE_EN,
  DEMO_ASK_WHEN_LINE_HI,
  DEMO_BOOK_LINE_EN,
  DEMO_CALLBACK_LINE_EN,
  DEMO_CHECK_LINE_EN,
  demoAskWhenLine,
  demoBookingCacheLines,
  demoBookLine,
  demoCheckLine,
  isOutboundDemoBooking,
  isOutboundDemoPipeline,
} from '../../tasks/demo-booking-tracks';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'demo_booking',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall', 'checkGhlFreeSlots', 'scheduleGhlMeeting'],
    ...overrides,
  };
}

describe('classifyDemoGoodTime', () => {
  it('classifies yes / callback / declined', () => {
    expect(classifyDemoGoodTime('Yes.')).toBe('yes');
    expect(classifyDemoGoodTime('हाँ')).toBe('yes');
    expect(classifyDemoGoodTime('yeah')).toBe('yes');
    expect(classifyDemoGoodTime('I am busy')).toBe('callback');
    expect(classifyDemoGoodTime('call me later')).toBe('callback');
    expect(classifyDemoGoodTime('अभी व्यस्त हूँ')).toBe('callback');
    expect(classifyDemoGoodTime('No.')).toBe('callback');
    expect(classifyDemoGoodTime('not interested')).toBe('declined');
    expect(classifyDemoGoodTime('नहीं चाहिए')).toBe('declined');
  });

  it('treats Hindi ASR No as yes when opted in', () => {
    expect(classifyDemoGoodTime('No.', { hindiHanHomophone: true })).toBe(
      'yes',
    );
    expect(classifyDemoGoodTime('No.')).toBe('callback');
  });

  it('leaves datetimes and filler to the LLM', () => {
    expect(classifyDemoGoodTime('tomorrow at 3')).toBeNull();
    expect(classifyDemoGoodTime('Thursday afternoon')).toBeNull();
    expect(classifyDemoGoodTime('Hello.')).toBeNull();
    expect(classifyDemoGoodTime('')).toBeNull();
    expect(classifyDemoGoodTime(null)).toBeNull();
  });
});

describe('demo booking cache lines', () => {
  it('uses English or Hindi from the persona', () => {
    expect(demoCheckLine(meta())).toBe(DEMO_CHECK_LINE_EN);
    expect(demoBookLine(meta())).toBe(DEMO_BOOK_LINE_EN);
    expect(demoAskWhenLine(meta())).toBe(DEMO_ASK_WHEN_LINE_EN);
    expect(
      demoAskWhenLine(
        meta({
          prompt: {
            systemPrompt: 'हिंदी में बात करें।',
            onEnterInstructions: null,
            onExitInstructions: null,
          },
        }),
      ),
    ).toBe(DEMO_ASK_WHEN_LINE_HI);
    expect(demoBookingCacheLines(meta())).toEqual(
      expect.arrayContaining([
        DEMO_CHECK_LINE_EN,
        DEMO_BOOK_LINE_EN,
        DEMO_ASK_WHEN_LINE_EN,
        DEMO_CALLBACK_LINE_EN,
      ]),
    );
  });

  it('is outbound demo only on pipeline', () => {
    expect(isOutboundDemoBooking(meta())).toBe(true);
    expect(isOutboundDemoPipeline(meta())).toBe(true);
    expect(
      isOutboundDemoPipeline(
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      ),
    ).toBe(false);
    expect(
      isOutboundDemoBooking(meta({ direction: 'inbound' })),
    ).toBe(false);
    expect(isOutboundDemoBooking(meta({ task: 'general' }))).toBe(false);
  });
});

describe('phrasesToWarm outbound demo', () => {
  it('warms demo fillers plus goodbye on pipeline', () => {
    const phrases = phrasesToWarm(meta());
    expect(phrases).toEqual(
      expect.arrayContaining([
        DEMO_CHECK_LINE_EN,
        DEMO_BOOK_LINE_EN,
        DEMO_ASK_WHEN_LINE_EN,
        DEMO_CALLBACK_LINE_EN,
        'Thanks for your time. Goodbye.',
      ]),
    );
    expect(phrases).not.toEqual(
      expect.arrayContaining(['गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?']),
    );
  });

  it('skips demo phrases on realtime', () => {
    expect(
      phrasesToWarm(meta({ model: 'xai/grok-voice-think-fast-2.0' })),
    ).toEqual([]);
  });
});
