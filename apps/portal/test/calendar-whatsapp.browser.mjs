// Loopback-only fixtures: no Meta sends or HighLevel writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base = process.env.CALENDAR_WHATSAPP_TEST_URL ?? 'http://127.0.0.1:5186';
assert.equal(new URL(base).hostname, '127.0.0.1');
const profile = fileURLToPath(
  new URL('../../../tmp/calendar-whatsapp-' + randomUUID(), import.meta.url),
);
await mkdir(profile, { recursive: true });
const edge = spawn(
  process.env.EDGE_PATH ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Edge startup timed out')),
      15000,
    );
    let output = '';
    edge.on('error', reject);
    edge.stderr.on('data', (data) => {
      output += data;
      const line = output
        .split('\n')
        .find((line) => line.startsWith('DevTools listening on '));
      if (line) {
        clearTimeout(timeout);
        resolve(line.slice('DevTools listening on '.length).trim());
      }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0,
    session;
  const pending = new Map();
  const send = (method, params = {}, scoped = true) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + ' timed out'));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(scoped && session ? { sessionId: session } : {}),
        }),
      );
    });
  let whatsapp = false,
    dnd = false,
    phone = '+919123456789',
    templateFailure = false,
    noTemplates = false,
    contactFailure = false,
    sendFailure = false;
  const payloads = [],
    lookups = [],
    errors = [];
  const contact = () => ({
    id: 'contact-outside-first-page',
    firstName: 'Asha',
    lastName: 'Test',
    phone,
    dnd,
  });
  const appointment = {
    id: 'meeting',
    contactId: 'contact-outside-first-page',
    title: 'Consultation',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1800000).toISOString(),
    appointmentStatus: 'confirmed',
  };
  const fixtures = async (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== new URL(base).origin)
      return send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'BlockedByClient',
      });
    if (!url.pathname.startsWith('/api/'))
      return send('Fetch.continueRequest', { requestId: event.requestId });
    const path = url.pathname.slice(4);
    let body = [],
      responseCode = 200;
    if (path === '/auth/me')
      body = {
        id: 'user',
        name: 'Operator',
        email: 'test@example.test',
        isActive: true,
        organization: { id: 'org', name: 'Test' },
      };
    if (path === '/users/calls/human/active')
      body = { enabled: false, active: null };
    if (
      path === '/users/organization/integrations' ||
      path === '/users/integrations'
    )
      body = [
        { id: 'crm', provider: 'ghl_crm', name: 'CRM', isActive: true },
        { id: 'wa', provider: 'whatsapp', isActive: whatsapp },
      ];
    if (path === '/users/crm/crm/execute') {
      const request = JSON.parse(event.request.postData);
      if (request.action === 'calendars.list')
        body = { calendars: [{ id: 'calendar', name: 'Appointments' }] };
      if (request.action === 'events.list') body = { events: [appointment] };
      if (request.action === 'contacts.get') {
        lookups.push(request.params.id);
        body = { contact: contact() };
        if (contactFailure) {
          responseCode = 403;
          body = { message: 'Missing contacts scope' };
        }
      }
    }
    if (path === '/users/whatsapp/outbound/templates') {
      body = {
        templates: [
          {
            name: 'meeting_reminder',
            language: 'en',
            category: 'UTILITY',
            sendable: true,
            bodyText: 'Hello {{1}}, meeting {{2}}',
            bodyVariables: [{ key: '1' }, { key: '2' }],
            urlButtonVariable: null,
          },
        ],
      };
      if (noTemplates) body = { templates: [] };
      if (templateFailure) {
        responseCode = 500;
        body = { message: 'Could not load templates' };
      }
    }
    if (path === '/users/whatsapp/outbound/contacts')
      body = {
        contacts: [
          { ...contact(), name: 'Asha Test', company: null, email: null },
        ],
        nextCursor: null,
        total: 1,
      };
    if (path === '/users/whatsapp/outbound/send') {
      payloads.push(JSON.parse(event.request.postData));
      body = {
        sent: sendFailure ? 0 : 1,
        failed: sendFailure ? 1 : 0,
        skipped: 0,
        results: [
          {
            status: sendFailure ? 'failed' : 'sent',
            ghlContactId: appointment.contactId,
            phone,
            error: sendFailure ? 'Provider rejected message' : null,
          },
        ],
      };
    }
    await send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  };
  socket.addEventListener('message', (raw) => {
    const event = JSON.parse(raw.data);
    if (event.id) {
      const item = pending.get(event.id);
      if (!item) return;
      clearTimeout(item.timeout);
      pending.delete(event.id);
      event.error
        ? item.reject(new Error(event.error.message))
        : item.resolve(event.result);
    } else if (event.method === 'Fetch.requestPaused')
      fixtures(event.params).catch((error) => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown')
      errors.push(event.params.exceptionDetails.text);
  });
  const target = await send(
    'Target.createTarget',
    { url: 'about:blank' },
    false,
  );
  session = (
    await send(
      'Target.attachToTarget',
      { targetId: target.targetId, flatten: true },
      false,
    )
  ).sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "localStorage.setItem('callagent_user_token','synthetic-token');window.confirm=()=>true;",
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = (expression) =>
    evaluate(
      'new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(' +
        expression +
        '){clearInterval(timer);resolve(true)}else if(Date.now()-start>10000){clearInterval(timer);reject(new Error("UI wait timed out"))}},50)})',
    );
  const button = (text) =>
    'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()===' +
    JSON.stringify(text) +
    ')';
  const open = async () => {
    await send('Page.navigate', { url: base + '/dashboard/crm?tab=calendar' });
    await wait(button('WhatsApp message'));
  };
  const compose = async () => {
    await evaluate(
      '(()=>{const b=' +
        button('WhatsApp message') +
        ';b.focus();b.click()})()',
    );
    await wait('document.querySelector("#wa-template")');
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open();
  assert.equal(await evaluate(button('WhatsApp message') + '.disabled'), true);
  whatsapp = true;
  await open();
  assert.equal(await evaluate(button('WhatsApp message') + '.disabled'), false);
  await compose();
  await writeFile(new URL('../../../tmp/calendar-whatsapp-desktop.png', import.meta.url), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  assert.equal(lookups.at(-1), appointment.contactId);
  await evaluate(button('Send to 1 contact') + '.click()');
  assert.equal(payloads.length, 0);
  await wait('document.body.textContent.includes("Enter text for {{2}}")');
  await evaluate(
    '(()=>{const input=document.querySelector("dialog input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Tomorrow at 10 AM");input.dispatchEvent(new Event("input",{bubbles:true}))})()',
  );
  await wait(
    'document.querySelector(".ops-wa-preview").textContent.includes("Tomorrow at 10 AM")',
  );
  await evaluate(button('Send to 1 contact') + '.click()');
  await wait('document.body.textContent.includes("Sent 1, failed 0")');
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].recipients.length, 1);
  assert.equal(payloads[0].recipients[0].ghlContactId, appointment.contactId);
  assert.equal(payloads[0].bodyVariables['2'].text, 'Tomorrow at 10 AM');
  await evaluate(button('Message sent') + '.click()');
  assert.equal(payloads.length, 1);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate(
      'document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth',
    ),
    true,
  );
  await writeFile(new URL('../../../tmp/calendar-whatsapp-mobile.png', import.meta.url), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  await evaluate(
    'document.querySelector("dialog .crm-drawer-header button").click()',
  );
  await wait('!document.querySelector("dialog")');
  assert.equal(
    await evaluate('document.activeElement.textContent.trim()'),
    'WhatsApp message',
  );
  for (const blocked of ['dnd', 'phone']) {
    dnd = blocked === 'dnd';
    phone = blocked === 'phone' ? '' : '+919123456789';
    await open();
    await compose();
    assert.equal(
      await evaluate(button('Send to 1 contact') + '.disabled'),
      true,
    );
  }
  dnd = false;
  phone = '+919123456789';
  templateFailure = true;
  await open();
  await evaluate(button('WhatsApp message') + '.click()');
  await wait('document.body.textContent.includes("Could not load templates")');
  templateFailure = false;
  contactFailure = true;
  await open();
  await evaluate(button('WhatsApp message') + '.click()');
  await wait('document.body.textContent.includes("Missing contacts scope")');
  assert.equal(await evaluate('location.pathname'), '/dashboard/crm');
  contactFailure = false;
  noTemplates = true;
  await open();
  await evaluate(button('WhatsApp message') + '.click()');
  await wait('document.body.textContent.includes("No sendable templates")');
  noTemplates = false;
  sendFailure = true;
  await open();
  await compose();
  await evaluate(
    '(()=>{const input=document.querySelector("dialog input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Draft meeting time");input.dispatchEvent(new Event("input",{bubbles:true}))})()',
  );
  await wait(
    'document.querySelector(".ops-wa-preview").textContent.includes("Draft meeting time")',
  );
  await evaluate(button('Send to 1 contact') + '.click()');
  await wait('document.body.textContent.includes("Provider rejected message")');
  assert.equal(
    await evaluate('document.querySelector("dialog input").value'),
    'Draft meeting time',
  );
  assert.equal(payloads.length, 2);
  await evaluate('new Promise(resolve=>setTimeout(resolve,250))');
  assert.equal(payloads.length, 2, 'Failed sends never retry automatically');
  sendFailure = false;
  await send('Page.navigate', { url: base + '/dashboard/whatsapp?tab=send' });
  await wait('document.querySelector(".ops-table tbody input[type=checkbox]")');
  await evaluate(
    'document.querySelector(".ops-table tbody input[type=checkbox]").click()',
  );
  await wait(button('Send to 1 contact'));
  assert.equal(
    await evaluate(
      'document.querySelector(".ops-wa-preview").textContent.includes("Asha")',
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Passed: WhatsApp connection gating, exact contact lookup, variable validation and preview, single recipient send, success duplicate prevention, mobile width, focus restoration, DND/no-phone blocking, template failure, scope failure without logout, no approved templates, failed-send draft preservation without retries, existing Send page recipient selection.',
  );
} finally {
  socket?.close();
  edge.kill();
}
