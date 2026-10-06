import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseLlm } from '@google/adk';
import { runTurn } from '../../../dist/apps/whatsapp-worker/runner.js';
import { WHATSAPP_TASK_STARTERS } from '@call-agent/contracts';
import { HarnessApiClient } from '../../../dist/apps/whatsapp-worker/api-client.js';
import { turnSchema } from '../../../dist/apps/whatsapp-worker/turn-schema.js';

const fixture = (booking = false) => {
  const definition = booking
    ? structuredClone(WHATSAPP_TASK_STARTERS.appointment_booking)
    : {
        name: 'Qualification',
        description: '',
        objective: 'Collect interest',
        phases: [
          {
            title: 'Ask',
            instructions: 'Ask about interest',
            fieldKeys: ['interest'],
            toolIds: [],
          },
        ],
        contextFields: [],
        resultFields: [
          {
            key: 'interest',
            description: 'Customer interest',
            type: 'boolean',
            required: true,
          },
        ],
        outcomes: [
          {
            key: 'qualified',
            description: 'Interest recorded',
            requiredFields: ['interest'],
            checks: ['usable_customer_message'],
            terminalStatus: 'completed',
          },
        ],
        toolIds: [],
      };
  return {
    id: 'a4a63a07-dc69-4b97-a576-159655fae0ad',
    conversationId: 'a4a63a07-dc69-4b97-a576-159655fae0ab',
    generation: 1,
    leaseToken: 'a4a63a07-dc69-4b97-a576-159655fae0ac',
    sender: '10000000000',
    body: 'Yes, I am interested',
    prompt: 'You are Example’s helpful assistant.',
    enabledTools: definition.toolIds,
    session: { state: {}, events: [] },
    checkpoint: null,
    taskProtocolVersion: 2,
    task: {
      sessionId: 'a4a63a07-dc69-4b97-a576-159655fae0ae',
      key: 'configured',
      version: 1,
      objective: definition.objective,
      completionRule: 'configured',
      status: 'active',
      result: null,
      context: { company: 'Example' },
      snapshot: {
        schemaVersion: 1,
        taskId: 'a4a63a07-dc69-4b97-a576-159655fae0af',
        version: 1,
        definition,
      },
    },
  };
};
class ScriptModel extends BaseLlm {
  requests = [];
  index = 0;
  constructor(parts) {
    super({ model: 'configured-test' });
    this.parts = parts;
  }
  async *generateContentAsync(request) {
    this.requests.push(request);
    const parts = this.parts[this.index++];
    if (!parts) throw new Error('Unexpected additional model request');
    yield { content: { role: 'model', parts } };
  }
}
const call = (name, args) => [{ functionCall: { id: name, name, args } }];
test('configured tasks use dynamic fields, preserve persona and complete only after API acceptance', async () => {
  const model = new ScriptModel([
    call('complete_whatsapp_task', {
      outcome: 'qualified',
      fields: { interest: true },
    }),
  ]);
  const actions = [];
  const result = await runTurn(
    fixture(),
    {
      post: async (_turn, action, data) => {
        actions.push({ action, data });
        return action === 'validate-completion' ? { ok: true } : {};
      },
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.equal(result.completion.fields.interest, true);
  assert.match(result.reply, /session has ended/);
  assert.ok(actions.some((c) => c.action === 'validate-completion'));
  const instructions = JSON.stringify(model.requests[0]);
  assert.match(instructions, /Example/);
  assert.match(instructions, /Collect interest/);
  assert.match(instructions, /complete_whatsapp_task/);
  assert.doesNotMatch(instructions, /Success requires the scheduleGhlMeeting/);
});
test('rejected completion allows the model to ask for missing information', async () => {
  const model = new ScriptModel([
    call('complete_whatsapp_task', { outcome: 'qualified', fields: {} }),
    [{ text: 'Are you interested?' }],
  ]);
  const result = await runTurn(
    fixture(),
    {
      post: async (_turn, action) =>
        action === 'validate-completion'
          ? { ok: false, error: 'Collect interest before completing' }
          : {},
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.equal(result.reply, 'Are you interested?');
  assert.equal(result.completion, undefined);
  assert.equal(model.index, 2);
});
test('booking receipt does not close a configured workflow before remaining answers', async () => {
  const model = new ScriptModel([
    call('scheduleGhlMeeting', { startTime: '2030-01-01T10:00:00Z' }),
    [{ text: 'Booked. Is there anything the team should prepare?' }],
  ]);
  const result = await runTurn(
    fixture(true),
    {
      post: async (_turn, action) =>
        action === 'tools'
          ? {
              ok: true,
              appointmentId: 'receipt',
              startTime: '2030-01-01T10:00:00Z',
            }
          : {},
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.equal(result.completion, undefined);
  assert.equal(model.index, 2);
  assert.match(result.reply, /prepare/);
  assert.doesNotMatch(result.reply, /session has ended/);
});
test('final configurable checkpoints recover without any model or tool calls', async () => {
  const checkpoint = {
    session: { state: {}, events: [] },
    reply: 'Thank you',
    completion: { outcome: 'qualified', fields: { interest: true } },
  };
  const result = await runTurn(
    { ...fixture(), checkpoint },
    {
      post: () => {
        throw new Error('Must not call API');
      },
    },
    'key',
    new AbortController().signal,
    new ScriptModel([]),
  );
  assert.deepEqual(result, checkpoint);
});
test('sandbox callbacks have a separate trusted API route', async () => {
  const previous = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return new Response('{}', { status: 200 });
  };
  try {
    const api = new HarnessApiClient('http://localhost:3000', 'test-secret');
    await api.post({ ...fixture(), sandbox: true }, 'checkpoint', {
      session: fixture().session,
    });
    await api.post(fixture(), 'checkpoint', { session: fixture().session });
    assert.match(urls[0], /\/test-turns\//);
    assert.match(urls[1], /\/turns\//);
    assert.notEqual(urls[0], urls[1]);
  } finally {
    globalThis.fetch = previous;
  }
});
test('dispatch validates protocol versions, draft purpose and closed-task recovery', () => {
  const turn = fixture();
  assert.equal(turnSchema.safeParse(turn).success, true);
  assert.equal(
    turnSchema.safeParse({ ...turn, taskProtocolVersion: undefined }).success,
    false,
  );
  assert.equal(
    turnSchema.safeParse({ ...turn, enabledTools: ['upsertGhlContact'] })
      .success,
    false,
  );
  const draft = {
    ...turn,
    task: {
      ...turn.task,
      version: 0,
      snapshot: { ...turn.task.snapshot, version: 0, draftRevision: 1 },
    },
  };
  assert.equal(turnSchema.safeParse(draft).success, false);
  assert.equal(turnSchema.safeParse({ ...draft, sandbox: true }).success, true);
  const booked = fixture(true);
  const closed = {
    ...booked,
    enabledTools: [],
    task: { ...booked.task, status: 'completed' },
    checkpoint: {
      session: booked.session,
      reply: 'Already saved',
      completion: { outcome: 'booked', fields: {} },
    },
  };
  assert.equal(turnSchema.safeParse(closed).success, true);
  assert.equal(
    turnSchema.safeParse({ ...closed, checkpoint: null }).success,
    false,
  );
  const legacy = {
    ...turn,
    taskProtocolVersion: undefined,
    task: {
      sessionId: turn.task.sessionId,
      key: 'receptionist',
      version: 1,
      objective: 'Arrange a booking',
      completionRule: 'ghl_appointment_created',
      status: 'active',
      result: null,
    },
  };
  assert.equal(turnSchema.safeParse(legacy).success, true);
});
