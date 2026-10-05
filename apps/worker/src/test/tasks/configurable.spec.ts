import {
  VOICE_TASK_STARTERS,
  KNOWN_TASK_KEYS,
  isVoiceTaskSnapshot,
  voiceTaskDefinitionErrors,
  type VoiceTaskDefinition,
} from '@call-agent/contracts';
import {
  buildVoiceTaskSchema,
  configuredCompletionBlocker,
} from '../../tasks/configurable.task';
import { captureBookingReceipt } from '../../tools/booking-receipt';
import { callCalendarApi } from '../../tools/calendar-api-client';
import { JobMeta } from '../../session/job-metadata';
import { TaskRegistry } from '../../tasks/registry';
import { handleInboundServiceTrackTurn } from '../../tasks/workflow-task';
import { buildOpeningInstructions } from '../../builders/prompt-builder';
import type { SessionUserData } from '../../tools/types';
const snapshot = {
  schemaVersion: 1 as const,
  taskId: '58e8e268-373a-4c21-9371-70ad71d0112f',
  version: 1,
  definition: VOICE_TASK_STARTERS.general,
};
const state = (): SessionUserData => ({
  context: {},
  voiceTaskSnapshot: snapshot,
});
describe('configurable voice task runtime', () => {
  it('clears a dispatched snapshot when live metadata switches back to a legacy task', () => {
    const parser = new JobMeta();
    const old = parser.parseJobMetadata(JSON.stringify({ voiceTask: snapshot, context: { oldDefault: true } }));
    const live = parser.parseJobMetadata(JSON.stringify({ task: 'general' }));
    const merged = parser.mergeInboundJobMetadata(old, live);
    expect(merged.voiceTask).toBeUndefined();
    expect(merged.context).toBeUndefined();
    expect(() => TaskRegistry.create({ meta: { ...live, task: `custom_${snapshot.taskId}` }, userData: state(), tools: [], chatCtx: undefined } as never)).toThrow(/snapshot/);
  });
  it.each(KNOWN_TASK_KEYS)(
    'starter %s has a valid editable definition',
    (key) => {
      expect(voiceTaskDefinitionErrors(VOICE_TASK_STARTERS[key])).toEqual([]);
      expect(
        buildVoiceTaskSchema(VOICE_TASK_STARTERS[key]).safeParse({
          outcome: VOICE_TASK_STARTERS[key].outcomes[0].key,
        }).success,
      ).toBe(true);
    },
  );
  it('supports typed results and rejects wrong types, unknown fields and outcomes', () => {
    const d: VoiceTaskDefinition = {
      ...VOICE_TASK_STARTERS.general,
      resultFields: [
        { key: 'score', type: 'number', description: '' },
        { key: 'agreed', type: 'boolean', description: '' },
        {
          key: 'rating',
          type: 'enum',
          enumValues: ['high', 'low'],
          description: '',
        },
      ],
    };
    const schema = buildVoiceTaskSchema(d);
    expect(
      schema.safeParse({
        outcome: 'COMPLETED',
        score: 3,
        agreed: false,
        rating: 'high',
      }).success,
    ).toBe(true);
    for (const input of [
      { score: '3' },
      { agreed: 'false' },
      { rating: 'unknown' },
      { arbitrary: true },
      { outcome: 'INVALID' },
    ])
      expect(schema.safeParse({ outcome: 'COMPLETED', ...input }).success).toBe(
        false,
      );
  });
  it('rejects executable configuration, invalid references and unsupported versions', () => {
    expect(
      voiceTaskDefinitionErrors({ ...snapshot.definition, code: 'execute()' }),
    ).not.toEqual([]);
    expect(
      voiceTaskDefinitionErrors({
        ...snapshot.definition,
        outcomes: [
          {
            key: 'DONE',
            description: 'done',
            requiredFields: ['unknown'],
            checks: [],
          },
        ],
      }),
    ).not.toEqual([]);
    expect(isVoiceTaskSnapshot({ ...snapshot, schemaVersion: 2 })).toBe(false);
    expect(() =>
      new JobMeta().parseJobMetadata(
        JSON.stringify({ voiceTask: { ...snapshot, schemaVersion: 2 } }),
      ),
    ).toThrow(/snapshot/);
    expect(
      new JobMeta().parseJobMetadata(JSON.stringify({ voiceTask: snapshot }))
        .voiceTask,
    ).toEqual(snapshot);
  });
  it('requires outcome-specific fields and allows callback without success-path fields', () => {
    const d = VOICE_TASK_STARTERS.loan_collection;
    expect(
      configuredCompletionBlocker(d, { outcome: 'PROMISED' }, state(), 'yes'),
    ).toMatch(/promisedPayDate/);
    expect(
      configuredCompletionBlocker(
        d,
        {
          outcome: 'PROMISED',
          promisedPayDate: 'tomorrow',
          delayReason: 'late salary',
          helpRequested: 'none',
        },
        state(),
        'no further help',
      ),
    ).toBeNull();
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'CALLBACK' },
        state(),
        'call me tomorrow',
      ),
    ).toBeNull();
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'ALREADY_PAID' },
        state(),
        'hello',
      ),
    ).toBeTruthy();
  });
  it('rejects noise and false loan/property/attendance answers', () => {
    expect(
      configuredCompletionBlocker(
        VOICE_TASK_STARTERS.personal_loan_outreach,
        { outcome: 'INTERESTED' },
        state(),
        'hello',
      ),
    ).toBeTruthy();
    expect(
      configuredCompletionBlocker(
        VOICE_TASK_STARTERS.real_estate_outreach,
        { outcome: 'INTERESTED' },
        state(),
        '',
      ),
    ).toBeTruthy();
    expect(
      configuredCompletionBlocker(
        VOICE_TASK_STARTERS.real_estate_visit_confirmation,
        { outcome: 'CONFIRMED' },
        state(),
        'no',
      ),
    ).toBeTruthy();
  });
  it('requires real booking evidence and uses exact returned ids/timestamps', () => {
    const user = state();
    const d = VOICE_TASK_STARTERS.demo_booking;
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'BOOKED_ONLY', eventId: 'invented' },
        user,
        'yes',
      ),
    ).toBeTruthy();
    captureBookingReceipt(
      user,
      'booking',
      { ok: true, data: { eventId: 'stub' } },
      {},
    );
    captureBookingReceipt(
      user,
      'scheduleGhlMeeting',
      { ok: false, data: { appointmentId: 'failed' } },
      {},
    );
    expect(user.bookingReceipt).toBeUndefined();
    captureBookingReceipt(
      user,
      'scheduleGhlMeeting',
      {
        ok: true,
        data: {
          appointmentId: 'real',
          startIso: '2026-10-06T10:00:00+05:30',
          endIso: '2026-10-06T10:30:00+05:30',
        },
      },
      {},
    );
    expect(user.bookingReceipt?.scheduledStart).toBe(
      '2026-10-06T10:00:00+05:30',
    );
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'BOOKED_ONLY', eventId: 'invented' },
        user,
        'yes',
      ),
    ).toBeTruthy();
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'BOOKED_ONLY', eventId: 'real' },
        user,
        'yes',
      ),
    ).toBeNull();
    expect(
      configuredCompletionBlocker(
        d,
        { outcome: 'BOOKED_AND_QUALIFIED' },
        user,
        'yes',
      ),
    ).toMatch(/goals/);
  });
  it('configured inbound pipeline avoids the legacy property script and uses its task opening', async () => {
    const meta = new JobMeta().parseJobMetadata(
      JSON.stringify({
        direction: 'inbound',
        voiceTask: snapshot,
        prompt: { systemPrompt: 'Helpful assistant' },
      }),
    );
    const session = { say: jest.fn() };
    await handleInboundServiceTrackTurn({
      meta,
      userData: state(),
      session: session as never,
      userText: 'buy a property',
    });
    expect(session.say).not.toHaveBeenCalled();
    expect(buildOpeningInstructions(meta)).toContain(
      snapshot.definition.objective,
    );
    expect(
      buildOpeningInstructions({
        ...meta,
        prompt: { ...meta.prompt, onEnterInstructions: '' },
      }),
    ).toBeNull();
  });
});
describe('configured booking write safety', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.API_BASE_URL = 'http://127.0.0.1:3000';
    process.env.WORKER_CALLBACK_SECRET = 'test-only';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.API_BASE_URL;
    delete process.env.WORKER_CALLBACK_SECRET;
  });
  it('does not repeat a successful booking', async () => {
    const user = state();
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ ok: true, data: { eventId: 'real' } }),
      });
    const opts = { userData: user, toolId: 'createCalendarEvent' };
    await callCalendarApi('call', 'create-event', {}, opts);
    await callCalendarApi('call', 'create-event', {}, opts);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    'network_error',
    'nylas_error',
    'ghl_appointment_503',
    'ghl_appointment_missing_id',
  ])('never retries uncertain result %s', async (error) => {
    const user = state();
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: false, error }),
      });
    const opts = { userData: user, toolId: 'scheduleGhlMeeting' };
    await callCalendarApi('call', 'schedule', {}, opts);
    expect((await callCalendarApi('call', 'schedule', {}, opts)).error).toBe(
      'write_uncertain',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
