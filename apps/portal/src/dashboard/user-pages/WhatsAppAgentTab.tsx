import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  WHATSAPP_AGENT_TOOL_IDS,
  WHATSAPP_TASK_KEYS,
  WHATSAPP_TASKS,
  WHATSAPP_TASK_COMPLETION,
  type WhatsAppTaskKey,
  type Agent,
  type OrganizationIntegration,
  type ToolProfile,
} from '@call-agent/contracts';
import { Alert, Button, Field, Select, Textarea } from '@call-agent/ui';
import {
  ApiError,
  getUserWhatsAppAgent,
  listUserAgents,
  listUserOrgIntegrations,
  listUserKnownTools,
  listUserToolProfiles,
  UnauthorizedError,
  updateUserWhatsAppAgent,
} from '../../lib/api';
import { useUserAuth } from '../../lib/auth';
import { ErrorBlock } from '../components/ErrorBlock';
import { LoadingBlock } from '../components/LoadingBlock';
import './WhatsAppAgentTab.css';

const MAX_PROMPT_LENGTH = 20000;
const GHL_TOOL_IDS: ReadonlySet<string> = new Set(WHATSAPP_AGENT_TOOL_IDS);

const TOOL_LABELS: Record<string, string> = {
  checkGhlFreeSlots: 'Find available times',
  lookupGhlContact: 'Find contacts',
  upsertGhlContact: 'Create & update contacts',
  scheduleGhlMeeting: 'Book appointments',
};

