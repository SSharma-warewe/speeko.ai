// Loopback-only synthetic API fixtures. No real calls, provider credentials, or CRM writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.HUMAN_WORKSPACE_TEST_URL ?? 'http://127.0.0.1:5184';
assert.equal(new URL(base).hostname, '127.0.0.1');
const output = process.env.HUMAN_WORKSPACE_TEST_OUTPUT ?? 'C:/call-agent/tmp/human-transcription-browser';
await mkdir(output, { recursive: true });
const id = '11111111-1111-4111-8111-111111111111';
let status = 'running', endedAt = null, reads = 0;
const record = () => ({ id, organizationId: 'org', executionType: 'human', direction: 'outbound', medium: 'sip', status: endedAt ? 'completed' : 'ready', taskStatus: 'not_applicable', taskKey: null, taskResult: null,
  fromNumber: '+919876543210', toNumber: '+919123456789', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), answeredAt: new Date(Date.now() - 30000).toISOString(), endedAt,
  attemptCount: 1, maxAttempts: 1, context: {}, transcript: [{ id: 'a', role: 'caller', content: 'नमस्ते, can we talk?' }, { id: 'b', role: 'contact', content: 'हाँ, please continue.' }], usage: null,
  humanCall: { callerName: 'Operator', contactName: 'Test Contact', phase: endedAt ? 'ended' : 'connected', joinDeadline: new Date().toISOString(), transcription: { status, provider: 'sarvam', model: 'saaras:v3-realtime' } },
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext();
await context.addInitScript(() => localStorage.setItem('callagent_user_token', 'synthetic-test-token'));
const errors = [];
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(base).origin) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  const path = url.pathname.slice(4);
  const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/auth/me') return json({ id: 'user', name: 'Operator', email: 'test@example.test', role: 'agent', isActive: true, organization: { id: 'org', name: 'Example Org' } });
  if (path === '/users/calls/human/active') return json({ enabled: true, active: null });
  if (path === `/users/calls/${id}`) { reads++; return json(record()); }
  return json([]);
});
try {
  const url = `${base}/dashboard/calls/${id}`;
  await page.goto(url); await page.getByText('The transcript will be available after hang-up.').waitFor();
  assert.equal(await page.getByText('नमस्ते, can we talk?', { exact: true }).count(), 0, 'Active speech must stay hidden even if a response includes it');
  endedAt = new Date().toISOString(); status = 'finalizing';
  await page.getByText('Finishing the transcript…').waitFor();
  status = 'complete'; await page.getByText('Transcript saved · Sarvam').waitFor();
  await page.getByText('नमस्ते, can we talk?', { exact: true }).waitFor();
  assert.equal(await page.locator('.ops-transcript-role').allTextContents().then(labels => labels.join(',')), 'Caller,Contact');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Transcript must fit mobile width');
  await page.screenshot({ path: `${output}/transcript-mobile.png`, fullPage: true });
  for (const [nextStatus, message] of [['partial', 'Partial transcript — some speech could not be transcribed.'], ['unavailable', 'Transcription was unavailable for this call.'], ['not_needed', 'No connected audio to transcribe.']]) {
    status = nextStatus; await page.reload(); await page.getByText(message).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ['hidden active text', 'automatic finalization refresh', 'original Hindi/English', 'Caller/Contact labels', 'complete/partial/unavailable/no-audio messages', 'mobile width'], reads, output }));
} finally { await browser.close(); }
