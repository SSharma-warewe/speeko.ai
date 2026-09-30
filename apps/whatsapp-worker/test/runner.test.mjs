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
