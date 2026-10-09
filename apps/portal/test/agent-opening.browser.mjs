// Synthetic fixtures only: API requests are intercepted; external requests are blocked.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.AGENT_OPENING_TEST_URL ?? 'http://127.0.0.1:5185';
assert.equal(new URL(base).hostname, '127.0.0.1');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const id = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const opening = 'Hi! I can help you schedule an appointment. What date and time would you prefer?';
const cases = [
  { name: 'template', path: `/admin-dashboard/agents/${id}`, endpoint: `/api/admin/agents/${id}`, input: '#tpl-on-enter', save: 'Save template' },
  { name: 'admin organization', path: `/admin-dashboard/organizations/${orgId}/agents/${id}`, endpoint: `/api/admin/organizations/${orgId}/agents/${id}`, input: '#oa-on-enter', save: 'Save changes' },
  { name: 'user organization', path: `/dashboard/agents/${id}`, endpoint: `/api/users/agents/${id}`, input: '#ua-on-enter', save: 'Save changes', user: true },
];
let scenarios = 0;
try {
  for (const width of [1480, 390]) {
    for (const fixture of cases) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript(() => {
        localStorage.setItem('callagent_admin_token', 'synthetic-admin');
        localStorage.setItem('callagent_user_token', 'synthetic-user');
      });
      let row = {
        id, key: 'outbound', slug: 'outbound', name: 'Outbound Call Agent', direction: 'outbound', isActive: true,
        description: null, prompt: { systemPrompt: 'Synthetic fixture', onEnterInstructions: opening, onExitInstructions: null },
        defaultTaskKey: null, defaultVoiceTaskId: null, enabledTools: ['endCall'], toolProfileId: null, calendarIntegrationId: null,
        model: null, ttsModel: 'sarvam/bulbul-v3-realtime', sttModel: 'sarvam/saaras-v3-realtime', voice: 'ritu', speechLanguage: null,
        temperature: 0.5, speakingRate: 1, deliveryMode: 'BALANCED', ttsCacheEnabled: true,
        ttsPreparedSpeechEnabled: fixture.name === 'template' ? true : null,
        ttsPreparedSpeechDefaultEnabled: fixture.name !== 'template', ttsCacheDefaultEnabled: false,
      };
      let saved;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname.startsWith('/api/auth/')) data = { id, name: 'Synthetic user', firstName: 'Synthetic', email: 'synthetic@example.test', role: 'owner', organization: { id: orgId, name: 'Synthetic organization', slug: 'synthetic', allowedTools: [] } };
        else if (url.pathname === fixture.endpoint) {
          if (route.request().method() === 'PATCH') {
            saved = route.request().postDataJSON();
            row = { ...row, ...saved, prompt: { ...row.prompt, onEnterInstructions: saved.onEnterInstructions } };
          }
          data = row;
        } else if (url.pathname === `/api/admin/organizations/${orgId}`) data = { id: orgId, name: 'Synthetic organization', slug: 'synthetic', isActive: true };
        await route.fulfill({ json: data });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const persona = async () => { if (fixture.user) await page.getByRole('tab', { name: 'Persona', exact: true }).click(); };
      const voice = async () => { if (fixture.user) await page.getByRole('tab', { name: 'Voice', exact: true }).click(); };
      try {
        await page.goto(base + fixture.path);
        await page.locator(fixture.input).waitFor();
        assert.equal(await page.locator(fixture.input).inputValue(), opening);
        await page.getByText(/saved opening plays verbatim/).waitFor();
        await voice();
        await page.locator('#agent-prepared-speech').selectOption('off');
        await persona();
        await page.getByText(/instructions for the model to generate the greeting/).waitFor();
        await Promise.all([
          page.waitForResponse(response => response.url().endsWith(fixture.endpoint) && response.request().method() === 'GET'),
          page.getByRole('button', { name: fixture.save, exact: true }).click(),
        ]);
        assert.equal(saved.ttsPreparedSpeechEnabled, false);
        assert.equal(saved.onEnterInstructions, opening);
        await page.reload();
        await page.locator(fixture.input).waitFor();
        await page.getByText(/instructions for the model to generate the greeting/).waitFor();
        await voice();
        assert.equal(await page.locator('#agent-prepared-speech').inputValue(), 'off');
        await page.locator('#agent-prepared-speech').selectOption('on');
        await persona();
        await page.getByText(/saved opening plays verbatim/).waitFor();
        await Promise.all([
          page.waitForResponse(response => response.url().endsWith(fixture.endpoint) && response.request().method() === 'GET'),
          page.getByRole('button', { name: fixture.save, exact: true }).click(),
        ]);
        assert.equal(saved.ttsPreparedSpeechEnabled, true);
        row.model = 'openai/gpt-realtime-2.1-mini';
        await page.reload();
        await page.locator(fixture.input).waitFor();
        await page.getByText(/Prepared opening playback is unavailable/).waitFor();
        await voice();
        assert.equal(await page.locator('#agent-prepared-speech').isDisabled(), true);
        assert.equal(await page.locator('#agent-prepared-speech').inputValue(), 'on');
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        scenarios += 4;
        console.log(`PASS ${fixture.name} width=${width}: inheritance, draft toggle, save/reload, native realtime`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`${scenarios} opening-editor browser scenarios passed`);
