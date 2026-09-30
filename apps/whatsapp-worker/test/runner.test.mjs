import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseLlm } from '@google/adk';
import { runTurn } from '../../../dist/apps/whatsapp-worker/runner.js';

const fixture = () => ({
  id: 'turn',
  conversationId: 'conversation',
  generation: 1,
  leaseToken: 'lease',
  sender: '919876543210',
  body: 'My name is Priya',
  prompt: 'Help this customer.',
  enabledTools: [],
  session: { state: {}, events: [] },
  checkpoint: null,
  task: null,
});

class TestModel extends BaseLlm {
  requests = [];
  constructor() {
    super({ model: 'test-model' });
  }
  async *generateContentAsync(llmRequest) {
    this.requests.push(structuredClone(llmRequest.contents));
    yield {
      content: {
        role: 'model',
        parts: [
          { text: 'Private reasoning', thought: true },
          { text: 'Hello Priya.' },
        ],
      },
    };
  }
}

test('real ADK turns persist visible history and restore it in a fresh runner', async () => {
  const calls = [];
  const api = {
    post: async (_turn, action, data) => {
      calls.push({ action, data: structuredClone(data) });
      return { success: true };
    },
  };
  const firstModel = new TestModel();
  const first = await runTurn(
    fixture(),
    api,
    'test-key',
    new AbortController().signal,
    firstModel,
  );
  assert.equal(first.reply, 'Hello Priya.');
  assert.ok(
    calls.some(
      (call) =>
        call.action === 'checkpoint' && call.data.reply === 'Hello Priya.',
    ),
  );
  assert.ok(!JSON.stringify(first.session).includes('Private reasoning'));
  assert.ok(JSON.stringify(first.session).includes('My name is Priya'));
  const secondModel = new TestModel();
  await runTurn(
    { ...fixture(), body: 'What is my name?', session: first.session },
    api,
    'test-key',
    new AbortController().signal,
    secondModel,
  );
  assert.ok(
    JSON.stringify(secondModel.requests[0]).includes('My name is Priya'),
  );
  assert.ok(JSON.stringify(secondModel.requests[0]).includes('Hello Priya.'));
  assert.ok(
    JSON.stringify(secondModel.requests[0]).includes('What is my name?'),
  );
});

