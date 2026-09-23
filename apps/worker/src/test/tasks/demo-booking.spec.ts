import type { AgentJobMetadata } from '../../session/job-metadata';
import { buildDemoBookingInstructions } from '../../tasks/demo-booking.task';

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
    enabledTools: [
      'endCall',
      'checkGhlFreeSlots',
      'scheduleGhlMeeting',
      'lookupGhlContact',
    ],
    ...overrides,
  };
}

describe('buildDemoBookingInstructions', () => {
  it('tells the model not to repeat cached fillers and to keep CRM silent', () => {
    const text = buildDemoBookingInstructions(
      meta({
        context: { customerName: 'Ada', email: 'ada@example.com' },
      }),
    );
    expect(text).toMatch(/contact name is Ada/);
    expect(text).toMatch(/CACHED SPEECH/);
    expect(text).toMatch(/Do not repeat/);
    expect(text).toMatch(/CRM lookup\/upsert runs in the background/);
    expect(text).toMatch(/Do not mention CRM/);
    expect(text).toMatch(/DECLINED/);
  });
});
