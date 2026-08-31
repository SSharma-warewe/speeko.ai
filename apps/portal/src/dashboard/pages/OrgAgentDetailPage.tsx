import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import { AgentVoiceRack } from "../components/AgentVoiceRack";
import {
  DEFAULT_DELIVERY_MODE,
  DEFAULT_SPEAKING_RATE,
  DEFAULT_TEMPERATURE,
  parseDeliveryMode,
  type DeliveryMode,
} from "../../lib/voices";
import {
  ApiError,
  cloneOrgAgent,
  deleteOrgAgent,
  getOrgAgent,
  TASK_KEYS,
  UnauthorizedError,
  updateOrgAgent,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function OrgAgentDetailPage() {
  const { orgId = "", agentId = "" } = useParams();
  const navigate = useNavigate();
  const { logout } = useAdminAuth();
  const { data, error, notFound, loading, reload } = useAsync(
    () => getOrgAgent(orgId, agentId),
    [orgId, agentId],
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [onEnterInstructions, setOnEnterInstructions] = useState("");
  const [onExitInstructions, setOnExitInstructions] = useState("");
  const [silentStart, setSilentStart] = useState(false);
  const [silentEnd, setSilentEnd] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [defaultTaskKey, setDefaultTaskKey] = useState("general");
  const [ttsModel, setTtsModel] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [speakingRate, setSpeakingRate] = useState(DEFAULT_SPEAKING_RATE);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    DEFAULT_DELIVERY_MODE,
  );
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [submitting, setSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name ?? "");
      setSlug(data.slug ?? "");
      setSystemPrompt(data.prompt?.systemPrompt ?? "");
      const enter = data.prompt?.onEnterInstructions;
      const exit = data.prompt?.onExitInstructions;
      setSilentStart(enter === "");
      setSilentEnd(exit === "");
      setOnEnterInstructions(enter && enter !== "" ? enter : "");
      setOnExitInstructions(exit && exit !== "" ? exit : "");
      setIsActive(data.isActive);
      setDefaultTaskKey(data.defaultTaskKey || "general");
      setTtsModel(data.ttsModel ?? null);
      setVoice(data.voice ?? null);
      setSpeakingRate(data.speakingRate ?? DEFAULT_SPEAKING_RATE);
      setDeliveryMode(parseDeliveryMode(data.deliveryMode));
      setTemperature(data.temperature ?? DEFAULT_TEMPERATURE);
    }
  }, [data]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    if (!name.trim()) {
      setFormError("Display name is required.");
      return;
    }
    const inbound = data?.direction === "inbound";
    if (inbound && !defaultTaskKey.trim()) {
      setFormError("Inbound agents require a default task.");
      return;
    }
    setSubmitting(true);
    try {
      await updateOrgAgent(orgId, agentId, {
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
        ...(inbound ? { defaultTaskKey } : {}),
        isActive,
        ttsModel,
        voice,
        speakingRate,
        deliveryMode,
        temperature,
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
    const base = name.trim() || data?.name || "Agent";
    const cloneName = window.prompt(
      "Name for the cloned agent config:",
      `${base} (copy)`,
    );
    if (!cloneName?.trim()) return;
    setFormError(null);
    setCloning(true);
    try {
      const created = await cloneOrgAgent(orgId, agentId, {
        name: cloneName.trim(),
      });
      navigate(`/admin-dashboard/organizations/${orgId}/agents/${created.id}`);
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

  const handleDelete = async () => {
    if (!window.confirm("Delete this organization agent config?")) return;
    setDeleting(true);
    setFormError(null);
    try {
      await deleteOrgAgent(orgId, agentId);
      navigate(`/admin-dashboard/organizations/${orgId}/agents`, { replace: true });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not delete agent.");
      setDeleting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading agent" />;
  if (notFound || (!data && !error)) {
    return (
      <ResourceNotFound
        kind="Agent"
        id={agentId}
        backTo={`/admin-dashboard/organizations/${orgId}/agents`}
        backLabel="All agents"
      />
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  return (
    <div className="ops-stack">
      <p style={{ margin: 0 }}>
        <Link to={`/admin-dashboard/organizations/${orgId}/agents`} className="ops-muted">
          ← Back to agents
        </Link>
      </p>

      <PageHeader
        eyebrow={data.slug ?? data.key}
        title={data.name}
        description="Edit name, persona, and LiveKit onEnter/onExit speech. Clone for a second config with different tools or hooks."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <StatusBadge status={data.direction} />
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
          </div>
        }
      />

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Persona & hooks</h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleSave}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? <Alert tone="success">Saved.</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Display name" htmlFor="oa-name" required>
                <Input
                  id="oa-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label="Slug" htmlFor="oa-slug" hint="Unique within this organization.">
                <Input
                  id="oa-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
            <Field label="System prompt" htmlFor="agent-prompt" required>
              <Textarea
                id="agent-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={10}
                disabled={submitting}
              />
            </Field>
            <Field
              label="On-start instructions (LiveKit onEnter)"
              htmlFor="oa-on-enter"
              hint="Spoken when the call starts. Leave empty for built-in default. Check silent to skip."
            >
              <Textarea
                id="oa-on-enter"
                value={onEnterInstructions}
                onChange={(e) => setOnEnterInstructions(e.target.value)}
                rows={4}
                disabled={submitting || silentStart}
                placeholder="e.g. Greet the caller as Acme support and ask how you can help."
              />
            </Field>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                checked={silentStart}
                onChange={(e) => setSilentStart(e.target.checked)}
                disabled={submitting}
              />
              Silent start (skip opening speech)
            </label>
            <Field
              label="On-end instructions (LiveKit onExit)"
              htmlFor="oa-on-exit"
              hint="Spoken when the call ends. Leave empty for built-in goodbye. Check silent to skip."
            >
              <Textarea
                id="oa-on-exit"
                value={onExitInstructions}
                onChange={(e) => setOnExitInstructions(e.target.value)}
                rows={3}
                disabled={submitting || silentEnd}
                placeholder="e.g. Thank them briefly and wish them a good day."
              />
            </Field>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                checked={silentEnd}
                onChange={(e) => setSilentEnd(e.target.checked)}
                disabled={submitting}
              />
              Silent end (skip closing speech)
            </label>
            {data.direction === "inbound" ? (
              <Field
                label="Default task"
                htmlFor="oa-task"
                required
                hint="Packed on inbound ring. Outbound sets task per call."
              >
                <Select
                  id="oa-task"
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
            ) : null}
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={submitting}
              />
              Active
            </label>
            <AgentVoiceRack
              compact
              ttsModel={ttsModel}
              voice={voice}
              speakingRate={speakingRate}
              deliveryMode={deliveryMode}
              temperature={temperature}
              disabled={submitting}
              onChange={(next) => {
                if (next.ttsModel !== undefined) setTtsModel(next.ttsModel);
                if (next.voice !== undefined) setVoice(next.voice);
                if (next.speakingRate !== undefined) setSpeakingRate(next.speakingRate);
                if (next.deliveryMode !== undefined) setDeliveryMode(next.deliveryMode);
                if (next.temperature !== undefined) setTemperature(next.temperature);
              }}
            />
            <div className="ops-form-actions">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={deleting}
                disabled={deleting || submitting}
                onClick={handleDelete}
              >
                Delete agent
              </Button>
            </div>
          </form>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Capabilities</h2>
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Template</dt>
                <dd className="ops-mono">{data.templateKey ?? data.key}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Slug</dt>
                <dd className="ops-mono">{data.slug ?? "—"}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Default task</dt>
                <dd className="ops-mono">
                  {data.direction === "inbound"
                    ? data.defaultTaskKey || "—"
                    : "—"}
                </dd>
              </div>
              <div className="ops-detail-item">
                <dt>Tool profile</dt>
                <dd className="ops-mono">{data.toolProfileId || "—"}</dd>
              </div>
            </dl>
            <div style={{ marginTop: "1rem" }}>
              <div className="ops-faint" style={{ fontSize: "0.7rem", marginBottom: "0.4rem" }}>
                ENABLED TOOLS
              </div>
              <div className="ops-chip-row">
                {(data.enabledTools ?? []).map((t) => (
                  <span key={t} className="ops-tool-chip">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
