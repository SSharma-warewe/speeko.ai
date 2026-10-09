import { SavedSpeechEditor } from './SavedSpeechEditor';
import { ToolWaitingEditor } from './ToolWaitingEditor';
import { syncToolWaiting } from '../../lib/tool-waiting';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from '@call-agent/ui';
import {
  VOICE_TASK_CHECKS,
  WHATSAPP_TASK_CHECKS,
  WHATSAPP_AGENT_TOOL_IDS,
  whatsAppTaskDefinitionErrors,
  compileWhatsAppTaskInstructions,
  whatsAppTaskCompletionSchema,
  compileVoiceTaskInstructions,
  voiceTaskDefinitionErrors,
  type VoiceTaskField,
  type KnownToolId,
  type Agent,
} from '@call-agent/contracts';
import {
  ApiError,
  getOrgAssignedTools,
  listOrgAgents,
  listUserAgents,
  listOrganizations,
  listAdminKnownTools,
  listUserKnownTools,
} from '../../lib/api';
import {
  taskStudioClient,
  whatsappDefinition,
  voiceDefinition,
  type TaskEditorDefinition,
  type TaskEditorRecord,
  type TaskEditorVersion,
} from '../../lib/task-studio';
import { WhatsAppTaskTestChat } from './WhatsAppTaskTestChat';
import { PageHeader } from './PageHeader';
import { LoadingBlock } from './LoadingBlock';
import { ResourceNotFound } from './ResourceNotFound';

const emptyDefinition = (): TaskEditorDefinition => ({
  name: 'New voice task',
  description: '',
  objective: 'Help the caller with their request.',
  directions: ['inbound', 'outbound'],
  phases: [
    {
      title: 'Conversation',
      instructions:
        'Ask what the caller needs, then help using available facts and tools.',
      fieldKeys: [],
      toolIds: [],
    },
  ],
  contextFields: [],
  resultFields: [],
  outcomes: [
    {
      key: 'COMPLETED',
      description: 'Request resolved',
      requiredFields: [],
      checks: ['usable_answer'],
    },
  ],
  toolIds: [],
});
const blankField = (): VoiceTaskField => ({
  key: '',
  description: '',
  type: 'string',
});
const checkLabels: Record<string, string> = {
  usable_customer_message: 'Require an actual customer message',
  explicit_refusal: 'Require explicit customer refusal evidence',
  usable_answer: 'Require an actual caller answer',
  personal_loan_interest: 'Validate loan interest answer',
  property_interest: 'Validate property interest answer',
  visit_attendance: 'Validate attendance answer',
  loan_collection: 'Validate collection answers',
  booking_receipt: 'Require a successful real booking',
};
const toggled = <T,>(values: T[], item: T) =>
  values.includes(item) ? values.filter((v) => v !== item) : [...values, item];

const editorSections = [
  { id: 'overview', title: 'Overview', detail: 'Purpose & direction' },
  { id: 'phases', title: 'Conversation', detail: 'Guide each phase' },
  { id: 'speech', title: 'Saved speech', detail: 'Sentences and tool waiting' },
  { id: 'fields', title: 'Data collection', detail: 'Context & results' },
  { id: 'outcomes', title: 'Completion', detail: 'Outcomes & requirements' },
  { id: 'tools', title: 'Capabilities', detail: 'Available actions' },
  { id: 'preview', title: 'Preview', detail: 'Prompt & result schema' },
  { id: 'test', title: 'Test draft', detail: 'Try a conversation' },
  { id: 'history', title: 'Version history', detail: 'Published releases' },
] as const;
type EditorSection = (typeof editorSections)[number]['id'];
type LibraryFilter = 'all' | 'own' | 'templates' | 'archived';