function AgentIcon({
  name,
}: {
  name: 'chat' | 'calendar' | 'check' | 'arrow' | 'spark';
}) {
  const paths = {
    chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z M8 10h8 M8 14h5',
    calendar:
      'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 16l2 2 4-4',
    check: 'm5 12 4 4L19 6',
    arrow: 'M5 12h14 m-6-6 6 6-6 6',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

type Props = {
  hasWhatsApp: boolean;
  onGoConnections: () => void;
};

export default function WhatsAppAgentTab({
  hasWhatsApp,
  onGoConnections,
}: Props) {
  const { logout } = useUserAuth();
  const [taskKey, setTaskKey] = useState<WhatsAppTaskKey | null>(null);
  const [savedTaskKey, setSavedTaskKey] = useState<WhatsAppTaskKey | null>(
    null,
  );
  const [savedPrompt, setSavedPrompt] = useState('');
  const [draft, setDraft] = useState('');
  const [platformPrompt, setPlatformPrompt] = useState('');
  const [savedBookingAgentId, setSavedBookingAgentId] = useState<string | null>(
    null,
  );
  const [bookingAgentId, setBookingAgentId] = useState<string | null>(null);
  const [voiceAgents, setVoiceAgents] = useState<Agent[]>([]);
  const [toolProfiles, setToolProfiles] = useState<ToolProfile[]>([]);
  const [savedToolProfileId, setSavedToolProfileId] = useState<string | null>(
    null,
  );
  const [toolProfileId, setToolProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getUserWhatsAppAgent(),
      listUserAgents(),
      listUserOrgIntegrations(),
      listUserToolProfiles(),
      listUserKnownTools(),
    ])
      .then(([config, agents, integrations, profiles, knownTools]) => {
        if (!active) return;
        const prompt = config.systemPrompt ?? '';
        setTaskKey(config.taskKey);
        setSavedTaskKey(config.taskKey);
        setSavedPrompt(prompt);
        setDraft(prompt);
        setPlatformPrompt(config.platformPrompt);
        setSavedBookingAgentId(config.bookingVoiceAgentId);
        setBookingAgentId(config.bookingVoiceAgentId);
        setSavedToolProfileId(config.whatsappToolProfileId);
        setToolProfileId(config.whatsappToolProfileId);
        const assigned = new Set(knownTools.toolIds);
        setToolProfiles(
          profiles
            .map((profile) => ({
              ...profile,
              toolIds: profile.toolIds.filter((id) => assigned.has(id)),
            }))
            .filter((profile) => {
              const ids = new Set(profile.toolIds);
              return (
                ids.has('scheduleGhlMeeting') &&
                (!ids.has('scheduleGhlMeeting') ||
                  (ids.has('checkGhlFreeSlots') &&
                    (ids.has('lookupGhlContact') ||
                      ids.has('upsertGhlContact'))))
              );
            }),
        );
        const activeGhlIds = new Set(
          integrations
            .filter(
              (item: OrganizationIntegration) =>
                item.provider === 'ghl' && item.isActive,
            )
            .map((item) => item.id),
        );
        setVoiceAgents(
          agents.filter(
            (agent: Agent) =>
              agent.isActive &&
              agent.calendarIntegrationId &&
              activeGhlIds.has(agent.calendarIntegrationId),
          ),
        );
        setFormError(null);
        setSaved(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof UnauthorizedError) {
          logout();
          return;
        }
        setLoadError(
          err instanceof ApiError ? err.message : 'Failed to load agent',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hasWhatsApp, reloadKey, logout]);

  if (loading) return <LoadingBlock label="Loading agent" />;
  if (loadError) {
    return (
      <ErrorBlock
        message={loadError}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  const changed =
    taskKey !== savedTaskKey ||
    draft !== savedPrompt ||
    bookingAgentId !== savedBookingAgentId ||
    toolProfileId !== savedToolProfileId;
  const selectedProfile = toolProfiles.find(
    (profile) => profile.id === toolProfileId,
  );
  const selectedAgent = voiceAgents.find(
    (agent) => agent.id === bookingAgentId,
  );
  const savedProfile = toolProfiles.find(
    (profile) => profile.id === savedToolProfileId,
  );
  const savedAgent = voiceAgents.find(
    (agent) => agent.id === savedBookingAgentId,
  );
  const enabled =
    hasWhatsApp &&
    Boolean(savedPrompt.trim() && savedTaskKey && savedProfile && savedAgent);
  const setupSteps = [
    {
      label: 'Choose a task',
      detail: taskKey ? WHATSAPP_TASKS[taskKey].name : 'Give your agent a goal',
      complete: Boolean(taskKey),
      href: '#wa-agent-task',
    },
    {
      label: 'Write a persona',
      detail: draft.trim()
        ? 'Personality & rules added'
        : 'Make it sound like your business',
      complete: Boolean(draft.trim()),
      href: '#wa-agent-prompt',
    },
    {
      label: 'Assign booking tools',
      detail: selectedProfile?.name ?? 'Select a tool profile',
      complete: Boolean(selectedProfile),
      href: '#wa-agent-tools',
    },
    {
      label: 'Connect a calendar',
      detail: selectedAgent?.name ?? 'Select a voice agent',
      complete: Boolean(selectedAgent),
      href: '#wa-agent-booking',
    },
  ];
  const completedSteps = setupSteps.filter((step) => step.complete).length;
  const canSave =
    hasWhatsApp &&
    changed &&
    !submitting &&
    (!draft.trim() || completedSteps === setupSteps.length);
  const saveHint = !hasWhatsApp
    ? 'Connect WhatsApp to save your agent.'
    : !changed
      ? 'Your configuration is up to date.'
      : !draft.trim()
        ? 'Saving an empty persona turns off auto-replies.'
        : completedSteps < setupSteps.length
          ? 'Complete the setup checklist to save your agent.'
          : 'Changes apply to new customer sessions.';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await updateUserWhatsAppAgent({
        taskKey,
        systemPrompt: draft,
        bookingVoiceAgentId: bookingAgentId,
        whatsappToolProfileId: toolProfileId,
      });
      const prompt = result.systemPrompt ?? '';
      setTaskKey(result.taskKey);
      setSavedTaskKey(result.taskKey);
      setSavedPrompt(prompt);
      setDraft(prompt);
      setSavedBookingAgentId(result.bookingVoiceAgentId);
      setBookingAgentId(result.bookingVoiceAgentId);
      setSavedToolProfileId(result.whatsappToolProfileId);
      setToolProfileId(result.whatsappToolProfileId);
      setSaved(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to save agent',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ops-wa-agent">
      <header className="wa-agent-hero">
        <div className="wa-agent-hero-main">
          <span className="wa-agent-avatar">
            <AgentIcon name="chat" />
          </span>
          <div>
            <span className="wa-agent-eyebrow">
              Your business, in every conversation
            </span>
            <h2>Make your agent your own.</h2>
            <p>
              Give your WhatsApp assistant a purpose, a personality, and the
              tools to help.
            </p>
          </div>
        </div>
        <div className="wa-agent-hero-status">
          <span className={'wa-agent-status' + (enabled ? ' is-on' : '')}>
            <span aria-hidden="true" />
            {!hasWhatsApp
              ? 'Connection needed'
              : enabled
                ? 'Auto-replies enabled'
                : 'Auto-replies off'}
          </span>
          <span className="wa-agent-status-caption">
            Based on your saved configuration
          </span>
        </div>
      </header>

      {!hasWhatsApp ? (
        <div className="wa-agent-connect">
          <span className="wa-agent-connect-icon">
            <AgentIcon name="chat" />
          </span>
          <div>
            <strong>First, connect your WhatsApp number</strong>
            <p>
              Your agent will reply to customers on your own Meta WhatsApp
              connection.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onGoConnections}
            showArrow
          >
            Open Connections
          </Button>
        </div>
      ) : null}

      <form className="wa-agent-workspace" onSubmit={handleSave}>
        <div className="wa-agent-editor">
          <section
            className="wa-agent-section"
            aria-labelledby="wa-agent-task-title"
          >
            <div className="wa-agent-section-heading">
              <span className="wa-agent-section-number">01</span>
              <div>
                <h3 id="wa-agent-task-title">Choose its purpose</h3>
                <p>What should a successful conversation achieve?</p>
              </div>
            </div>
            <fieldset
              id="wa-agent-task"
              className="wa-agent-tasks"
              disabled={submitting || !hasWhatsApp}
            >
              <legend className="wa-agent-sr-only">Channel task</legend>
              {WHATSAPP_TASK_KEYS.map((key) => (
                <label
                  key={key}
                  className={
                    'wa-agent-task-card' +
                    (taskKey === key ? ' is-selected' : '')
                  }
                >
                  <input
                    type="radio"
                    name="wa-agent-task"
                    value={key}
                    checked={taskKey === key}
                    onChange={() => {
                      setTaskKey(key);
                      setSaved(false);
                    }}
                  />
                  <span className="wa-agent-task-icon">
                    <AgentIcon
                      name={key === 'receptionist' ? 'chat' : 'calendar'}
                    />
                  </span>
                  <strong>{WHATSAPP_TASKS[key].name}</strong>
                  <span className="wa-agent-task-description">
                    {key === 'receptionist'
                      ? 'Understand customer needs and arrange the right team appointment.'
                      : 'Find a suitable time and guide customers through a confirmed booking.'}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="wa-agent-task-note">
              <span>
                <AgentIcon name="check" />
                {WHATSAPP_TASK_COMPLETION}
              </span>
              {taskKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting || !hasWhatsApp}
                  onClick={() => {
                    setTaskKey(null);
                    setSaved(false);
                  }}
                >
                  Clear selection
                </Button>
              ) : null}
            </div>
          </section>

          <section
            className="wa-agent-section"
            aria-labelledby="wa-agent-persona-title"
          >
            <div className="wa-agent-section-heading">
              <span className="wa-agent-section-number">02</span>
              <div>
                <h3 id="wa-agent-persona-title">Give it a personality</h3>
                <p>
                  Define who your agent is, how it speaks, and the rules it
                  follows.
                </p>
              </div>
            </div>
            <Field label="Persona & instructions" htmlFor="wa-agent-prompt">
              <Textarea
                id="wa-agent-prompt"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                rows={11}
                maxLength={MAX_PROMPT_LENGTH}
                disabled={submitting || !hasWhatsApp}
                aria-describedby="wa-agent-persona-help wa-agent-character-count"
                placeholder={
                  'You are the WhatsApp assistant for [your business].\n\nBe warm, clear, and helpful. Keep replies short and ask one question at a time.\n\nShare accurate information about our services and follow these policies: ...'
                }
              />
            </Field>
            <div className="wa-agent-editor-meta">
              <span id="wa-agent-persona-help">
                Include your business, tone of voice, and boundaries.
              </span>
              <span id="wa-agent-character-count">
                {draft.length.toLocaleString()} /{' '}
                {MAX_PROMPT_LENGTH.toLocaleString()}
              </span>
            </div>
            {platformPrompt ? (
              <details className="wa-agent-reference">
                <summary>
                  <span className="wa-agent-reference-icon">
                    <AgentIcon name="spark" />
                  </span>
                  <span>
                    <strong>Need a starting point?</strong>
                    <span>Explore the receptionist example</span>
                  </span>
                  <span className="wa-agent-chevron" aria-hidden="true" />
                </summary>
                <div className="wa-agent-reference-body">
                  <p>
                    This is the platform Warewe persona. Adapt the company and
                    product details for your business before saving.
                  </p>
                  <pre>{platformPrompt}</pre>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={submitting || !hasWhatsApp}
                    onClick={() => {
                      setDraft(platformPrompt);
                      setSaved(false);
                      setFormError(null);
                      document.getElementById('wa-agent-prompt')?.focus();
                    }}
                  >
                    Use this example
                  </Button>
                </div>
              </details>
            ) : null}
          </section>

          <section
            className="wa-agent-section"
            aria-labelledby="wa-agent-capabilities-title"
          >
            <div className="wa-agent-section-heading">
              <span className="wa-agent-section-number">03</span>
              <div>
                <h3 id="wa-agent-capabilities-title">
                  Connect its capabilities
                </h3>
                <p>
                  Let your agent find contacts, check availability, and book
                  appointments.
                </p>
              </div>
            </div>
            <div className="wa-agent-capability-fields">
              <Field label="Booking tool profile" htmlFor="wa-agent-tools">
                <Select
                  id="wa-agent-tools"
                  value={toolProfileId ?? ''}
                  onChange={(e) => {
                    setToolProfileId(e.target.value || null);
                    setSaved(false);
                  }}
                  disabled={submitting || !hasWhatsApp}
                  aria-describedby="wa-agent-tools-help"
                >
                  <option value="">Select a tool profile</option>
                  {toolProfileId && !selectedProfile ? (
                    <option value={toolProfileId} disabled>
                      Saved profile unavailable
                    </option>
                  ) : null}
                  {toolProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Calendar from voice agent"
                htmlFor="wa-agent-booking"
              >
                <Select
                  id="wa-agent-booking"
                  value={bookingAgentId ?? ''}
                  onChange={(e) => {
                    setBookingAgentId(e.target.value || null);
                    setSaved(false);
                  }}
                  disabled={submitting || !hasWhatsApp}
                  aria-describedby="wa-agent-calendar-help"
                >
                  <option value="">Select a voice agent</option>
                  {bookingAgentId && !selectedAgent ? (
                    <option value={bookingAgentId} disabled>
                      Saved calendar unavailable
                    </option>
                  ) : null}
                  {voiceAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="wa-agent-capability-help">
              <p id="wa-agent-tools-help">
                {toolProfiles.length === 0 ? (
                  <>
                    No eligible booking profiles yet.{' '}
                    <Link to="/dashboard/tool-profiles">
                      Set up a tool profile <span aria-hidden="true">↗</span>
                    </Link>
                  </>
                ) : (
                  <>
                    Only profiles with your assigned booking tools are
                    available.{' '}
                    <Link to="/dashboard/tool-profiles">
                      Manage profiles <span aria-hidden="true">↗</span>
                    </Link>
                  </>
                )}
              </p>
              <p id="wa-agent-calendar-help">
                {voiceAgents.length === 0 ? (
                  <>
                    No eligible calendars yet.{' '}
                    <Link to="/dashboard/agents">
                      Link a GHL calendar to a voice agent{' '}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </>
                ) : (
                  'Reuses the voice agent’s existing GHL calendar connection.'
                )}
              </p>
            </div>
            {selectedProfile ? (
              <div
                className="wa-agent-capabilities"
                aria-label="Available booking capabilities"
              >
                {selectedProfile.toolIds
                  .filter((id) => GHL_TOOL_IDS.has(id))
                  .map((id) => (
                    <span key={id}>
                      <AgentIcon name="check" />
                      {TOOL_LABELS[id] ?? id}
                    </span>
                  ))}
              </div>
            ) : null}
          </section>
        </div>

        <aside
          className="wa-agent-rail"
          aria-label="Agent setup and saved configuration"
        >
          <section
            className="wa-agent-readiness"
            aria-labelledby="wa-agent-readiness-title"
          >
            <div className="wa-agent-readiness-heading">
              <span className="wa-agent-eyebrow">Setup checklist</span>
              <span className="wa-agent-progress-count">
                {completedSteps}
                <span> / {setupSteps.length}</span>
              </span>
            </div>
            <h3 id="wa-agent-readiness-title">
              {completedSteps === setupSteps.length
                ? 'Ready when you are.'
                : 'A few steps to helpful.'}
            </h3>
            <p>
              {completedSteps === setupSteps.length
                ? 'Your agent has everything it needs to handle new conversations.'
                : 'A little setup goes a long way. Give your agent everything it needs.'}
            </p>
            <div
              className="wa-agent-progress"
              role="progressbar"
              aria-label="Agent setup"
              aria-valuemin={0}
              aria-valuemax={setupSteps.length}
              aria-valuenow={completedSteps}
            >
              {setupSteps.map((step) => (
                <span
                  key={step.href}
                  className={step.complete ? 'is-complete' : ''}
                />
              ))}
            </div>
            <nav className="wa-agent-checklist" aria-label="Setup steps">
              {setupSteps.map((step, index) => (
                <a
                  key={step.href}
                  href={step.href}
                  className={step.complete ? 'is-complete' : ''}
                >
                  <span className="wa-agent-checklist-mark" aria-hidden="true">
                    {step.complete ? <AgentIcon name="check" /> : index + 1}
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                    <span className="wa-agent-sr-only">
                      {step.complete ? 'Complete' : 'Incomplete'}
                    </span>
                  </span>
                  <AgentIcon name="arrow" />
                </a>
              ))}
            </nav>
            <div className="wa-agent-save">
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              {saved ? (
                <Alert tone="success" role="status">
                  {enabled
                    ? 'Agent saved. Auto-replies are enabled.'
                    : 'Agent saved. Auto-replies are off.'}
                </Alert>
              ) : null}
              <span
                className={
                  'wa-agent-draft-status' + (changed ? ' is-changed' : '')
                }
                role="status"
              >
                <span aria-hidden="true" />
                {changed ? 'Unsaved changes' : 'All changes saved'}
              </span>
              <Button
                type="submit"
                fullWidth
                size="lg"
                disabled={!canSave}
                loading={submitting}
                showArrow
                aria-describedby="wa-agent-save-hint"
              >
                {submitting ? 'Saving agent…' : 'Save agent'}
              </Button>
              <p className="wa-agent-save-hint" id="wa-agent-save-hint">
                {saveHint}
              </p>
              <div className="wa-agent-actions">
                {changed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={() => {
                      setTaskKey(savedTaskKey);
                      setDraft(savedPrompt);
                      setBookingAgentId(savedBookingAgentId);
                      setToolProfileId(savedToolProfileId);
                      setFormError(null);
                      setSaved(false);
                    }}
                  >
                    Discard changes
                  </Button>
                ) : null}
                {draft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting || !hasWhatsApp}
                    onClick={() => {
                      setDraft('');
                      setSaved(false);
                    }}
                  >
                    Clear persona
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section
            className="wa-agent-saved"
            aria-labelledby="wa-agent-saved-title"
          >
            <div className="wa-agent-saved-heading">
              <h3 id="wa-agent-saved-title">Saved configuration</h3>
              <span
                className={
                  'wa-agent-saved-indicator' + (enabled ? ' is-on' : '')
                }
              >
                {enabled ? 'Enabled' : 'Off'}
              </span>
            </div>
            <dl>
              <div>
                <dt>Purpose</dt>
                <dd>
                  {savedTaskKey
                    ? WHATSAPP_TASKS[savedTaskKey].name
                    : 'Not selected'}
                </dd>
              </div>
              <div>
                <dt>Tool profile</dt>
                <dd>
                  {savedProfile?.name ??
                    (savedToolProfileId ? 'Unavailable' : 'Not selected')}
                </dd>
              </div>
              <div>
                <dt>Calendar agent</dt>
                <dd>
                  {savedAgent?.name ??
                    (savedBookingAgentId ? 'Unavailable' : 'Not selected')}
                </dd>
              </div>
            </dl>
            {savedPrompt.trim() ? (
              <details className="wa-agent-saved-persona">
                <summary>
                  View saved persona
                  <span className="wa-agent-chevron" aria-hidden="true" />
                </summary>
                <pre>{savedPrompt}</pre>
              </details>
            ) : (
              <p className="wa-agent-saved-empty">
                Your saved persona will appear here.
              </p>
            )}
          </section>

          <div className="wa-agent-session-note">
            <span>
              <AgentIcon name="chat" />
            </span>
            <div>
              <strong>One conversation. One goal.</strong>
              <p>
                A booking or a decline closes the session. Customers can send{' '}
                <code>/new</code> to start fresh. Saved changes apply to new
                sessions.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
