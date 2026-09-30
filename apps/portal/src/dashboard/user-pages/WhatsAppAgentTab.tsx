import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  WHATSAPP_AGENT_TOOL_IDS,
  WHATSAPP_TASK_KEYS,
  WHATSAPP_TASKS,
  WHATSAPP_TASK_COMPLETION,
  type WhatsAppTaskKey,
  type Agent,
  type OrganizationIntegration,
  type ToolProfile,
} from "@call-agent/contracts";
import { Alert, Button, Field, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  getUserWhatsAppAgent,
  listUserAgents,
  listUserOrgIntegrations,
  listUserKnownTools,
  listUserToolProfiles,
  UnauthorizedError,
  updateUserWhatsAppAgent,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";

const MAX_PROMPT_LENGTH = 20000;
const GHL_TOOL_IDS: ReadonlySet<string> = new Set(WHATSAPP_AGENT_TOOL_IDS);

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
  const [savedPrompt, setSavedPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [platformPrompt, setPlatformPrompt] = useState("");
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
        const prompt = config.systemPrompt ?? "";
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
                ids.has("scheduleGhlMeeting") &&
                (!ids.has("scheduleGhlMeeting") ||
                  (ids.has("checkGhlFreeSlots") &&
                    (ids.has("lookupGhlContact") ||
                      ids.has("upsertGhlContact"))))
              );
            }),
        );
        const activeGhlIds = new Set(
          integrations
            .filter(
              (item: OrganizationIntegration) =>
                item.provider === "ghl" && item.isActive,
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
          err instanceof ApiError ? err.message : "Failed to load agent",
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
  const enabled = savedPrompt.trim().length > 0 && savedTaskKey !== null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasWhatsApp || !changed) return;
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
      const prompt = result.systemPrompt ?? "";
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
        err instanceof ApiError ? err.message : "Failed to save agent",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ops-wa-agent">
      <div className="ops-wa-agent-intro">
        <div>
          <span className="ops-desk-kicker">Inbound replies</span>
          <h2>WhatsApp agent</h2>
          <p className="ops-desk-note">
            Choose a task and give your assistant a role, tone, and rules on
            your connected number. Each customer session ends when its task
            finishes. Send <code>/new</code> to restart.
          </p>
        </div>
        <span className={`ops-wa-agent-status${enabled ? " is-on" : ""}`}>
          <span className="ops-wa-agent-status-dot" aria-hidden="true" />
          {hasWhatsApp
            ? enabled
              ? "Auto-replies on"
              : "Auto-replies off"
            : "Connection needed"}
        </span>
      </div>

      <div className="ops-wa-agent-grid">
        <section
          className="ops-panel ops-wa-agent-current"
          aria-label="Current agent prompt"
        >
          <div className="ops-panel-head">
            <h3>Current prompt</h3>
            <span className="ops-desk-hint">
              {enabled ? "Saved and live" : "Not set"}
            </span>
          </div>
          <div className="ops-panel-body">
            {savedTaskKey ? (
              <p className="ops-desk-note">
                <strong>{WHATSAPP_TASKS[savedTaskKey].name}</strong> ·{" "}
                {WHATSAPP_TASK_COMPLETION}
              </p>
            ) : null}
            {enabled ? (
              <pre className="ops-wa-agent-prompt">{savedPrompt}</pre>
            ) : (
              <p className="ops-desk-note">
                Select a task and save a persona with booking tools to turn on
                auto-replies.
              </p>
            )}
            {platformPrompt ? (
              <div className="ops-wa-agent-example">
                <div className="ops-wa-agent-example-head">
                  <div>
                    <strong>Existing receptionist prompt</strong>
                    <p className="ops-desk-note">
                      The platform Warewe prompt is an example. Edit company and
                      product details before using it for your organization.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={submitting || !hasWhatsApp}
                    onClick={() => {
                      setDraft(platformPrompt);
                      setSaved(false);
                      setFormError(null);
                    }}
                  >
                    Copy to editor
                  </Button>
                </div>
                <pre className="ops-wa-agent-prompt ops-wa-agent-prompt-example">
                  {platformPrompt}
                </pre>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="ops-panel ops-wa-agent-editor"
          aria-label="Edit agent prompt"
        >
          <div className="ops-panel-head">
            <h3>Edit prompt</h3>
            <span className="ops-desk-hint">
              {changed ? "Unsaved changes" : "Up to date"}
            </span>
          </div>
          <form
            className="ops-panel-body ops-form ops-desk-form"
            onSubmit={handleSave}
          >
            {!hasWhatsApp ? (
              <div className="ops-wa-agent-connect">
                <strong>Connect WhatsApp to save your agent prompt</strong>
                <p className="ops-desk-note">
                  The existing receptionist prompt is shown on the left. Add
                  your own Meta WhatsApp Cloud connection to configure
                  auto-replies for your number.
                </p>
                <Button type="button" onClick={onGoConnections}>
                  Open Connections
                </Button>
              </div>
            ) : null}
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? (
              <Alert tone="success" role="status">
                {enabled
                  ? "Agent saved. Auto-replies are on."
                  : "Agent saved. Auto-replies are off."}
              </Alert>
            ) : null}
            {!savedTaskKey && hasWhatsApp ? (
              <Alert tone="info">
                Select a task to enable auto-replies on this channel.
              </Alert>
            ) : null}
            <Field label="Channel task" htmlFor="wa-agent-task">
              <Select
                id="wa-agent-task"
                value={taskKey ?? ""}
                required={Boolean(draft.trim())}
                disabled={submitting || !hasWhatsApp}
                onChange={(e) => {
                  setTaskKey(
                    (e.target.value || null) as WhatsAppTaskKey | null,
                  );
                  setSaved(false);
                }}
              >
                <option value="">Select a task</option>
                {WHATSAPP_TASK_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {WHATSAPP_TASKS[key].name}
                  </option>
                ))}
              </Select>
            </Field>
            {taskKey ? (
              <p className="ops-desk-note">
                {WHATSAPP_TASK_COMPLETION} Declining a booking ends the session
                without a successful booking. Changes apply to new sessions.
              </p>
            ) : null}
            <Field label="Persona / system prompt" htmlFor="wa-agent-prompt">
              <Textarea
                id="wa-agent-prompt"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                rows={18}
                maxLength={MAX_PROMPT_LENGTH}
                disabled={submitting || !hasWhatsApp}
                placeholder="You are the WhatsApp assistant for [your organization]. Help customers with..."
              />
            </Field>
            <Field label="Tool profile" htmlFor="wa-agent-tools">
              <Select
                id="wa-agent-tools"
                value={toolProfileId ?? ""}
                onChange={(e) => {
                  setToolProfileId(e.target.value || null);
                  setSaved(false);
                }}
                disabled={submitting || !hasWhatsApp}
              >
                <option value="">Select a booking tool profile</option>
                {toolProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </Select>
            </Field>
            {toolProfiles.length === 0 ? (
              <p className="ops-desk-note">
                No assigned GHL tools are in a profile yet.{" "}
                <Link to="/dashboard/tool-profiles">Set up a tool profile</Link>{" "}
                first.
              </p>
            ) : null}
            {toolProfileId ? (
              <p className="ops-desk-note">
                Available GHL tools:{" "}
                {toolProfiles
                  .find((profile) => profile.id === toolProfileId)
                  ?.toolIds.filter((id) => GHL_TOOL_IDS.has(id))
                  .join(", ") || "none"}
                .
              </p>
            ) : null}
            {toolProfileId ? (
              <Field
                label="GHL calendar from voice agent"
                htmlFor="wa-agent-booking"
              >
                <Select
                  id="wa-agent-booking"
                  value={bookingAgentId ?? ""}
                  onChange={(e) => {
                    setBookingAgentId(e.target.value || null);
                    setSaved(false);
                  }}
                  disabled={submitting || !hasWhatsApp}
                >
                  <option value="">
                    Select a voice agent with a GHL calendar
                  </option>
                  {voiceAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {toolProfileId ? (
              <p className="ops-desk-note">
                Uses the selected voice agent’s existing GHL calendar
                connection. No new integration is needed.
              </p>
            ) : null}
            {toolProfileId && voiceAgents.length === 0 ? (
              <p className="ops-desk-note">
                <Link to="/dashboard/agents">
                  Link an active GHL calendar to a voice agent
                </Link>{" "}
                before saving.
              </p>
            ) : null}
            <div className="ops-wa-agent-editor-foot">
              <span className="ops-desk-note">
                {draft.length.toLocaleString()} /{" "}
                {MAX_PROMPT_LENGTH.toLocaleString()} characters
                {draft.trim()
                  ? ""
                  : " · An empty prompt turns off auto-replies."}
              </span>
              <div className="ops-wa-agent-actions">
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
                    }}
                  >
                    Discard
                  </Button>
                ) : null}
                {draft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={() => {
                      setDraft("");
                      setSaved(false);
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  disabled={
                    submitting ||
                    !hasWhatsApp ||
                    !changed ||
                    Boolean(
                      draft.trim() &&
                      (!taskKey || !toolProfileId || !bookingAgentId),
                    )
                  }
                >
                  {submitting ? "Saving…" : "Save agent"}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