test('final persisted checkpoint recovers without another model or tool call', async () => {
  const checkpoint = {
    reply: 'Already generated',
    session: { state: { saved: true }, events: [] },
  };
  const model = new TestModel();
  const result = await runTurn(
    { ...fixture(), checkpoint },
    {
      post() {
        throw new Error('Should not checkpoint again');
      },
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.deepEqual(result, checkpoint);
  assert.equal(model.requests.length, 0);
});

test('an unavailable API checkpoint stops execution before a reply is committed', async () => {
  const model = new TestModel();
  await assert.rejects(
    runTurn(
      fixture(),
      {
        post: async () => {
          throw new Error('checkpoint unavailable');
        },
      },
      'key',
      new AbortController().signal,
      model,
    ),
    /checkpoint unavailable/,
  );
  assert.equal(model.requests.length, 0);
});

test('real ADK executes enabled tool calls through the API and persists their receipts', async () => {
  class ToolModel extends BaseLlm {
    requests = [];
    constructor() {
      super({ model: 'test-tool-model' });
    }
    async *generateContentAsync(llmRequest) {
      this.requests.push(llmRequest);
      yield {
        content: {
          role: 'model',
          parts:
            this.requests.length === 1
              ? [
                  {
                    functionCall: {
                      id: 'lookup-1',
                      name: 'lookupGhlContact',
                      args: { email: 'priya@company.com' },
                    },
                  },
                ]
              : [{ text: 'I found your contact.' }],
        },
      };
    }
  }
  const calls = [];
  const model = new ToolModel();
  const result = await runTurn(
    { ...fixture(), enabledTools: ['lookupGhlContact'] },
    {
      post: async (_turn, action, data) => {
        calls.push({ action, data: structuredClone(data) });
        return action === 'tools'
          ? { ok: true, found: true, contactId: 'contact-1' }
          : { success: true };
      },
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.equal(result.reply, 'I found your contact.');
  assert.equal(model.requests.length, 2);
  assert.deepEqual(
    calls.filter((call) => call.action === 'tools').map((call) => call.data),
    [{ toolId: 'lookupGhlContact', args: { email: 'priya@company.com' } }],
  );
  assert.ok(JSON.stringify(result.session).includes('contact-1'));
});

const taskFixture = () => ({
  ...fixture(),
  task: {
    sessionId: 'task-session-1',
    key: 'receptionist',
    version: 1,
    objective: 'Discover needs and create an agreed booking',
    completionRule: 'ghl_appointment_created',
    status: 'active',
    result: null,
  },
});

test('task booking stops generation on a verified receipt and uses the task session identity', async () => {
  class BookingModel extends BaseLlm {
    requests = [];
    constructor() {
      super({ model: 'booking-test' });
    }
    async *generateContentAsync(request) {
      this.requests.push(request);
      yield {
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'book',
                name: 'scheduleGhlMeeting',
                args: { startTime: '2030-01-01T10:00:00Z' },
              },
            },
          ],
        },
      };
    }
  }
  const model = new BookingModel();
  const calls = [];
  const result = await runTurn(
    { ...taskFixture(), enabledTools: ['scheduleGhlMeeting'] },
    {
      post: async (_turn, action, data) => {
        calls.push({ action, data });
        return action === 'tools'
          ? {
              ok: true,
              appointmentId: 'booking-1',
              startTime: '2030-01-01T10:00:00Z',
            }
          : { success: true };
      },
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.equal(model.requests.length, 1);
  assert.match(result.reply, /appointment is booked.*2030/);
  assert.ok(!result.reply.includes('booking-1'));
  assert.equal(calls.filter((call) => call.action === 'tools').length, 1);
  assert.ok(
    result.session.events.some((event) =>
      event.content?.parts?.some(
        (part) =>
          part.functionResponse?.response?.appointmentId === 'booking-1',
      ),
    ),
  );
  assert.ok(
    result.session.events.every(
      (event) => !event.sessionId || event.sessionId === 'task-session-1',
    ),
  );
});

test('closed booking tasks recover confirmation without another model or business tool call', async () => {
  const model = new TestModel();
  const calls = [];
  const turn = taskFixture();
  turn.task.status = 'completed';
  turn.task.result = {
    ok: true,
    appointmentId: 'persisted-booking',
    startTime: '2030-01-01T10:00:00Z',
  };
  const result = await runTurn(
    turn,
    {
      post: async (_turn, action) => {
        calls.push(action);
        return {};
      },
    },
    'key',
    new AbortController().signal,
    model,
  );
  assert.match(result.reply, /appointment is booked.*2030/);
  assert.equal(model.requests.length, 0);
  assert.deepEqual(calls, ['checkpoint']);
});

test('a task can request decline with quoted evidence, but the API owns acceptance', async () => {
  class DeclineModel extends BaseLlm {
    count = 0;
    constructor() {
      super({ model: 'decline-test' });
    }
    async *generateContentAsync() {
      yield {
        content: {
          role: 'model',
          parts:
            ++this.count === 1
              ? [
                  {
                    functionCall: {
                      id: 'decline',
                      name: 'declineBooking',
                      args: { evidence: "I don't want to book a meeting" },
                    },
                  },
                ]
              : [{ text: 'Understood. Have a good day.' }],
        },
      };
    }
  }
  const result = await runTurn(
    { ...taskFixture(), body: "I don't want to book a meeting" },
    {
      post: async (_turn, action) => {
        assert.notEqual(action, 'tools');
        return {};
      },
    },
    'key',
    new AbortController().signal,
    new DeclineModel(),
  );
  assert.deepEqual(result.decline, {
    evidence: "I don't want to book a meeting",
  });
  assert.match(result.reply, /Understood/);
});

test('fresh task jobs have no history from the previously completed task', async () => {
  const model = new TestModel();
  const turn = taskFixture();
  turn.task.sessionId = 'task-session-2';
  turn.body = 'A new booking';
  await runTurn(
    turn,
    { post: async () => ({}) },
    'key',
    new AbortController().signal,
    model,
  );
  assert.ok(!JSON.stringify(model.requests).includes('persisted-booking'));
  assert.ok(!JSON.stringify(model.requests).includes('My name is Priya'));
});
