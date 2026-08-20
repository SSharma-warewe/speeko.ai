import type { AgentJobMetadata } from '../job-metadata';
import { buildOpeningInstructions } from '../builders/prompt-builder';
import { TaskRegistry } from '../tasks/registry';
import { TASK_KEYS } from '../tasks/task-ids';
import { buildInterviewBookingInstructions } from '../tasks/interview-booking.task';

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: TASK_KEYS.interviewBooking,
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall', 'checkGhlFreeSlots', 'scheduleGhlMeeting'],
    ...overrides,
  };
}

describe('interview_booking task', () => {
  it('is registered on TaskRegistry', () => {
    expect(TASK_KEYS.interviewBooking).toBe('interview_booking');
    expect(TaskRegistry.has('interview_booking')).toBe(true);
    expect(TaskRegistry.listKeys()).toContain('interview_booking');
  });

  it('confirms identity first then books with generic calendar tools', () => {
    const text = buildInterviewBookingInstructions(
      meta({
        context: { customerName: 'Ada Lovelace', email: 'ada@example.com' },
      }),
    );

    expect(text).toMatch(/expected contact name is Ada Lovelace/i);
    expect(text).toMatch(/PHASE 1 — IDENTITY/);
    expect(text).toMatch(/PHASE 2 — BOOK THE INTERVIEW/);
    expect(text).toMatch(/speaking with Ada Lovelace/);
    expect(text).toMatch(
      /After they confirm they are the right person[\s\S]*congratulate them briefly that they have been selected for the interview/,
    );
    expect(text).toMatch(/Do not congratulate before identity is confirmed/);
    expect(text).toMatch(/If it is the wrong person, do not congratulate/);
    expect(text).toMatch(/calendar availability and booking tools/i);
    expect(text).toMatch(/contact-create tool/i);
    expect(text).toMatch(/complete_interview_booking_task/);
    expect(text).toMatch(/Default interview length is 30 minutes/);
    expect(text).toMatch(/ada@example.com/);

    expect(text).not.toMatch(/check_ghl_free_slots/i);
    expect(text).not.toMatch(/schedule_ghl_meeting/i);
    expect(text).not.toMatch(/check_calendar_availability/i);
    expect(text).not.toMatch(/create_calendar_event/i);
    expect(text).not.toMatch(/checkGhlFreeSlots/);
    expect(text).not.toMatch(/createCalendarEvent/);
    expect(text).not.toMatch(/upsertGhlContact/);
    expect(text).not.toMatch(/upsert_ghl_contact/);
  });

  it('asks for a name when context has none', () => {
    const text = buildInterviewBookingInstructions(meta({ context: {} }));
    expect(text).toMatch(/No expected name was provided/i);
    expect(text).toMatch(/ask once for their name/i);
  });

  it('honors durationMinutes from context', () => {
    const text = buildInterviewBookingInstructions(
      meta({ context: { durationMinutes: 45 } }),
    );
    expect(text).toMatch(/Default interview length is 45 minutes/);
  });

  it('default opening confirms name before offering slots', () => {
    const opening = buildOpeningInstructions(
      meta({
        context: { customerName: 'Ada Lovelace' },
      }),
    );
    expect(opening).toMatch(/speaking with Ada Lovelace/);
    expect(opening).toMatch(/Do not offer interview slots/);
    expect(opening).not.toMatch(/congratulat/i);
    expect(opening).toMatch(/AUTHORITATIVE CLOCK/);
  });
});
