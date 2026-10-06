import { useEffect, useState } from 'react';
import { Alert, Button, Select } from '@call-agent/ui';
import {
  listUserWhatsAppConversations,
  getUserWhatsAppConversation,
  UnauthorizedError,
} from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import type { WhatsAppConversationDetail } from '@call-agent/contracts';
import { useUserAsync } from '../hooks/useAsync';
import { LoadingBlock } from './LoadingBlock';

export function WhatsAppConversations() {
  const { logout } = useUserAuth();
  const list = useUserAsync(listUserWhatsAppConversations, []);
  const [detail, setDetail] = useState<WhatsAppConversationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState('');
  useEffect(() => {
    let active = true;
    setDetail(null);
    setError('');
    setBusy(Boolean(selection));
    if (selection) {
      getUserWhatsAppConversation(selection)
        .then(
          (row) => {
            if (active) setDetail(row);
          },
          (error) => {
            if (active && error instanceof UnauthorizedError) {
              logout();
              return;
            }
            if (active)
              setError(
                error instanceof Error
                  ? error.message
                  : 'Could not load conversation',
              );
          },
        )
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [selection, logout]);
  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>Agent conversations</h2>
        <Button variant="secondary" onClick={list.reload}>
          Refresh
        </Button>
      </div>
      <div className="ops-panel-body ops-stack">
        {list.loading ? (
          <LoadingBlock label="Loading conversations" />
        ) : list.error ? (
          <Alert tone="error">{list.error}</Alert>
        ) : (
          <label>
            Customer conversation
            <Select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
            >
              <option value="">Select a conversation</option>
              {list.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sender}
                </option>
              ))}
            </Select>
          </label>
        )}
        {busy && <LoadingBlock label="Loading task history" />}
        {error && <Alert tone="error">{error}</Alert>}
        {detail?.taskSessions.map((s) => (
          <article key={s.id} className="ops-panel-body">
            <h3>
              {s.configuration.snapshot?.definition.name ?? s.configuration.key}{' '}
              · v{s.configuration.version}
            </h3>
            <p>
              {s.status}
              {s.outcome ? ` · ${s.outcome}` : ''}
            </p>
            {s.result && (
              <pre className="voice-task-preview">
                {JSON.stringify(s.result, null, 2)}
              </pre>
            )}
          </article>
        ))}
        {detail && (
          <details>
            <summary>Recent messages</summary>
            {[...detail.turns].reverse().map((t) => (
              <article key={t.id}>
                <p>
                  <strong>Customer:</strong> {t.body}
                </p>
                {t.outgoing && (
                  <p>
                    <strong>Agent:</strong> {t.outgoing.body}{' '}
                    <span className="ops-muted">({t.outgoing.status})</span>
                  </p>
                )}
              </article>
            ))}
          </details>
        )}
        {!list.loading && !list.error && list.data?.length === 0 && (
          <p className="ops-muted">No agent conversations yet.</p>
        )}
      </div>
    </section>
  );
}
