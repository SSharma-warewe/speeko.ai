import { useEffect, useState, type FormEvent } from "react";
import type { Agent, OrganizationIntegration } from "@call-agent/contracts";
import { Alert, Button, Field, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  getUserWhatsAppAgent,
  listUserAgents,
  listUserOrgIntegrations,
  UnauthorizedError,
  updateUserWhatsAppAgent,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";

const MAX_PROMPT_LENGTH = 20000;

type Props = {
  hasWhatsApp: boolean;
  onGoConnections: () => void;
};

export default function WhatsAppAgentTab({ hasWhatsApp, onGoConnections }: Props) {
  const { logout } = useUserAuth();
  const [savedPrompt, setSavedPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [platformPrompt, setPlatformPrompt] = useState("");
  const [savedBookingAgentId, setSavedBookingAgentId] = useState<string | null>(null);
  const [bookingAgentId, setBookingAgentId] = useState<string | null>(null);
  const [voiceAgents, setVoiceAgents] = useState<Agent[]>([]);
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
    Promise.all([getUserWhatsAppAgent(), listUserAgents(), listUserOrgIntegrations()])
      .then(([config, agents, integrations]) => {
        if (!active) return;
        const prompt = config.systemPrompt ?? "";
        setSavedPrompt(prompt);
        setDraft(prompt);
        setPlatformPrompt(config.platformPrompt);
        setSavedBookingAgentId(config.bookingVoiceAgentId);
        setBookingAgentId(config.bookingVoiceAgentId);
        const activeGhlIds = new Set(
          integrations
            .filter((item: OrganizationIntegration) => item.provider === "ghl" && item.isActive)
            .map((item) => item.id),
        );
        setVoiceAgents(
          agents.filter(
            (agent: Agent) => agent.isActive && agent.calendarIntegrationId && activeGhlIds.has(agent.calendarIntegrationId),
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
        setLoadError(err instanceof ApiError ? err.message : "Failed to load agent");
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

  const changed = draft !== savedPrompt || bookingAgentId !== savedBookingAgentId;
  const enabled = savedPrompt.trim().length > 0;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasWhatsApp || !changed) return;
    setSubmitting(true);
    setFormError(null);
    setSaved(false);
    try {
      const result = await updateUserWhatsAppAgent({ systemPrompt: draft, bookingVoiceAgentId: bookingAgentId });
      const prompt = result.systemPrompt ?? "";
      setSavedPrompt(prompt);
      setDraft(prompt);
      setSavedBookingAgentId(result.bookingVoiceAgentId);
      setBookingAgentId(result.bookingVoiceAgentId);
      setSaved(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Failed to save agent");
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
            Give your assistant a role, tone, and rules for conversations on your
            connected number. Send <code>/new</code> to start a fresh conversation.
          </p>
        </div>
        <span className={`ops-wa-agent-status${enabled ? " is-on" : ""}`}>
          <span className="ops-wa-agent-status-dot" aria-hidden="true" />
          {hasWhatsApp
            ? enabled ? "Auto-replies on" : "Auto-replies off"
            : "Connection needed"}
        </span>
      </div>

      <div className="ops-wa-agent-grid">
        <section className="ops-panel ops-wa-agent-current" aria-label="Current agent prompt">
          <div className="ops-panel-head">
            <h3>Current prompt</h3>
            <span className="ops-desk-hint">{enabled ? "Saved and live" : "Not set"}</span>
          </div>
          <div className="ops-panel-body">
            {enabled ? (
              <pre className="ops-wa-agent-prompt">{savedPrompt}</pre>
            ) : (
              <p className="ops-desk-note">
                No prompt is saved for this number. Save one to turn on auto-replies.
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

        <section className="ops-panel ops-wa-agent-editor" aria-label="Edit agent prompt">
          <div className="ops-panel-head">
            <h3>Edit prompt</h3>
            <span className="ops-desk-hint">
              {changed ? "Unsaved changes" : "Up to date"}
            </span>
          </div>
          <form className="ops-panel-body ops-form ops-desk-form" onSubmit={handleSave}>
            {!hasWhatsApp ? (
              <div className="ops-wa-agent-connect">
                <strong>Connect WhatsApp to save your agent prompt</strong>
                <p className="ops-desk-note">
                  The existing receptionist prompt is shown on the left. Add your
                  own Meta WhatsApp Cloud connection to configure auto-replies
                  for your number.
                </p>
                <Button type="button" onClick={onGoConnections}>
                  Open Connections
                </Button>
              </div>
            ) : null}
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? (
              <Alert tone="success" role="status">
                {enabled ? "Prompt saved. Auto-replies are on." : "Prompt cleared. Auto-replies are off."}
              </Alert>
            ) : null}
            <Field label="System prompt" htmlFor="wa-agent-prompt">
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
            <Field label="Booking tools from voice agent" htmlFor="wa-agent-booking">
              <Select
                id="wa-agent-booking"
                value={bookingAgentId ?? ""}
                onChange={(e) => {
                  setBookingAgentId(e.target.value || null);
                  setSaved(false);
                }}
                disabled={submitting || !hasWhatsApp}
              >
                <option value="">Off — collect details only</option>
                {voiceAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </Select>
            </Field>
            <p className="ops-desk-note">
              Uses the selected voice agent’s existing GHL calendar connection to create contacts,
              check open times, and book meetings. No new integration is needed.
            </p>
            <div className="ops-wa-agent-editor-foot">
              <span className="ops-desk-note">
                {draft.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()} characters
                {draft.trim() ? "" : " · An empty prompt turns off auto-replies."}
              </span>
              <div className="ops-wa-agent-actions">
                {changed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={() => {
                      setDraft(savedPrompt);
                      setBookingAgentId(savedBookingAgentId);
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
                <Button type="submit" disabled={submitting || !hasWhatsApp || !changed}>
                  {submitting ? "Saving…" : "Save prompt"}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
