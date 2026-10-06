import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import type {
  WhatsAppTaskTestRecord,
  WhatsAppAgentToolId,
} from '@call-agent/contracts';
import { adminFetch, userFetch, listOrganizations } from '../../lib/api';
import { whatsappTaskScope } from '../../lib/task-studio';

export function WhatsAppTaskTestChat({
  admin,
  orgId,
  taskId,
  save,
  toolIds,
}: {
  admin: boolean;
  orgId?: string;
  taskId: string;
  save: () => Promise<{ draftRevision: number }>;
  toolIds: string[];
}) {
  const fetch = admin ? adminFetch : userFetch;
  const root = useMemo(
    () => `${whatsappTaskScope(admin, orgId)}/${taskId}/tests`,
    [admin, orgId, taskId],
  );
  const [persona, setPersona] = useState(
    'You are a helpful assistant for this business.',
  );
  const [context, setContext] = useState('{}');
  const [testOrg, setTestOrg] = useState(orgId ?? '');
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [failures, setFailures] = useState<WhatsAppAgentToolId[]>([]);
  const [test, setTest] = useState<WhatsAppTaskTestRecord | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (admin && !orgId)
      listOrganizations()
        .then((rows) => {
          if (active) setOrgs(rows);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [admin, orgId]);
  const waiting = !!test?.turns.some(
    (t) => t.status === 'pending' || t.status === 'running',
  );
  useEffect(() => {
    if (!test || !waiting) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const row = await fetch<WhatsAppTaskTestRecord>(`${root}/${test.id}`);
        if (active) setTest(row);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Could not load test');
      } finally {
        if (active) timer = setTimeout(poll, 1500);
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [root, fetch, test?.id, waiting]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ops-panel" aria-label="WhatsApp sandbox">
      <div className="ops-panel-head">
        <h2>Test draft in chat</h2>
      </div>
      <div className="ops-panel-body ops-stack">
        <Alert tone="info">
          Sandbox simulation: GHL actions are simulated. No WhatsApp messages
          are sent. Changes to the draft require starting a fresh test.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Test persona">
          <Textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            maxLength={20000}
          />
        </Field>
        {admin && !orgId && (
          <Field label="Organization allowlist">
            <Select
              value={testOrg}
              onChange={(e) => setTestOrg(e.target.value)}
            >
              <option value="">Select an organization</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Test context JSON">
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </Field>
        {!!toolIds.length && (
          <fieldset>
            <legend>Simulate tool failures</legend>
            {toolIds.map((id) => (
              <label key={id} className="voice-task-option">
                <input
                  type="checkbox"
                  checked={failures.includes(id as WhatsAppAgentToolId)}
                  onChange={() =>
                    setFailures((v) =>
                      v.includes(id as WhatsAppAgentToolId)
                        ? v.filter((x) => x !== id)
                        : [...v, id as WhatsAppAgentToolId],
                    )
                  }
                />
                {id}
              </label>
            ))}
          </fieldset>
        )}
        <Button
          disabled={busy || !persona.trim() || (admin && !orgId && !testOrg)}
          onClick={() =>
            void act(async () => {
              const row = await save();
              const parsed: unknown = JSON.parse(context);
              if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
              )
                throw new Error('Context must be a JSON object');
              if (test)
                await fetch(`${root}/${test.id}/reset`, { method: 'POST' });
              setTest(
                await fetch<WhatsAppTaskTestRecord>(root, {
                  method: 'POST',
                  body: {
                    revision: row.draftRevision,
                    persona,
                    context: parsed,
                    simulatedFailureTools: failures.filter((id) =>
                      toolIds.includes(id),
                    ),
                    ...(admin && !orgId ? { organizationId: testOrg } : {}),
                  },
                }),
              );
            })
          }
        >
          {test ? 'Reset and test saved draft' : 'Save and start test'}
        </Button>
        {test && (
          <>
            <p role="status">
              Draft revision {test.snapshot.draftRevision} · {test.status}
              {test.outcome ? ` · ${test.outcome}` : ''}
              {waiting ? ' · Waiting for reply…' : ''}
            </p>
            <div className="ops-stack" aria-label="Sandbox transcript">
              {test.turns.map((t) => (
                <article key={t.id} className="ops-panel-body">
                  <p>
                    <strong>You:</strong> {t.body}
                  </p>
                  {t.reply && (
                    <p>
                      <strong>Agent:</strong> {t.reply}
                    </p>
                  )}
                  {t.errorCode && (
                    <Alert tone="error">
                      {t.errorCode}. Start a fresh test to try again.
                    </Alert>
                  )}
                  {t.toolActivity.length > 0 && (
                    <details>
                      <summary>Simulated tools and validation</summary>
                      <pre className="voice-task-preview">
                        {JSON.stringify(t.toolActivity, null, 2)}
                      </pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
            {test.result && (
              <pre className="voice-task-preview">
                {JSON.stringify(test.result, null, 2)}
              </pre>
            )}
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await fetch(`${root}/${test.id}/messages`, {
                    method: 'POST',
                    body: {
                      body: message,
                      clientMessageId: crypto.randomUUID(),
                    },
                  });
                  setMessage('');
                  setTest(
                    await fetch<WhatsAppTaskTestRecord>(`${root}/${test.id}`),
                  );
                });
              }}
            >
              <Field label="Customer message">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy || waiting || test.status !== 'active'}
                  maxLength={4096}
                />
              </Field>
              <Button
                type="submit"
                disabled={
                  busy || waiting || test.status !== 'active' || !message.trim()
                }
              >
                Send test message
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
