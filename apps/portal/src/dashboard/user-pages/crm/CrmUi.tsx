import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import type { CrmAction, CrmResult } from '@call-agent/contracts';
import { executeUserCrm, UnauthorizedError } from '../../../lib/api';
import { useUserAuth } from '../../../lib/auth';
import { useUserAsync } from '../../hooks/useAsync';
import { LoadingBlock } from '../../components/LoadingBlock';
import { ErrorBlock } from '../../components/ErrorBlock';
import { ResourceNotFound } from '../../components/ResourceNotFound';

export type Row = Record<string, unknown>;
export const obj = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
export const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(obj) : [];
export const str = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export const label = (row: Row): string =>
  str(row.name) ||
  [str(row.firstName), str(row.lastName)].filter(Boolean).join(' ') ||
  str(row.contactName) ||
  str(row.title) ||
  str(row.email) ||
  str(row.id);
export const dateLabel = (value: unknown) => {
  const time = new Date(str(value));
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleString();
};
export const localDate = (value: unknown) => {
  const date = new Date(str(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const isoDate = (value: unknown) => new Date(str(value)).toISOString();
export type CrmApi = (action: CrmAction, params?: Row) => Promise<CrmResult>;

export function useCrmApi(connectionId: string) {
  const { logout } = useUserAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const api: CrmApi = (action, params) =>
    executeUserCrm(connectionId, { action, params });
  const mutate = async (
    fn: () => Promise<void>,
    message = 'Saved to HighLevel.',
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      if (e instanceof UnauthorizedError) logout();
      else
        setError(
          e instanceof Error ? e.message : 'Could not save this change.',
        );
    } finally {
      setBusy(false);
    }
  };
  return {
    api,
    busy,
    error,
    notice,
    mutate,
    clear: () => {
      setError(null);
      setNotice(null);
    },
  };
}
export function Feedback({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
    </>
  );
}
export function LoadState({
  state,
  children,
}: {
  state: {
    loading: boolean;
    error: string | null;
    notFound: boolean;
    reload: () => void;
  };
  children: ReactNode;
}) {
  if (state.loading) return <LoadingBlock label="Loading live CRM data" />;
  if (state.notFound)
    return (
      <ResourceNotFound
        kind="CRM record"
        backTo="/dashboard/crm"
        backLabel="CRM"
      />
    );
  if (state.error)
    return <ErrorBlock message={state.error} onRetry={state.reload} />;
  return <>{children}</>;
}
export function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ops-panel crm-panel">
      <div className="ops-panel-head">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className="ops-panel-body">{children}</div>
    </section>
  );
}

/** Native modal supplies focus containment, Escape handling, and focus restoration. */
export function CrmDrawer({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus !== document.body &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      } else {
        document.querySelector<HTMLElement>('.crm-page-content')?.focus();
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="crm-drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="crm-drawer-header">
        <div>
          <span className="crm-eyebrow">HighLevel CRM</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Close ${title}`}
          disabled={busy}
          onClick={onClose}
        >
          ✕
        </Button>
      </div>
      <div className="crm-drawer-body">{children}</div>
    </dialog>
  );
}

export function ContactPicker({
  api,
  value,
  onChange,
  disabled = false,
}: {
  api: CrmApi;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setCursor(undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const state = useUserAsync(
    () => api('contacts.list', { query: search, cursor, limit: 50 }),
    [search, cursor],
  );
  const contacts = rows(state.data?.contacts);
  return (
    <div className="crm-contact-picker">
      <Input
        aria-label="Search contacts for selection"
        placeholder="Search contacts by name, phone, or email"
        maxLength={120}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />
      <Select
        aria-label="Select CRM contact"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || state.loading || !!state.error}
      >
        <option value="">Select a contact</option>
        {value && !contacts.some((c) => c.id === value) && (
          <option value={value}>Selected contact · {value}</option>
        )}
        {contacts.map((c) => (
          <option key={str(c.id)} value={str(c.id)}>
            {label(c)}
            {c.phone ? ` · ${str(c.phone)}` : ''}
          </option>
        ))}
      </Select>
      {state.loading && <small>Loading contacts…</small>}
      {state.error && (
        <Alert tone="error">
          {state.error}{' '}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={state.reload}
          >
            Retry
          </Button>
        </Alert>
      )}
      {Boolean(state.data?.nextCursor) && !state.loading && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => setCursor(str(state.data?.nextCursor))}
        >
          More contacts
        </Button>
      )}
    </div>
  );
}

export type FormField = {
  key: string;
  label: string;
  type?: 'email' | 'number' | 'datetime-local' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: { id: string; name: string }[];
  hint?: string;
};
export function RecordForm({
  title,
  fields,
  initial = {},
  busy,
  onSubmit,
  onCancel,
  children,
  error = null,
}: {
  title: string;
  fields: FormField[];
  initial?: Row;
  busy: boolean;
  onSubmit: (data: Row) => void;
  onCancel: () => void;
  children?: ReactNode;
  error?: string | null;
}) {
  const [values, setValues] = useState<Row>(initial);
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (error) {
      form.current
        ?.closest<HTMLElement>('.crm-drawer-body')
        ?.scrollTo({ top: 0 });
    }
  }, [error]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };
  return (
    <CrmDrawer title={title} onClose={onCancel} busy={busy}>
      <form ref={form} className="ops-form crm-record-form" onSubmit={submit}>
        <Feedback error={error} notice={null} />
        <div className="crm-form-grid">
          {fields.map((field) => {
            const id = `${formId}-${field.key}`;
            const props = {
              id,
              required: field.required,
              disabled: busy,
              value: str(values[field.key]),
              onChange: (e: { target: { value: string } }) =>
                setValues((v) => ({ ...v, [field.key]: e.target.value })),
            };
            return (
              <Field
                key={field.key}
                htmlFor={id}
                label={field.label}
                required={field.required}
                hint={field.hint}
                className={
                  field.type === 'textarea'
                    ? 'crm-field-wide'
                    : field.type === 'checkbox'
                      ? 'crm-checkbox-field'
                      : undefined
                }
              >
                {field.type === 'checkbox' ? (
                  <input
                    id={id}
                    type="checkbox"
                    disabled={busy}
                    checked={values[field.key] === true}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [field.key]: e.target.checked,
                      }))
                    }
                  />
                ) : field.options ? (
                  <Select {...props}>
                    <option value="">Select…</option>
                    {field.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                ) : field.type === 'textarea' ? (
                  <Textarea {...props} rows={4} maxLength={10000} />
                ) : (
                  <Input
                    {...props}
                    type={field.type ?? 'text'}
                    min={field.type === 'number' ? 0 : undefined}
                    step={field.type === 'number' ? 'any' : undefined}
                    maxLength={field.type ? undefined : 255}
                  />
                )}
              </Field>
            );
          })}
        </div>
        {children}
        <div className="crm-form-footer">
          <p className="ops-desk-note">Changes save directly to HighLevel.</p>
          <div className="ops-row-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </CrmDrawer>
  );
}
