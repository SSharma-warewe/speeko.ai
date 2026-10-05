import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import {
  VOICE_TASK_CHECKS,
  compileVoiceTaskInstructions,
  voiceTaskDefinitionErrors,
  type VoiceTaskDefinition,
  type VoiceTaskField,
  type VoiceTaskRecord,
  type VoiceTaskVersion,
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
import { voiceTasksClient } from '../../lib/voice-tasks';
import { PageHeader } from '../components/PageHeader';
import { LoadingBlock } from '../components/LoadingBlock';
import { ResourceNotFound } from '../components/ResourceNotFound';

const emptyDefinition = (): VoiceTaskDefinition => ({
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
  usable_answer: 'Require an actual caller answer',
  personal_loan_interest: 'Validate loan interest answer',
  property_interest: 'Validate property interest answer',
  visit_attendance: 'Validate attendance answer',
  loan_collection: 'Validate collection answers',
  booking_receipt: 'Require a successful real booking',
};
const toggled = <T,>(values: T[], item: T) =>
  values.includes(item) ? values.filter((v) => v !== item) : [...values, item];

function FieldsEditor({
  title,
  fields,
  onChange,
  disabled,
}: {
  title: string;
  fields: VoiceTaskField[];
  onChange: (
    fields: VoiceTaskField[],
    rename?: { from: string; to?: string },
  ) => void;
  disabled: boolean;
}) {
  const patch = (i: number, change: Partial<VoiceTaskField>) =>
    onChange(
      fields.map((f, n) => (n === i ? { ...f, ...change } : f)),
      change.key !== undefined
        ? { from: fields[i].key, to: change.key }
        : undefined,
    );
  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>{title}</h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange([...fields, blankField()])}
        >
          Add field
        </Button>
      </div>
      <div className="ops-panel-body ops-stack">
        {fields.map((f, i) => (
          <fieldset key={i} className="voice-task-card" disabled={disabled}>
            <legend>Field {i + 1}</legend>
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
        ))}
        {!fields.length && <p className="ops-muted">No fields yet.</p>}
      </div>
    </section>
  );
}

