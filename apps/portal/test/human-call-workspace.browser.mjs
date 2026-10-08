// Synthetic browser verification only. All API traffic is fulfilled locally.
// Run against Vite with VITE_API_URL=/api; pass PLAYWRIGHT_MODULE when using a bundled runtime.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.HUMAN_WORKSPACE_TEST_URL ?? 'http://127.0.0.1:5184';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a loopback-only synthetic preview');
const output = process.env.HUMAN_WORKSPACE_TEST_OUTPUT ?? join(tmpdir(), 'speeko-human-workspace-browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, timezoneId: 'Asia/Calcutta' });
await context.addInitScript(() => localStorage.setItem('callagent_user_token', 'synthetic-test-token'));
const id = '22222222-2222-4222-8222-222222222222', crmId = '33333333-3333-4333-8333-333333333333';
const contact = { id: 'contact', firstName: 'Natalie', lastName: 'Young', phone: '+919123456789', email: 'natalie@example.test', companyName: 'Example Company', tags: [] };
let workspace = { selectedTools: ['interest', 'bookMeeting', 'notes'], interest: null, notes: '', revision: 0, updatedAt: null, updatedBy: null, actions: [] };
let phase = 'waiting_for_user', active = null, createdRequest, actionCount = 0, failSave = false, failCalendars = false;
const now = new Date().toISOString();
const future = new Date(Date.now() + 86400000); future.setUTCHours(5, 30, 0, 0);
const slot = future.toISOString(), futureDay = slot.slice(0, 10);
const record = () => ({ id, organizationId: 'org', executionType: 'human', direction: 'outbound', medium: 'sip', status: phase === 'ended' ? 'completed' : 'creating', taskStatus: 'not_applicable', taskKey: null, taskResult: null,
  fromNumber: '+919876543210', toNumber: contact.phone, createdAt: now, updatedAt: now, answeredAt: null, endedAt: phase === 'ended' ? now : null,
  attemptCount: 1, maxAttempts: 1, context: {}, transcript: [], usage: null, humanCall: {
    callerName: 'Operator', contactName: 'Natalie Young', crmIntegrationId: crmId, crmContactId: contact.id, phase,
    joinDeadline: new Date(Date.now() + 120000).toISOString(), endReason: phase === 'ended' ? 'ended_by_user' : null, workspace,
  } });
const response = () => ({ call: record(), session: record().humanCall });
const errors = [];
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(base).origin) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  const path = url.pathname.slice(4), method = route.request().method();
  const body = method === 'GET' ? null : route.request().postDataJSON();
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path === '/auth/me') return json({ id: 'user', email: 'operator@example.test', name: 'Operator', role: 'agent', isActive: true, organization: { id: 'org', name: 'Example Org' } });
  if (path === '/users/integrations') return json([{ id: crmId, name: 'HighLevel', provider: 'ghl_crm', isActive: true }]);
  if (path === '/users/sip-trunks/outbound') return json([{ id: 'trunk', name: 'Main line', isActive: true, livekitTrunkId: 'ST_test', numbers: ['+919876543210'], createdAt: now }]);
  if (path === '/users/calls/human/active') return json({ enabled: true, active: active ? response() : null });
  if (path === '/users/calls/human') { createdRequest = body; workspace.selectedTools = body.selectedTools; active = true; return json(response(), 201); }
  if (path === '/users/calls/' + id + '/human/end') { phase = 'ended'; active = false; return json(response()); }
  if (path === '/users/calls/' + id + '/human/join') return json(response());
  if (path === '/users/calls/' + id) return json(record());
  if (path === '/users/calls/' + id + '/human/workspace') {
    if (method === 'PATCH') {
      if (failSave) return json({ message: 'Workspace changed. Refresh saved results before trying again; your draft is retained.' }, 409);
      assert.equal(body.revision, workspace.revision);
      workspace = { ...workspace, ...body, revision: workspace.revision + 1, updatedAt: new Date().toISOString(), updatedBy: 'user' };
    }
    return json(workspace);
  }
  if (path === '/users/calls/' + id + '/human/workspace/actions') {
    actionCount++;
    workspace = { ...workspace, revision: workspace.revision + 1, actions: [...workspace.actions, {
      requestId: body.requestId, kind: body.kind, status: 'succeeded', providerId: 'receipt-' + actionCount,
      message: body.kind === 'bookMeeting' ? 'Meeting booked in HighLevel.' : 'Summary copied to HighLevel.',
      createdAt: now, completedAt: now, ...(body.meeting ? { meeting: body.meeting } : {}),
    }] };
    return json(workspace);
  }
  if (path === '/users/crm/' + crmId + '/execute') {
    if (body.action === 'contacts.list') return json({ contacts: [contact] });
    if (body.action === 'contacts.get') return json({ contact });
    if (body.action === 'calendars.list') return failCalendars ? json({ message: 'Requires calendars.readonly' }, 403) : json({ calendars: [{ id: 'calendar', name: 'Discovery calendar' }] });
    if (body.action === 'slots.list') return json({ [futureDay]: { slots: [slot] } });
    if (body.action === 'notes.list' || body.action === 'tasks.list') return json({ notes: [], tasks: [] });
  }
  return json({ message: 'Unexpected synthetic request: ' + path }, 404);
});
try {
  await page.goto(base + '/dashboard/crm?tab=contacts');
  await page.getByRole('button', { name: 'Call', exact: true }).click();
  assert.equal(await page.getByRole('checkbox').count(), 3);
  for (const checkbox of await page.getByRole('checkbox').all()) assert.equal(await checkbox.isChecked(), true);
  await page.getByRole('checkbox', { name: 'Book meeting' }).focus();
  await page.keyboard.press('Space');
  await page.screenshot({ path: join(output, 'tool-selector.png'), fullPage: true });
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await page.waitForURL('**/dashboard/crm/call/' + id);
  assert.equal(await page.locator('a[href="/dashboard/crm"]').first().getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('a[href="/dashboard/calls"]').first().getAttribute('aria-current'), null);
  await page.getByRole('heading', { name: 'Interest', exact: true }).waitFor();
  assert.deepEqual(createdRequest.selectedTools, ['interest', 'notes']);
  assert.equal(await page.getByRole('heading', { name: 'Book meeting', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Interested', exact: true }).click();
  await page.getByText('Saved: Interested', { exact: true }).waitFor();
  await page.getByLabel('Call notes').fill('Interested in a demo next week.');
  await page.getByRole('link', { name: '← CRM contacts' }).click();
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click();
  await page.getByLabel('Call notes').waitFor();
  assert.equal(await page.getByLabel('Call notes').inputValue(), 'Interested in a demo next week.');
  failSave = true;
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await page.getByText(/Workspace changed/).waitFor();
  assert.equal(await page.getByLabel('Call notes').inputValue(), 'Interested in a demo next week.');
  failSave = false;
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await page.getByText(/Saved ·/).waitFor();
  await page.getByRole('button', { name: 'Preview CRM summary', exact: true }).click();
  await page.getByRole('button', { name: 'Copy summary to CRM', exact: true }).click();
  await page.getByText('Summary copied to HighLevel.', { exact: true }).waitFor();
  await page.locator('.ops-content').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: join(output, 'workspace-active.png'), fullPage: true });
  await page.getByRole('button', { name: 'End call', exact: true }).first().click();
  await page.getByText('Call ended. Your selected tools remain available for wrap-up.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Not interested', exact: true }).click();
  await page.getByText('Saved: Not interested', { exact: true }).waitFor();

  workspace = { ...workspace, selectedTools: ['interest', 'bookMeeting', 'notes'] };
  await page.getByRole('button', { name: 'Refresh saved results' }).click();
  await page.getByLabel('Calendar', { exact: true }).waitFor();
  await page.getByLabel('Date for availability').fill(futureDay);
  await page.getByRole('button', { name: 'Check open times' }).click();
  await page.locator('.human-meeting-fields .human-call-actions button').click();
  await page.getByRole('button', { name: 'Review meeting', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
  await page.getByText('Meeting booked in HighLevel.', { exact: true }).waitFor();
  assert.equal(actionCount, 2);
  await page.locator('.ops-content').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: join(output, 'workspace-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'workspace-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile layout overflows');
  await page.setViewportSize({ width: 1480, height: 1000 });
  failCalendars = true;
  await page.reload();
  await page.getByText('Requires calendars.readonly', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Interested', exact: true }).click();
  await page.getByText('Saved: Interested', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ['tool defaults and selection', 'workspace navigation', 'interest persistence', 'draft navigation retention', 'failed-save draft retention', 'explicit CRM summary', 'post-call wrap-up', 'calendar slots and booking', '390px layout', 'calendar permission isolation'], screenshots: output }));
} finally { await browser.close(); }
