// Synthetic API fixtures only; no external requests, provider calls, or production writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.TOOL_WAITING_TEST_URL ?? 'http://127.0.0.1:5185';
assert.equal(new URL(base).hostname, '127.0.0.1');
const id = '11111111-1111-4111-8111-111111111111';
const root = `/api/admin/voice-tasks`;
const initial = {
  name: 'Booking test', description: 'Synthetic booking workflow', directions: ['outbound'], objective: 'Arrange an appointment.',
  phases: [{ title: 'Book', instructions: 'Check and book an agreed time.', fieldKeys: [], toolIds: [] }],
  contextFields: [], resultFields: [], outcomes: [{ key: 'done', description: 'Booked', requiredFields: [], checks: ['booking_receipt'] }],
  toolIds: ['checkGhlFreeSlots', 'scheduleGhlMeeting', 'upsertGhlContact', 'endCall'],
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let scenarios = 0;
try {
  for (const width of [1480, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('callagent_admin_token', 'synthetic-admin'));
    let row = { id, organizationId: null, starterKey: null, draftRevision: 1, publishedVersion: null, archived: false, draft: structuredClone(initial), published: null };
    const versions = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = [];
      if (url.pathname.startsWith('/api/auth/')) data = { id, name: 'Synthetic admin', email: 'synthetic@example.test', isActive: true };
      else if (url.pathname === '/api/admin/tool-profiles/known-tools') data = { toolIds: initial.toolIds };
      else if (url.pathname === root) data = [row];
      else if (url.pathname === `${root}/${id}`) data = row;
      else if (url.pathname === `${root}/${id}/versions`) data = versions;
      else if (url.pathname === `${root}/${id}/draft`) {
        row = { ...row, draft: route.request().postDataJSON().definition, draftRevision: row.draftRevision + 1 };
        data = row;
      } else if (url.pathname === `${root}/${id}/publish`) {
        const published = { schemaVersion: 1, taskId: id, version: versions.length + 1, definition: structuredClone(row.draft) };
        versions.push({ ...published, publishedAt: new Date().toISOString() });
        row = { ...row, published, publishedVersion: published.version };
        data = row;
      }
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/admin-dashboard/tasks/${id}`);
    await page.getByRole('button', { name: /Saved speech/ }).click();
    const enable = page.getByRole('checkbox', { name: 'Enable waiting messages' });
    assert.equal(await enable.isChecked(), false);
    await enable.check();
    assert.equal(await page.getByLabel('Check available times waiting sentence').inputValue(), 'Let me check the available times.');
    assert.equal(await page.getByLabel('Check available times waiting delay').inputValue(), '700');
    assert.equal(await page.getByLabel('Book appointment waiting delay').inputValue(), '400');
    assert.equal(await page.getByLabel('Save contact details waiting message').inputValue(), 'off');
    await page.getByLabel('Book appointment waiting message').selectOption('custom');
    await page.getByLabel('Book appointment waiting sentence').fill('I’m arranging your visit now.');
    await page.getByLabel('Book appointment waiting delay').selectOption('1000');
    await enable.uncheck();
    assert.equal(await page.getByLabel('Book appointment waiting sentence').isDisabled(), true);
    await enable.check();
    assert.equal(await page.getByLabel('Book appointment waiting sentence').inputValue(), 'I’m arranging your visit now.');
    assert.equal(await page.getByLabel('Book appointment waiting delay').inputValue(), '1000');
    assert.equal(await page.getByLabel('Sentence 1 usage').count(), 0);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved. Published versions are unchanged.', { exact: true }).waitFor();
    assert.equal(row.draft.savedSpeech.toolWaiting.enabled, true);
    assert.equal(row.draft.savedSpeech.sentences.length, 2);
    await page.getByRole('button', { name: 'Publish version', exact: true }).click();
    await page.getByText(/Published version 1\./).waitFor();
    assert.deepEqual(row.published.definition.savedSpeech, row.draft.savedSpeech);
    await page.reload();
    await page.getByRole('button', { name: /Saved speech/ }).click();
    assert.equal(await page.getByLabel('Book appointment waiting sentence').inputValue(), 'I’m arranging your visit now.');
    assert.equal(await page.getByLabel('Book appointment waiting delay').inputValue(), '1000');
    await page.getByLabel('Book appointment waiting message').selectOption('off');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved. Published versions are unchanged.', { exact: true }).waitFor();
    assert.equal(row.draft.savedSpeech.toolWaiting.tools.scheduleGhlMeeting.mode, 'off');
    assert.equal(row.published.definition.savedSpeech.toolWaiting.tools.scheduleGhlMeeting.mode, 'custom');
    assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    scenarios++;
    await context.close();
  }
  console.log(`Tool waiting editor: ${scenarios} desktop/mobile scenarios passed.`);
} finally { await browser.close(); }
