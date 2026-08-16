import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  cloneUserAgent,
  createUserTestCall,
  getUserAgent,
  listUserOrgIntegrations,
  listUserToolProfiles,
  TASK_KEYS,
  type OrganizationIntegration,
  type ToolProfile,
  UnauthorizedError,
  updateUserAgent,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

function formatToolProfileLabel(p: ToolProfile): string {
  const scope =
    p.isPlatform === false || p.organizationId ? "custom" : "platform";
  const tools = (p.toolIds ?? []).filter(Boolean);
  if (tools.length === 0) {
    return `${p.name} (${p.key}) · ${scope}`;
  }
  const preview = tools.slice(0, 4).join(", ");
  const more = tools.length > 4 ? ` +${tools.length - 4}` : "";
  return `${p.name} · ${preview}${more} · ${scope}`;
}

export default function UserAgentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [agent, profiles, integrations] = await Promise.all([
      getUserAgent(id),
      listUserToolProfiles(),
      listUserOrgIntegrations(),
    ]);
    return { agent, profiles, integrations };
  }, [id]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [onEnterInstructions, setOnEnterInstructions] = useState("");
  const [onExitInstructions, setOnExitInstructions] = useState("");
  const [silentStart, setSilentStart] = useState(false);
  const [silentEnd, setSilentEnd] = useState(false);
  const [defaultTaskKey, setDefaultTaskKey] = useState("general");
  const [toolProfileId, setToolProfileId] = useState("");
  const [calendarIntegrationId, setCalendarIntegrationId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [meetUrl, setMeetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.agent.name ?? "");
    setSlug(data.agent.slug ?? "");
    setSystemPrompt(data.agent.prompt?.systemPrompt ?? "");
    const enter = data.agent.prompt?.onEnterInstructions;
    const exit = data.agent.prompt?.onExitInstructions;
    setSilentStart(enter === "");
    setSilentEnd(exit === "");
    setOnEnterInstructions(enter && enter !== "" ? enter : "");
    setOnExitInstructions(exit && exit !== "" ? exit : "");
    setDefaultTaskKey(data.agent.defaultTaskKey || "general");
    setToolProfileId(data.agent.toolProfileId || "");
    setCalendarIntegrationId(data.agent.calendarIntegrationId || "");
    setIsActive(data.agent.isActive);
  }, [data]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    if (!name.trim()) {
      setFormError("Display name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await updateUserAgent(id, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        systemPrompt,
        onEnterInstructions: silentStart
          ? ""
          : onEnterInstructions.trim()
            ? onEnterInstructions.trim()
            : null,
        onExitInstructions: silentEnd
          ? ""
          : onExitInstructions.trim()
            ? onExitInstructions.trim()
            : null,
        defaultTaskKey,
        toolProfileId: toolProfileId || undefined,
        calendarIntegrationId: calendarIntegrationId || null,
        isActive,
      });
      setSaved(true);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not save agent.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClone = async () => {
    const base = name.trim() || data?.agent.name || "Agent";
    const cloneName = window.prompt(
      "Name for the cloned agent config:",
      `${base} (copy)`,
    );
    if (!cloneName?.trim()) return;
    setFormError(null);
    setCloning(true);
    try {
      const created = await cloneUserAgent(id, { name: cloneName.trim() });
      navigate(`/dashboard/agents/${created.id}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not clone agent.");
    } finally {
      setCloning(false);
    }
  };

  const handleTest = async () => {
    setFormError(null);
    setMeetUrl(null);
    setTesting(true);
    try {
      const result = await createUserTestCall({
        organizationAgentId: id,
        task: defaultTaskKey || undefined,
      });
      setMeetUrl(result.meetUrl);
      if (result.meetUrl) {
        window.open(result.meetUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not start test call.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading agent" />;
  if (error || !data) return <ErrorBlock message={error ?? "Not found"} onRetry={reload} />;

  const { agent, profiles, integrations } = data;
  const nylasIntegrations = (integrations as OrganizationIntegration[]).filter(
    (i) => i.provider === "nylas" && i.isActive,
  );

  return (
    <div className="ops-desk is-studio">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <Link to="/dashboard/agents" className="ops-desk-back">
            ← Roster
          </Link>
          <div className="ops-desk-title-block">
            <h1>{agent.name}</h1>
            <span className="ops-desk-slug ops-mono">
              {agent.slug ?? agent.key}
            </span>
          </div>
          <StatusBadge status={agent.direction} />
          <StatusBadge
            status={agent.isActive ? "live" : "inactive"}
            label={agent.isActive ? "Active" : "Inactive"}
          />
        </div>
        <div className="ops-desk-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={cloning}
            disabled={cloning || submitting}
            onClick={handleClone}
          >
            Clone
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={testing}
            disabled={testing || submitting}
            onClick={handleTest}
          >
            Web test
          </Button>
        </div>
      </div>

      <form className="ops-desk-board" onSubmit={handleSave}>
        <section className="ops-panel ops-desk-script">
          <div className="ops-panel-head">
            <span className="ops-desk-kicker">Persona</span>
            <span className="ops-desk-hint">Script only · tasks live in workflow</span>
          </div>
          <div className="ops-panel-body ops-form ops-desk-form">
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? <Alert tone="success">Saved.</Alert> : null}
            {meetUrl ? (
              <Alert tone="success">
                Test room ready.{" "}
                <a href={meetUrl} target="_blank" rel="noreferrer">
                  Open Meet again →
                </a>
              </Alert>
            ) : null}

            <Field
              label="System prompt"
              htmlFor="ua-prompt"
              required
              className="ops-desk-prompt"
            >
              <Textarea
                id="ua-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={14}
                disabled={submitting}
              />
            </Field>

            <div className="ops-hooks">
              <div className="ops-hook">
                <div className="ops-hook-head">
                  <label className="ops-hook-label" htmlFor="ua-on-enter">
                    On start
                  </label>
                  <label className="ops-check ops-check-inline">
                    <input
                      type="checkbox"
                      checked={silentStart}
                      onChange={(e) => setSilentStart(e.target.checked)}
                      disabled={submitting}
                    />
                    Silent
                  </label>
                </div>
                <Textarea
                  id="ua-on-enter"
                  value={onEnterInstructions}
                  onChange={(e) => setOnEnterInstructions(e.target.value)}
                  rows={4}
                  disabled={submitting || silentStart}
                  placeholder="Empty = built-in greeting"
                />
              </div>
              <div className="ops-hook">
                <div className="ops-hook-head">
                  <label className="ops-hook-label" htmlFor="ua-on-exit">
                    On end
                  </label>
                  <label className="ops-check ops-check-inline">
                    <input
                      type="checkbox"
                      checked={silentEnd}
                      onChange={(e) => setSilentEnd(e.target.checked)}
                      disabled={submitting}
                    />
                    Silent
                  </label>
                </div>
                <Textarea
                  id="ua-on-exit"
                  value={onExitInstructions}
                  onChange={(e) => setOnExitInstructions(e.target.value)}
                  rows={4}
                  disabled={submitting || silentEnd}
                  placeholder="Empty = built-in goodbye"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ops-panel ops-desk-card">
          <div className="ops-panel-head">
            <span className="ops-desk-kicker">Cast</span>
            <span className="ops-desk-hint">Identity · routing</span>
          </div>
          <div className="ops-panel-body ops-form ops-desk-form">
            <Field label="Display name" htmlFor="ua-name" required>
              <Input
                id="ua-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Slug" htmlFor="ua-slug">
              <Input
                id="ua-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Default task" htmlFor="ua-task">
              <Select
                id="ua-task"
                value={defaultTaskKey}
                onChange={(e) => setDefaultTaskKey(e.target.value)}
                disabled={submitting}
              >
                {TASK_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
                {defaultTaskKey &&
                !(TASK_KEYS as readonly string[]).includes(defaultTaskKey) ? (
                  <option value={defaultTaskKey}>{defaultTaskKey}</option>
                ) : null}
              </Select>
            </Field>
            <Field label="Tool profile" htmlFor="ua-tp">
              <Select
                id="ua-tp"
                value={toolProfileId}
                onChange={(e) => setToolProfileId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— keep current —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatToolProfileLabel(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Calendar" htmlFor="ua-cal">
              <Select
                id="ua-cal"
                value={calendarIntegrationId}
                onChange={(e) => setCalendarIntegrationId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— none —</option>
                {nylasIntegrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.email ? ` (${i.email})` : ""} · {i.calendarId}
                  </option>
                ))}
                {calendarIntegrationId &&
                !nylasIntegrations.some((i) => i.id === calendarIntegrationId) ? (
                  <option value={calendarIntegrationId}>
                    {calendarIntegrationId.slice(0, 8)}… (inactive)
                  </option>
                ) : null}
              </Select>
            </Field>
            <label className="ops-check">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={submitting}
              />
              Active
            </label>

            <div className="ops-desk-submit">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Save changes
              </Button>
            </div>

            <dl className="ops-spec">
              <dt>Template</dt>
              <dd className="ops-mono">{agent.templateKey ?? agent.key}</dd>
              <dt>Tools</dt>
              <dd className="ops-mono">
                {agent.enabledTools?.length ? agent.enabledTools.join(", ") : "—"}
              </dd>
              <dt>Voice</dt>
              <dd className="ops-mono">{agent.voice || "default"}</dd>
              <dt>Model</dt>
              <dd className="ops-mono">{agent.model || "default"}</dd>
              <dt>Temp</dt>
              <dd>{agent.temperature ?? "—"}</dd>
            </dl>

            <p className="ops-desk-note">
              <Link to={`/dashboard/calls?compose=dial&agentId=${id}`}>
                Dial now with this agent →
              </Link>
            </p>
          </div>
        </section>
      </form>
    </div>
  );
}