function TaskGlyph({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`voice-task-glyph${small ? ' is-small' : ''}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </svg>
    </span>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="voice-task-section-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function FieldsEditor({
  title,
  fields,
  onChange,
  disabled,
  hidden,
}: {
  title: string;
  fields: VoiceTaskField[];
  onChange: (
    fields: VoiceTaskField[],
    rename?: { from: string; to?: string },
  ) => void;
  disabled: boolean;
  hidden?: boolean;
}) {
  const [expandedField, setExpandedField] = useState<number | null>(null);
  const patch = (i: number, change: Partial<VoiceTaskField>) =>
    onChange(
      fields.map((f, n) => (n === i ? { ...f, ...change } : f)),
      change.key !== undefined
        ? { from: fields[i].key, to: change.key }
        : undefined,
    );
  return (
    <section className="ops-panel" hidden={hidden}>
      <div className="ops-panel-head">
        <SectionHeading
          title={title}
          description={
            title === 'Input context'
              ? 'The facts your agent receives before the conversation starts.'
              : 'The information your agent should capture during the conversation.'
          }
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setExpandedField(fields.length);
            onChange([...fields, blankField()]);
          }}
        >
          Add field
        </Button>
      </div>
      <div className="ops-panel-body ops-stack">
        {fields.map((f, i) => (
          <details
            key={i}
            className="voice-task-field-detail"
            open={expandedField === i}
            onToggle={(e) => {
              if (e.currentTarget.open) setExpandedField(i);
              else
                setExpandedField((current) => (current === i ? null : current));
            }}
          >
            <summary>
              <span className="voice-task-step">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="voice-task-field-summary">
                <strong>{f.key || 'Untitled field'}</strong>
                <small>
                  {f.description && f.description !== f.key
                    ? f.description
                    : `${f.required ? 'Required' : 'Optional'} ${title === 'Input context' ? 'context' : 'result'} field`}
                </small>
              </span>
              <span className="voice-task-type">{f.type}</span>
              {f.required && <Badge tone="amber">Required</Badge>}
            </summary>
            <fieldset className="voice-task-card" disabled={disabled}>
              <legend>
                <span className="voice-task-step">
                  {String(i + 1).padStart(2, '0')}
                </span>{' '}
                {f.key || 'Untitled field'}{' '}
                <span className="voice-task-type">{f.type}</span>
              </legend>
              <div className="ops-two-col">
                <Field label="Key">
                  <Input
                    aria-label={`${title} field ${i + 1} key`}
                    value={f.key}
                    onChange={(e) => patch(i, { key: e.target.value })}
                  />
                </Field>
                <Field label="Type">
                  <Select
                    aria-label={`${title} field ${i + 1} type`}
                    value={f.type}
                    onChange={(e) => {
                      const next = {
                        ...f,
                        type: e.target.value as VoiceTaskField['type'],
                      };
                      delete next.defaultValue;
                      delete next.enumValues;
                      if (next.type === 'enum') next.enumValues = [];
                      onChange(fields.map((v, n) => (n === i ? next : v)));
                    }}
                  >
                    {['string', 'number', 'boolean', 'enum'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Collection instructions / description">
                <Textarea
                  aria-label={`${title} field ${i + 1} description`}
                  rows={2}
                  value={f.description}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
              </Field>
              {f.type === 'enum' && (
                <Field label="Allowed values (comma separated)">
                  <Input
                    aria-label={`${title} field ${i + 1} allowed values`}
                    value={f.enumValues?.join(', ') || ''}
                    onChange={(e) =>
                      patch(i, {
                        enumValues: e.target.value
                          .split(',')
                          .map((v) => v.trim()),
                      })
                    }
                  />
                </Field>
              )}
              {title === 'Input context' && (
                <Field label="Optional default">
                  <Input
                    aria-label={`Context field ${i + 1} default`}
                    value={
                      f.defaultValue === undefined ? '' : String(f.defaultValue)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        const next = { ...f };
                        delete next.defaultValue;
                        onChange(fields.map((v, n) => (n === i ? next : v)));
                      } else
                        patch(i, {
                          defaultValue:
                            f.type === 'number'
                              ? Number(raw)
                              : f.type === 'boolean'
                                ? raw === 'true'
                                : raw,
                        });
                    }}
                    placeholder={
                      f.type === 'boolean' ? 'true or false' : 'No default'
                    }
                  />
                </Field>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={f.required || false}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />{' '}
                Required for{' '}
                {title === 'Input context'
                  ? 'starting the task'
                  : 'every outcome'}
              </label>
              <Button
                type="button"
                size="sm"
                variant="dangerGhost"
                onClick={() =>
                  onChange(
                    fields.filter((_, n) => n !== i),
                    { from: f.key },
                  )
                }
              >
                Remove field
              </Button>
            </fieldset>
          </details>
        ))}
        {!fields.length && (
          <div className="voice-task-empty-inline">
            <TaskGlyph small />
            <h3>
              {title === 'Input context'
                ? 'Start with the right context'
                : 'Capture what matters'}
            </h3>
            <p>
              {title === 'Input context'
                ? 'Add details like a customer’s name or appointment date to personalize the conversation.'
                : 'Add fields for the answers you want to see in your task results.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function TaskStudio({
  admin = false,
  channel = 'voice',
}: {
  admin?: boolean;
  channel?: 'voice' | 'whatsapp';
}) {
  const whatsapp = channel === 'whatsapp';
  const createDefinition = (): TaskEditorDefinition =>
    whatsapp
      ? {
          ...emptyDefinition(),
          name: 'New WhatsApp task',
          objective: 'Help the customer with their request.',
          phases: [
            {
              title: 'Conversation',
              instructions:
                'Ask what the customer needs, then help using available facts and tools.',
              fieldKeys: [],
              toolIds: [],
            },
          ],
          outcomes: [
            {
              key: 'COMPLETED',
              description: 'Request resolved',
              requiredFields: [],
              checks: ['usable_customer_message'],
              terminalStatus: 'completed',
            },
          ],
        }
      : emptyDefinition();
  const { orgId, taskId } = useParams();
  const navigate = useNavigate();
  const client = useMemo(
    () => taskStudioClient(channel, admin, orgId),
    [channel, admin, orgId],
  );
  const libraryBase = admin
    ? orgId
      ? `/admin-dashboard/organizations/${orgId}/tasks`
      : '/admin-dashboard/tasks'
    : '/dashboard/tasks';
  const base = whatsapp ? `${libraryBase}/whatsapp` : libraryBase;
  const libraryUrl = whatsapp ? `${libraryBase}?channel=whatsapp` : libraryBase;
  const [rows, setRows] = useState<TaskEditorRecord[]>([]);
  const [record, setRecord] = useState<TaskEditorRecord | null>(null);
  const [draft, setDraft] = useState<TaskEditorDefinition>(createDefinition);
  const [history, setHistory] = useState<TaskEditorVersion[]>([]);
  const [tools, setTools] = useState<KnownToolId[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [testOrg, setTestOrg] = useState(orgId || '');
  const [testAgent, setTestAgent] = useState('');
  const [testContext, setTestContext] = useState('{}');
  const [meetUrl, setMeetUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeSection, setActiveSection] = useState<EditorSection>('overview');
  const [search, setSearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const dirty =
    record && JSON.stringify(draft) !== JSON.stringify(record.draft);
  const owned =
    record?.organizationId ===
      (admin && !orgId ? null : orgId || record?.organizationId) &&
    !(record?.organizationId === null && (!admin || orgId));
  const editable = !!owned && !record?.archived && !busy;
  const errors = whatsapp
    ? whatsAppTaskDefinitionErrors(whatsappDefinition(draft))
    : voiceTaskDefinitionErrors(voiceDefinition(draft));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMissing(false);
    setError('');
    setRecord(null);
    setMeetUrl('');
    setNotice('');
    setActiveSection('overview');
    Promise.all([
      client.list(),
      taskId ? client.get(taskId) : Promise.resolve(null),
      taskId ? client.history(taskId) : Promise.resolve([]),
    ])
      .then(([list, row, versions]) => {
        if (active) {
          setRows(list);
          setRecord(row);
          if (row) setDraft(row.draft);
          setHistory(versions);
        }
      })
      .catch((e) => {
        if (active) {
          setMissing(e instanceof ApiError && e.status === 404);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, taskId]);
  useEffect(() => {
    let active = true;
    const request = admin
      ? orgId
        ? getOrgAssignedTools(orgId).then((r) => r.toolIds)
        : listAdminKnownTools().then((r) => r.toolIds)
      : listUserKnownTools().then((r) => r.toolIds);
    request
      .then((ids) => {
        if (active)
          setTools(
            (whatsapp
              ? ids.filter((id) =>
                  (WHATSAPP_AGENT_TOOL_IDS as readonly string[]).includes(id),
                )
              : ids) as KnownToolId[],
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (admin && !orgId)
      listOrganizations()
        .then((r) => {
          if (active) setOrganizations(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [admin, orgId, whatsapp]);
  useEffect(() => {
    let active = true;
    setAgents([]);
    setTestAgent('');
    const org = orgId || testOrg;
    if (whatsapp || (admin && !org)) return;
    (admin ? listOrgAgents(org) : listUserAgents())
      .then((r) => {
        if (active) setAgents(r.filter((a) => a.isActive));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [admin, orgId, testOrg, whatsapp]);
  const act = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save task');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!record) throw new Error('Select a task');
    const row = dirty
      ? await client.save(record.id, record.draftRevision, draft)
      : record;
    setRecord(row);
    setDraft(row.draft);
    return row;
  };
  const patch = (change: Partial<TaskEditorDefinition>) =>
    setDraft((d) => {
      const next = { ...d, ...change };
      return whatsapp ? next : syncToolWaiting(voiceDefinition(next));
    });
  const updateFields = (
    kind: 'contextFields' | 'resultFields',
    next: VoiceTaskField[],
    rename?: { from: string; to?: string },
  ) => {
    const refs = (keys: string[]) =>
      rename
        ? keys.flatMap((k) =>
            k === rename.from ? (rename.to ? [rename.to] : []) : [k],
          )
        : keys;
    setDraft((d) => ({
      ...d,
      [kind]: next,
      phases: d.phases.map((p) => ({ ...p, fieldKeys: refs(p.fieldKeys) })),
      outcomes:
        kind === 'resultFields'
          ? d.outcomes.map((o) => ({
              ...o,
              requiredFields: refs(o.requiredFields),
            }))
          : d.outcomes,
    }));
  };
  const selectedAgent = agents.find((a) => a.id === testAgent);
  const incompatible = selectedAgent
    ? draft.toolIds.filter(
        (id) => id !== 'endCall' && !selectedAgent.enabledTools?.includes(id),
      )
    : [];
  const visibleRows = rows.filter((r) => {
    if (libraryFilter === 'archived' ? !r.archived : r.archived) return false;
    if (libraryFilter === 'own' && r.organizationId === null) return false;
    if (libraryFilter === 'templates' && r.organizationId !== null)
      return false;
    const definition = r.published?.definition || r.draft;
    return `${definition.name} ${definition.description} ${definition.objective}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });
  const sectionCounts: Partial<Record<EditorSection, number>> = {
    phases: draft.phases.length,
    speech: draft.savedSpeech?.sentences.length ?? 0,
    fields: draft.contextFields.length + draft.resultFields.length,
    outcomes: draft.outcomes.length,
    tools: draft.toolIds.length,
    history: history.length,
  };
  if (loading) return <LoadingBlock label="Loading tasks" />;
  if (missing)
    return (
      <ResourceNotFound kind="Task" backTo={libraryUrl} backLabel="All tasks" />
    );
  return (
    <div className="ops-stack voice-tasks">
      <nav className="ops-tabs" aria-label="Task channel">
        <Link
          className={'ops-tab' + (!whatsapp ? ' is-active' : '')}
          to={libraryBase}
        >
          Voice
        </Link>
        <Link
          className={'ops-tab' + (whatsapp ? ' is-active' : '')}
          to={libraryBase + '?channel=whatsapp'}
        >
          WhatsApp
        </Link>
      </nav>
      <PageHeader
        eyebrow={
          admin && !orgId
            ? 'Platform templates'
            : whatsapp
              ? 'WhatsApp workflows'
              : 'Voice workflows'
        }
        title={record ? draft.name : 'Give every conversation a purpose.'}
        description={
          record
            ? 'Shape the conversation and define its completion requirements.'
            : `Build ${channel} workflows your agents can follow. Start with a template, or make something your own.`
        }
        actions={
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const row = await client.create(createDefinition());
                navigate(`${base}/${row.id}`);
              })
            }
          >
            <span aria-hidden="true">＋</span> Create task
          </Button>
        }
      />
      {error && (
        <Alert tone="error">
          {error}
          {error.toLowerCase().includes('revision') &&
            ' Your edits are preserved. Reload the task in another tab and compare before saving again.'}
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!record ? (
        <div className="voice-task-library">
          <div className="voice-task-library-bar">
            <div
              className="ops-tabs voice-task-filters"
              role="group"
              aria-label="Filter tasks"
            >
              {(
                [
                  ['all', 'All tasks'],
                  ['own', 'Organization tasks'],
                  ['templates', 'Templates'],
                  ['archived', 'Archived'],
                ] as const
              )
                .filter(([id]) => !(admin && !orgId && id === 'own'))
                .map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`ops-tab${libraryFilter === id ? ' is-active' : ''}`}
                    aria-pressed={libraryFilter === id}
                    onClick={() => setLibraryFilter(id)}
                  >
                    {label}
                    <span className="voice-task-filter-count">
                      {
                        rows.filter((r) =>
                          id === 'archived'
                            ? r.archived
                            : !r.archived &&
                              (id === 'all' ||
                                (id === 'own'
                                  ? r.organizationId !== null
                                  : r.organizationId === null)),
                        ).length
                      }
                    </span>
                  </button>
                ))}
            </div>
            <div className="voice-task-search">
              <Input
                type="search"
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="voice-task-library-caption">
            <span>
              {libraryFilter === 'templates'
                ? 'A head start for your next workflow'
                : libraryFilter === 'archived'
                  ? 'Archived workflows'
                  : 'Your workflow library'}
            </span>
            <span>
              {visibleRows.length} {visibleRows.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <div className="voice-task-grid">
            {visibleRows.map((r) => {
              const definition = r.published?.definition || r.draft;
              return (
                <article
                  key={r.id}
                  className={`voice-task-library-card${r.archived ? ' is-archived' : ''}`}
                >
                  <div className="voice-task-library-card-top">
                    <TaskGlyph />
                    <Badge
                      tone={
                        r.archived
                          ? 'neutral'
                          : r.publishedVersion
                            ? 'amber'
                            : 'neutral'
                      }
                    >
                      {r.archived
                        ? 'Archived'
                        : r.publishedVersion
                          ? `Published · v${r.publishedVersion}`
                          : 'Draft'}
                    </Badge>
                  </div>
                  <div className="voice-task-library-card-copy">
                    <p className="voice-task-kicker">
                      {r.organizationId
                        ? 'Organization task'
                        : 'Platform template'}
                    </p>
                    <h2>
                      <Link to={`${base}/${r.id}`}>
                        {definition.name}
                        <span aria-hidden="true">↗</span>
                      </Link>
                    </h2>
                    <p>{definition.description || definition.objective}</p>
                  </div>
                  <div className="voice-task-library-card-meta">
                    <span>
                      {definition.phases.length}{' '}
                      {definition.phases.length === 1 ? 'phase' : 'phases'}
                    </span>
                    <span>
                      {definition.resultFields.length} result{' '}
                      {definition.resultFields.length === 1
                        ? 'field'
                        : 'fields'}
                    </span>
                  </div>
                  <div className="voice-task-library-card-footer">
                    <span className="voice-task-directions">
                      {(whatsapp ? ['WhatsApp'] : definition.directions).map(
                        (d) => (
                          <span key={d}>
                            {whatsapp
                              ? 'WhatsApp'
                              : d === 'inbound'
                                ? '↙ Inbound'
                                : '↗ Outbound'}
                          </span>
                        ),
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || r.archived}
                      onClick={() =>
                        void act(async () => {
                          const row = await client.clone(r.id);
                          navigate(`${base}/${row.id}`);
                        })
                      }
                    >
                      Clone task
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {!visibleRows.length && !error && (
            <div className="voice-task-library-empty">
              <TaskGlyph />
              <h2>
                {search
                  ? 'No matching tasks'
                  : libraryFilter === 'archived'
                    ? 'No archived tasks'
                    : 'Make room for a better conversation'}
              </h2>
              <p>
                {search
                  ? 'Try a different name or clear your search.'
                  : libraryFilter === 'archived'
                    ? 'Tasks you archive will appear here.'
                    : 'Create a task from scratch or explore the platform templates.'}
              </p>
              {(search || libraryFilter !== 'all') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setLibraryFilter('all');
                  }}
                >
                  View all tasks
                </Button>
              )}
            </div>
          )}
          <div className="voice-task-library-note">
            <span aria-hidden="true">◇</span>
            <p>
              <strong>Design once. Use across your agents.</strong> Publish a
              task to assign it to an agent. Each session keeps the version it
              started with.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="voice-task-row voice-task-record-bar">
            <Link to={libraryUrl}>← Task library</Link>
            <span>
              Revision {record.draftRevision} ·{' '}
              {record.archived
                ? 'Archived'
                : record.publishedVersion
                  ? `Published v${record.publishedVersion}`
                  : 'Unpublished draft'}
              {dirty ? ' · Unsaved edits' : ''}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || record.archived}
              onClick={() =>
                void act(async () => {
                  const row = await client.clone(record.id);
                  navigate(`${base}/${row.id}`);
                })
              }
            >
              Clone
            </Button>
          </div>
          {owned && (
            <div className="voice-task-actions">
              <div className="voice-task-save-state" role="status">
                <span
                  className={`voice-task-save-dot${dirty ? ' is-dirty' : ''}`}
                />
                <span>
                  <strong>
                    {busy
                      ? 'Working…'
                      : record.archived
                        ? 'Task archived'
                        : dirty
                          ? 'Unsaved changes'
                          : 'Draft is saved'}
                  </strong>
                  <small>
                    {record.publishedVersion
                      ? `Live version ${record.publishedVersion} stays unchanged until you publish.`
                      : 'Publish when you’re ready to use this task.'}
                  </small>
                </span>
              </div>
              <div className="voice-task-actions-buttons">
                <Button
                  variant="secondary"
                  disabled={!editable || !!errors.length}
                  onClick={() =>
                    void act(async () => {
                      await save();
                      setNotice(
                        'Draft saved. Published versions are unchanged.',
                      );
                    })
                  }
                >
                  Save draft
                </Button>
                <Button
                  disabled={!editable || !!errors.length}
                  onClick={() =>
                    void act(async () => {
                      const row = await save();
                      const published = await client.publish(
                        row.id,
                        row.draftRevision,
                      );
                      setRecord(published);
                      setHistory(await client.history(row.id));
                      setNotice(
                        `Published version ${published.publishedVersion}. You can now assign it to an agent.`,
                      );
                    })
                  }
                >
                  Publish version
                </Button>
                <Button
                  variant="dangerGhost"
                  disabled={!editable}
                  onClick={() =>
                    void act(async () => {
                      const row = await client.archive(record.id);
                      setRecord(row);
                      setActiveSection('history');
                      setNotice(
                        'Archived. Historical sessions retain their saved versions.',
                      );
                    })
                  }
                >
                  Archive
                </Button>
              </div>
            </div>
          )}
          {!!errors.length && (
            <Alert tone="warn">
              <strong>Review before publishing</strong>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
          {!owned && (
            <Alert tone="info">
              Clone this platform template to edit your organization’s workflow.
            </Alert>
          )}
          <div className="voice-task-workspace">
            <aside className="voice-task-rail">
              <p className="voice-task-kicker">Task studio</p>
              <nav aria-label="Task editor sections">
                {editorSections
                  .filter(
                    (s) =>
                      (!whatsapp || s.id !== 'speech') &&
                      (s.id !== 'test' || (owned && !record.archived)),
                  )
                  .map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`voice-task-nav-item${activeSection === s.id ? ' is-active' : ''}`}
                      aria-current={activeSection === s.id ? 'true' : undefined}
                      aria-controls={`voice-task-${s.id}`}
                      onClick={() => setActiveSection(s.id)}
                    >
                      <span className="voice-task-nav-index">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <small>{s.detail}</small>
                      </span>
                      {sectionCounts[s.id] !== undefined && (
                        <span className="voice-task-nav-count">
                          {sectionCounts[s.id]}
                        </span>
                      )}
                    </button>
                  ))}
              </nav>
              <div className="voice-task-rail-note">
                <span className="voice-task-kicker">
                  {record.archived
                    ? 'Archived task'
                    : owned
                      ? 'Working draft'
                      : 'Platform template'}
                </span>
                <p>
                  {record.archived
                    ? 'Past sessions keep their saved task versions.'
                    : owned
                      ? 'Your edits stay in the draft until you publish a new version.'
                      : 'Clone this template to make it your own.'}
                </p>
              </div>
            </aside>
            <div className="voice-task-workspace-main">
              <fieldset disabled={!editable} className="voice-task-editor">
                <section
                  className="ops-panel"
                  id="voice-task-overview"
                  hidden={activeSection !== 'overview'}
                >
                  <div className="ops-panel-head">
                    <SectionHeading
                      title="Define the purpose"
                      description="Tell your agent what to achieve and where this task can run."
                    />
                    <TaskGlyph small />
                  </div>
                  <div className="ops-panel-body ops-form">
                    <Field label="Task name">
                      <Input
                        aria-label="Task name"
                        value={draft.name}
                        onChange={(e) => patch({ name: e.target.value })}
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        aria-label="Description"
                        rows={2}
                        value={draft.description}
                        onChange={(e) => patch({ description: e.target.value })}
                      />
                    </Field>
                    <Field label="Objective">
                      <Textarea
                        aria-label="Objective"
                        rows={3}
                        value={draft.objective}
                        onChange={(e) => patch({ objective: e.target.value })}
                      />
                    </Field>
                    <div
                      hidden={whatsapp}
                      className="voice-task-direction-picker"
                      role="group"
                      aria-label="Call directions"
                    >
                      {(['inbound', 'outbound'] as const).map((d) => (
                        <label
                          key={d}
                          className={`voice-task-direction${draft.directions.includes(d) ? ' is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={draft.directions.includes(d)}
                            onChange={() =>
                              patch({
                                directions: toggled(draft.directions, d),
                              })
                            }
                          />{' '}
                          <span>
                            <strong>
                              {d === 'inbound'
                                ? '↙ Inbound calls'
                                : '↗ Outbound calls'}
                            </strong>
                            <small>
                              {d === 'inbound'
                                ? 'When someone calls your agent'
                                : 'When your agent reaches out'}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
                <section
                  className="ops-panel"
                  id="voice-task-phases"
                  hidden={activeSection !== 'phases'}
                >
                  <div className="ops-panel-head">
                    <SectionHeading
                      title="Build the conversation"
                      description="A clear path from the first hello to the final answer."
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        patch({
                          phases: [
                            ...draft.phases,
                            {
                              title: '',
                              instructions: '',
                              fieldKeys: [],
                              toolIds: [],
                            },
                          ],
                        })
                      }
                    >
                      Add phase
                    </Button>
                  </div>
                  <div className="ops-panel-body ops-stack">
                    <p className="ops-muted">
                      Phases guide the conversation in order. Completion checks
                      enforce requirements.
                    </p>
                    {draft.phases.map((phase, i) => (
                      <fieldset
                        className="voice-task-card voice-task-phase"
                        key={i}
                      >
                        <legend>
                          <span className="voice-task-step">
                            {String(i + 1).padStart(2, '0')}
                          </span>{' '}
                          Phase {i + 1}
                        </legend>
                        <Field label="Title">
                          <Input
                            aria-label={`Phase ${i + 1} title`}
                            value={phase.title}
                            onChange={(e) =>
                              patch({
                                phases: draft.phases.map((p, n) =>
                                  n === i ? { ...p, title: e.target.value } : p,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Instructions">
                          <Textarea
                            aria-label={`Phase ${i + 1} instructions`}
                            rows={4}
                            value={phase.instructions}
                            onChange={(e) =>
                              patch({
                                phases: draft.phases.map((p, n) =>
                                  n === i
                                    ? { ...p, instructions: e.target.value }
                                    : p,
                                ),
                              })
                            }
                          />
                        </Field>
                        <div className="voice-task-row">
                          {[-1, 1].map((delta) => (
                            <Button
                              key={delta}
                              size="sm"
                              variant="secondary"
                              disabled={
                                i + delta < 0 ||
                                i + delta >= draft.phases.length
                              }
                              onClick={() => {
                                const phases = [...draft.phases];
                                [phases[i], phases[i + delta]] = [
                                  phases[i + delta],
                                  phases[i],
                                ];
                                patch({ phases });
                              }}
                            >
                              {delta < 0 ? 'Move up' : 'Move down'}
                            </Button>
                          ))}
                          <Button
                            size="sm"
                            variant="dangerGhost"
                            onClick={() =>
                              patch({
                                phases: draft.phases.filter((_, n) => n !== i),
                              })
                            }
                          >
                            Remove phase
                          </Button>
                        </div>
                        <details className="voice-task-phase-resources">
                          <summary>
                            Data & capabilities{' '}
                            <span>
                              {phase.fieldKeys.length} fields ·{' '}
                              {phase.toolIds.length} tools selected
                            </span>
                          </summary>
                          <div>
                            Fields:{' '}
                            {[
                              ...draft.contextFields,
                              ...draft.resultFields,
                            ].map((f) => (
                              <label key={f.key} className="voice-task-option">
                                <input
                                  type="checkbox"
                                  checked={phase.fieldKeys.includes(f.key)}
                                  onChange={() =>
                                    patch({
                                      phases: draft.phases.map((p, n) =>
                                        n === i
                                          ? {
                                              ...p,
                                              fieldKeys: toggled(
                                                p.fieldKeys,
                                                f.key,
                                              ),
                                            }
                                          : p,
                                      ),
                                    })
                                  }
                                />{' '}
                                {f.key}
                              </label>
                            ))}
                          </div>
                          {!whatsapp && (
                            <div>
                              Saved sentences:{' '}
                              {(draft.savedSpeech?.sentences ?? [])
                                .filter((s) => s.purpose !== 'toolWaiting')
                                .map((sentence, index) => (
                                  <label
                                    key={index}
                                    className="voice-task-option"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        phase.sentenceKeys?.includes(
                                          sentence.key,
                                        ) ?? false
                                      }
                                      onChange={() =>
                                        patch({
                                          phases: draft.phases.map((p, n) =>
                                            n === i
                                              ? {
                                                  ...p,
                                                  sentenceKeys: toggled(
                                                    p.sentenceKeys ?? [],
                                                    sentence.key,
                                                  ),
                                                }
                                              : p,
                                          ),
                                        })
                                      }
                                    />{' '}
                                    {sentence.key}
                                  </label>
                                ))}
                            </div>
                          )}
                          <div>
                            Tools:{' '}
                            {draft.toolIds.map((id) => (
                              <label key={id} className="voice-task-option">
                                <input
                                  type="checkbox"
                                  checked={phase.toolIds.includes(id)}
                                  onChange={() =>
                                    patch({
                                      phases: draft.phases.map((p, n) =>
                                        n === i
                                          ? {
                                              ...p,
                                              toolIds: toggled(p.toolIds, id),
                                            }
                                          : p,
                                      ),
                                    })
                                  }
                                />{' '}
                                {id}
                              </label>
                            ))}
                          </div>
                        </details>
                      </fieldset>
                    ))}
                  </div>
                </section>
                {!whatsapp && (
                  <div
                    hidden={activeSection !== 'speech'}
                    id="voice-task-speech"
                  >
                    <SavedSpeechEditor
                      definition={voiceDefinition(draft)}
                      onChange={(next) =>
                        patch({
                          savedSpeech: next.savedSpeech,
                          phases: next.phases,
                        })
                      }
                    />
                    <ToolWaitingEditor
                      definition={voiceDefinition(draft)}
                      onChange={(next) =>
                        patch({ savedSpeech: next.savedSpeech })
                      }
                    />
                  </div>
                )}
                <div
                  id="voice-task-fields"
                  hidden={activeSection !== 'fields'}
                  className="voice-task-field-panels"
                >
                  <FieldsEditor
                    title="Input context"
                    hidden={activeSection !== 'fields'}
                    fields={draft.contextFields}
                    onChange={(fields, rename) =>
                      updateFields('contextFields', fields, rename)
                    }
                    disabled={!editable}
                  />
                  <FieldsEditor
                    title="Result fields"
                    hidden={activeSection !== 'fields'}
                    fields={draft.resultFields}
                    onChange={(fields, rename) =>
                      updateFields('resultFields', fields, rename)
                    }
                    disabled={!editable}
                  />
                </div>
                <section
                  className="ops-panel"
                  id="voice-task-outcomes"
                  hidden={activeSection !== 'outcomes'}
                >
                  <div className="ops-panel-head">
                    <SectionHeading
                      title="Define a successful finish"
                      description="Choose how the task can end, and what each outcome requires."
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        patch({
                          outcomes: [
                            ...draft.outcomes,
                            {
                              key: '',
                              description: '',
                              requiredFields: [],
                              checks: whatsapp
                                ? ['usable_customer_message']
                                : ['usable_answer'],
                              ...(whatsapp
                                ? { terminalStatus: 'completed' as const }
                                : {}),
                            },
                          ],
                        })
                      }
                    >
                      Add outcome
                    </Button>
                  </div>
                  <div className="ops-panel-body ops-stack">
                    {draft.outcomes.map((o, i) => {
                      const update = (changes: Partial<typeof o>) =>
                        patch({
                          outcomes: draft.outcomes.map((v, n) =>
                            n === i ? { ...v, ...changes } : v,
                          ),
                        });
                      return (
                        <fieldset className="voice-task-card" key={i}>
                          <legend>
                            <span className="voice-task-step">
                              {String(i + 1).padStart(2, '0')}
                            </span>{' '}
                            {o.key || `Outcome ${i + 1}`}
                          </legend>
                          {whatsapp && (
                            <Field label="Terminal status">
                              <Select
                                value={o.terminalStatus ?? 'completed'}
                                onChange={(e) => {
                                  const terminalStatus = e.target.value as
                                    'completed' | 'cancelled';
                                  update({
                                    terminalStatus,
                                    checks:
                                      terminalStatus === 'cancelled' &&
                                      !o.checks.includes('explicit_refusal')
                                        ? [...o.checks, 'explicit_refusal']
                                        : o.checks,
                                  });
                                }}
                              >
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </Select>
                            </Field>
                          )}
                          <Field label="Outcome key">
                            <Input
                              aria-label={`Outcome ${i + 1} key`}
                              value={o.key}
                              onChange={(e) => update({ key: e.target.value })}
                            />
                          </Field>
                          <Field label="When to use">
                            <Textarea
                              aria-label={`Outcome ${i + 1} description`}
                              rows={2}
                              value={o.description}
                              onChange={(e) =>
                                update({ description: e.target.value })
                              }
                            />
                          </Field>
                          <div>
                            Required results:{' '}
                            {draft.resultFields.map((f) => (
                              <label key={f.key} className="voice-task-option">
                                <input
                                  type="checkbox"
                                  checked={o.requiredFields.includes(f.key)}
                                  onChange={() =>
                                    update({
                                      requiredFields: toggled(
                                        o.requiredFields,
                                        f.key,
                                      ),
                                    })
                                  }
                                />{' '}
                                {f.key}
                              </label>
                            ))}
                          </div>
                          <div>
                            {(whatsapp
                              ? WHATSAPP_TASK_CHECKS
                              : VOICE_TASK_CHECKS
                            ).map((check) => (
                              <label key={check} className="voice-task-option">
                                <input
                                  type="checkbox"
                                  checked={o.checks.includes(check)}
                                  onChange={() =>
                                    update({ checks: toggled(o.checks, check) })
                                  }
                                />{' '}
                                {checkLabels[check]}
                              </label>
                            ))}
                          </div>
                          <Button
                            size="sm"
                            variant="dangerGhost"
                            onClick={() =>
                              patch({
                                outcomes: draft.outcomes.filter(
                                  (_, n) => n !== i,
                                ),
                              })
                            }
                          >
                            Remove outcome
                          </Button>
                        </fieldset>
                      );
                    })}
                  </div>
                </section>
                <section
                  className="ops-panel"
                  id="voice-task-tools"
                  hidden={activeSection !== 'tools'}
                >
                  <div className="ops-panel-head">
                    <SectionHeading
                      title="Give your agent the right tools"
                      description="Select the actions this workflow needs. The agent must also have permission to use them."
                    />
                  </div>
                  <div className="ops-panel-body voice-task-capabilities">
                    {[...new Set([...tools, ...draft.toolIds])].map((id) => (
                      <label key={id} className="voice-task-option">
                        <input
                          type="checkbox"
                          checked={draft.toolIds.includes(id)}
                          disabled={
                            !tools.includes(id) && !draft.toolIds.includes(id)
                          }
                          onChange={() => {
                            const toolIds = toggled(draft.toolIds, id);
                            patch({
                              toolIds,
                              phases: draft.phases.map((p) => ({
                                ...p,
                                toolIds: p.toolIds.filter((t) =>
                                  toolIds.includes(t),
                                ),
                              })),
                            });
                          }}
                        />{' '}
                        <span>
                          <strong>
                            {id
                              .replace(/([a-z])([A-Z])/g, '$1 $2')
                              .replace(/Ghl/g, 'GHL')}
                          </strong>
                          <small>
                            {id}
                            {!tools.includes(id) ? ' · Unavailable' : ''}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </fieldset>
              <section
                className="ops-panel"
                id="voice-task-preview"
                hidden={activeSection !== 'preview'}
              >
                <div className="ops-panel-head">
                  <SectionHeading
                    title="See what your agent sees"
                    description="Review the instructions and the results this task will collect."
                  />
                </div>
                <div className="ops-panel-body">
                  <p className="voice-task-kicker">Conversation instructions</p>
                  <pre className="voice-task-preview">
                    {errors.length
                      ? 'Fix validation errors to preview the prompt.'
                      : whatsapp
                        ? compileWhatsAppTaskInstructions(
                            whatsappDefinition(draft),
                          )
                        : compileVoiceTaskInstructions(voiceDefinition(draft))}
                  </pre>
                  <p className="voice-task-kicker">
                    {whatsapp ? 'Completion schema' : 'Result schema'}
                  </p>
                  <pre className="voice-task-preview">
                    {JSON.stringify(
                      whatsapp
                        ? whatsAppTaskCompletionSchema(
                            whatsappDefinition(draft),
                          )
                        : {
                            resultFields: draft.resultFields,
                            outcomes: draft.outcomes,
                          },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </section>
              {owned && !record.archived && whatsapp && (
                <div hidden={activeSection !== 'test'}>
                  <WhatsAppTaskTestChat
                    admin={admin}
                    orgId={orgId}
                    taskId={record.id}
                    save={save}
                    toolIds={draft.toolIds}
                  />
                </div>
              )}
              {owned && !record.archived && !whatsapp && (
                <section
                  className="ops-panel"
                  id="voice-task-test"
                  hidden={activeSection !== 'test'}
                >
                  <div className="ops-panel-head">
                    <SectionHeading
                      title="Hear it in action"
                      description="Test your draft with an existing agent before publishing."
                    />
                  </div>
                  <div className="ops-panel-body ops-form">
                    <Alert tone="warn">
                      Tool-enabled tests can create real appointments. This test
                      uses the selected agent’s persona, voice and integrations.
                    </Alert>
                    {admin && !orgId && (
                      <Field label="Organization">
                        <Select
                          aria-label="Test organization"
                          value={testOrg}
                          onChange={(e) => setTestOrg(e.target.value)}
                        >
                          <option value="">Select organization</option>
                          {organizations.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <Field label="Agent">
                      <Select
                        aria-label="Test agent"
                        value={testAgent}
                        onChange={(e) => setTestAgent(e.target.value)}
                      >
                        <option value="">Select agent</option>
                        {agents
                          .filter((a) => draft.directions.includes(a.direction))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    {!!incompatible.length && (
                      <Alert tone="error">
                        This agent is missing capabilities:{' '}
                        {incompatible.join(', ')}. Update its tool profile
                        before testing.
                      </Alert>
                    )}
                    <Field label="Test context (JSON)">
                      <Textarea
                        aria-label="Test context"
                        rows={4}
                        value={testContext}
                        onChange={(e) => setTestContext(e.target.value)}
                      />
                    </Field>
                    <Button
                      disabled={
                        busy ||
                        !testAgent ||
                        !!errors.length ||
                        !!incompatible.length
                      }
                      onClick={() =>
                        void act(async () => {
                          const context: unknown = JSON.parse(testContext);
                          if (
                            !context ||
                            typeof context !== 'object' ||
                            Array.isArray(context)
                          )
                            throw new Error('Context must be a JSON object');
                          const row = await save();
                          const call = await client.test(
                            row.id,
                            row.draftRevision,
                            testAgent,
                            context as Record<string, unknown>,
                            testOrg,
                          );
                          setMeetUrl(call.meetUrl || '');
                          setNotice(
                            `Draft test created for revision ${row.draftRevision}.`,
                          );
                        })
                      }
                    >
                      Save and test draft
                    </Button>
                    {meetUrl && (
                      <a
                        href={meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Join draft test call
                      </a>
                    )}
                  </div>
                </section>
              )}
              <section
                className="ops-panel"
                id="voice-task-history"
                hidden={activeSection !== 'history'}
              >
                <div className="ops-panel-head">
                  <SectionHeading
                    title="Every release, preserved"
                    description="Published versions stay unchanged. Copy a previous version into a new draft to build on it."
                  />
                </div>
                <div className="ops-panel-body ops-stack">
                  {history.map((v) => (
                    <details key={v.version} className="voice-task-version">
                      <summary>
                        <Badge
                          tone={
                            v.version === record.publishedVersion
                              ? 'amber'
                              : 'neutral'
                          }
                        >
                          v{v.version}
                        </Badge>
                        <span>
                          <strong>{v.definition.name}</strong>
                          <small>
                            {new Date(v.publishedAt).toLocaleString()}
                          </small>
                        </span>
                        {v.version === record.publishedVersion && (
                          <span className="voice-task-version-current">
                            Current release
                          </span>
                        )}
                      </summary>
                      <pre className="voice-task-preview">
                        {JSON.stringify(v.definition, null, 2)}
                      </pre>
                      {editable && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setDraft(v.definition);
                            setActiveSection('overview');
                            setNotice(
                              'Version copied into the editor. Save and publish to create a new version.',
                            );
                          }}
                        >
                          Copy into draft
                        </Button>
                      )}
                    </details>
                  ))}
                  {!history.length && (
                    <p className="ops-muted">No published versions yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