export default function VoiceTasksPage({ admin = false }: { admin?: boolean }) {
  const { orgId, taskId } = useParams();
  const navigate = useNavigate();
  const client = useMemo(() => voiceTasksClient(admin, orgId), [admin, orgId]);
  const base = admin
    ? orgId
      ? `/admin-dashboard/organizations/${orgId}/tasks`
      : '/admin-dashboard/tasks'
    : '/dashboard/tasks';
  const [rows, setRows] = useState<VoiceTaskRecord[]>([]);
  const [record, setRecord] = useState<VoiceTaskRecord | null>(null);
  const [draft, setDraft] = useState<VoiceTaskDefinition>(emptyDefinition);
  const [history, setHistory] = useState<VoiceTaskVersion[]>([]);
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
  const dirty =
    record && JSON.stringify(draft) !== JSON.stringify(record.draft);
  const owned =
    record?.organizationId ===
      (admin && !orgId ? null : orgId || record?.organizationId) &&
    !(record?.organizationId === null && (!admin || orgId));
  const editable = !!owned && !record?.archived && !busy;
  const errors = voiceTaskDefinitionErrors(draft);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMissing(false);
    setError('');
    setRecord(null);
    setMeetUrl('');
    setNotice('');
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
        if (active) setTools(ids as KnownToolId[]);
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
  }, [admin, orgId]);
  useEffect(() => {
    let active = true;
    setAgents([]);
    setTestAgent('');
    const org = orgId || testOrg;
    if (admin && !org) return;
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
  }, [admin, orgId, testOrg]);
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
  const patch = (change: Partial<VoiceTaskDefinition>) =>
    setDraft((d) => ({ ...d, ...change }));
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
  if (loading) return <LoadingBlock label="Loading voice tasks" />;
  if (missing)
    return <ResourceNotFound kind="Task" backTo={base} backLabel="All tasks" />;
  return (
    <div className="ops-stack voice-tasks">
      <PageHeader
        eyebrow={admin && !orgId ? 'Platform templates' : 'Voice workflows'}
        title={record ? draft.name : 'Tasks'}
        description="Define objectives, conversation phases and completion requirements. Publish a version to assign it to calls and agents."
        actions={
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const row = await client.create(emptyDefinition());
                navigate(`${base}/${row.id}`);
              })
            }
          >
            Create task
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
        <section className="ops-panel">
          <div className="ops-panel-body ops-stack">
            {rows.map((r) => (
              <div key={r.id} className="voice-task-row">
                <Link to={`${base}/${r.id}`}>
                  {r.published?.definition.name || r.draft.name}
                </Link>
                <span className="ops-muted">
                  {r.archived
                    ? 'Archived'
                    : r.publishedVersion
                      ? `Published v${r.publishedVersion}`
                      : 'Draft'}{' '}
                  · {r.organizationId ? 'Organization' : 'Platform template'}
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
                  Clone
                </Button>
              </div>
            ))}
            {!rows.length && <p>No tasks yet. Create your first task.</p>}
          </div>
        </section>
      ) : (
        <>
          <div className="voice-task-row">
            <Link to={base}>← All tasks</Link>
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
          {!owned && (
            <Alert tone="info">
              Clone this platform template to edit your organization’s workflow.
            </Alert>
          )}
          <fieldset disabled={!editable} className="voice-task-editor">
            <section className="ops-panel">
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
                <div className="voice-task-row">
                  {(['inbound', 'outbound'] as const).map((d) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        checked={draft.directions.includes(d)}
                        onChange={() =>
                          patch({ directions: toggled(draft.directions, d) })
                        }
                      />{' '}
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            </section>
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>Conversation phases</h2>
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
                  <fieldset className="voice-task-card" key={i}>
                    <legend>Phase {i + 1}</legend>
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
                            i + delta < 0 || i + delta >= draft.phases.length
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
                    <div>
                      Fields:{' '}
                      {[...draft.contextFields, ...draft.resultFields].map(
                        (f) => (
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
                        ),
                      )}
                    </div>
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
                                    ? { ...p, toolIds: toggled(p.toolIds, id) }
                                    : p,
                                ),
                              })
                            }
                          />{' '}
                          {id}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>
            <FieldsEditor
              title="Input context"
              fields={draft.contextFields}
              onChange={(fields, rename) =>
                updateFields('contextFields', fields, rename)
              }
              disabled={!editable}
            />
            <FieldsEditor
              title="Result fields"
              fields={draft.resultFields}
              onChange={(fields, rename) =>
                updateFields('resultFields', fields, rename)
              }
              disabled={!editable}
            />
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>Outcomes and completion</h2>
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
                          checks: ['usable_answer'],
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
                      <legend>Outcome {i + 1}</legend>
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
                        {VOICE_TASK_CHECKS.map((check) => (
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
                            outcomes: draft.outcomes.filter((_, n) => n !== i),
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
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>Capabilities</h2>
              </div>
              <div className="ops-panel-body">
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
                    {id}
                    {!tools.includes(id) ? ' (unavailable)' : ''}
                  </label>
                ))}
              </div>
            </section>
          </fieldset>
          {!!errors.length && (
            <Alert tone="warn">
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
          {owned && (
            <div className="voice-task-row">
              <Button
                disabled={!editable || !!errors.length}
                onClick={() =>
                  void act(async () => {
                    await save();
                    setNotice('Draft saved. Published versions are unchanged.');
                  })
                }
              >
                Save draft
              </Button>
              <Button
                variant="secondary"
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
                      `Published version ${published.publishedVersion}. You can now assign it to an agent or call.`,
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
                    setNotice(
                      'Archived. Historical calls retain their saved versions.',
                    );
                  })
                }
              >
                Archive
              </Button>
            </div>
          )}
          <details className="ops-panel">
            <summary className="ops-panel-head">
              Prompt and result schema preview
            </summary>
            <div className="ops-panel-body">
              <pre className="voice-task-preview">
                {errors.length
                  ? 'Fix validation errors to preview the prompt.'
                  : compileVoiceTaskInstructions(draft)}
              </pre>
              <pre className="voice-task-preview">
                {JSON.stringify(
                  {
                    resultFields: draft.resultFields,
                    outcomes: draft.outcomes,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </details>
          {owned && !record.archived && (
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>Test draft</h2>
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
                    {incompatible.join(', ')}. Update its tool profile before
                    testing.
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
                  <a href={meetUrl} target="_blank" rel="noopener noreferrer">
                    Join draft test call
                  </a>
                )}
              </div>
            </section>
          )}
          <section className="ops-panel">
            <div className="ops-panel-head">
              <h2>Version history</h2>
            </div>
            <div className="ops-panel-body ops-stack">
              {history.map((v) => (
                <details key={v.version}>
                  <summary>
                    Version {v.version} ·{' '}
                    {new Date(v.publishedAt).toLocaleString()} ·{' '}
                    {v.definition.name}
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
        </>
      )}
    </div>
  );
}
