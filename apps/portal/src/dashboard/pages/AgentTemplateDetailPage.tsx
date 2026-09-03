import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button, Field, Textarea } from "@call-agent/ui";
import { AgentVoiceRack } from "../components/AgentVoiceRack";
import {
  DEFAULT_DELIVERY_MODE,
  DEFAULT_SPEAKING_RATE,
  DEFAULT_TEMPERATURE,
  parseDeliveryMode,
  storedLlmModel,
  storedTtsModel,
  type DeliveryMode,
} from "../../lib/voices";
import {
  ApiError,
  getAgentTemplate,
  UnauthorizedError,
  updateAgentTemplate,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

export default function AgentTemplateDetailPage() {
  const { id = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, notFound, loading, reload } = useAsync(
    () => getAgentTemplate(id),
    [id],
  );

  const [systemPrompt, setSystemPrompt] = useState("");
  const [onEnterInstructions, setOnEnterInstructions] = useState("");
  const [onExitInstructions, setOnExitInstructions] = useState("");
  const [silentStart, setSilentStart] = useState(false);
  const [silentEnd, setSilentEnd] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [model, setModel] = useState<string | null>(null);
  const [ttsModel, setTtsModel] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [speakingRate, setSpeakingRate] = useState(DEFAULT_SPEAKING_RATE);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    DEFAULT_DELIVERY_MODE,
  );
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setSystemPrompt(data.prompt?.systemPrompt ?? "");
      const enter = data.prompt?.onEnterInstructions;
      const exit = data.prompt?.onExitInstructions;
      setSilentStart(enter === "");
      setSilentEnd(exit === "");
      setOnEnterInstructions(enter && enter !== "" ? enter : "");
      setOnExitInstructions(exit && exit !== "" ? exit : "");
      setIsActive(data.isActive);
      setModel(storedLlmModel(data.model));
      setTtsModel(storedTtsModel(data.ttsModel));
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
    setSubmitting(true);
    try {
      await updateAgentTemplate(id, {
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
        isActive,
        model,
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
      setFormError(err instanceof ApiError ? err.message : "Could not save template.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading template" />;
  if (notFound || (!data && !error)) {
    return (
      <ResourceNotFound
        kind="Template"
        id={id}
        backTo="/admin-dashboard/agents"
        backLabel="All templates"
      />
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  return (
    <div className="ops-stack">
      <p style={{ margin: 0 }}>
        <Link to="/admin-dashboard/agents" className="ops-muted">
          ← All templates
        </Link>
      </p>

      <PageHeader
        eyebrow={data.key}
        title={data.name}
        description="Platform persona template. PATCH does not retro-update existing organization agents."
        actions={<StatusBadge status={data.direction} />}
      />

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Persona</h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleSave}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {saved ? <Alert tone="success">Saved. Existing org agents are not updated.</Alert> : null}
            <Field label="System prompt" htmlFor="tpl-prompt" required>
              <Textarea
                id="tpl-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={10}
                disabled={submitting}
              />
            </Field>
            <Field
              label="On-start instructions (LiveKit onEnter)"
              htmlFor="tpl-on-enter"
              hint="Spoken when the call starts. Leave empty for built-in default. Check silent to skip."
            >
              <Textarea
                id="tpl-on-enter"
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
              htmlFor="tpl-on-exit"
              hint="Spoken when the call ends. Leave empty for built-in goodbye. Check silent to skip."
            >
              <Textarea
                id="tpl-on-exit"
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
              model={model}
              ttsModel={ttsModel}
              voice={voice}
              speakingRate={speakingRate}
              deliveryMode={deliveryMode}
              temperature={temperature}
              disabled={submitting}
              onChange={(next) => {
                if (next.model !== undefined) setModel(next.model);
                if (next.ttsModel !== undefined) setTtsModel(next.ttsModel);
                if (next.voice !== undefined) setVoice(next.voice);
                if (next.speakingRate !== undefined) setSpeakingRate(next.speakingRate);
                if (next.deliveryMode !== undefined) setDeliveryMode(next.deliveryMode);
                if (next.temperature !== undefined) setTemperature(next.temperature);
              }}
            />
            <div className="ops-form-actions">
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                Save template
              </Button>
            </div>
          </form>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Defaults</h2>
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Task key</dt>
                <dd className="ops-mono">{data.defaultTaskKey}</dd>
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
