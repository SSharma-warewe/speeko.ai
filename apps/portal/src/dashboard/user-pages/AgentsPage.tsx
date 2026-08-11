import { useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  createUserAgent,
  listUserAgentTemplates,
  listUserAgents,
  listUserToolProfiles,
  type Agent,
  type ToolProfile,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
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

function defaultProfileId(
  template: Agent | undefined,
  profiles: ToolProfile[],
): string {
  if (!template) return "";
  if (template.toolProfileId) {
    const linked = profiles.find((p) => p.id === template.toolProfileId);
    if (linked) return linked.id;
  }
  const keyHint = template.direction === "outbound" ? "outbound" : "default";
  return (
    profiles.find((p) => p.key === keyHint && !p.organizationId)?.id ??
    profiles[0]?.id ??
    ""
  );
}

export default function UserAgentsPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [agents, templates, profiles] = await Promise.all([
      listUserAgents(),
      listUserAgentTemplates(),
      listUserToolProfiles(),
    ]);
    return { agents, templates, profiles };
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [toolProfileId, setToolProfileId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleTemplateChange = (nextId: string) => {
    setAgentId(nextId);
    const template = data?.templates.find((t) => t.id === nextId);
    const profiles = data?.profiles ?? [];
    setToolProfileId(defaultProfileId(template, profiles));
    if (template) {
      setName((prev) => (prev.trim() ? prev : template.name));
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!agentId) {
      setFormError("Select a platform template.");
      return;
    }
    setSubmitting(true);
    try {
      await createUserAgent({
        agentId,
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
        toolProfileId: toolProfileId || undefined,
      });
      setAgentId("");
      setName("");
      setSlug("");
      setToolProfileId("");
      setShowForm(false);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not create agent.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading agents" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { agents, templates, profiles } = data;
  const selectedTemplate = templates.find((t) => t.id === agentId);

  return (
    <div>
      <PageHeader
        eyebrow="Configure"
        title="Agents"
        description="Named AI agent configs. Each can have its own persona, open/close speech, default task, and tool profile. Create multiple from the same inbound/outbound template."
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "New agent"}
          </Button>
        }
      />

      {showForm ? (
        <section className="ops-panel" style={{ marginBottom: "1.25rem" }}>
          <div className="ops-panel-head">
            <h2>Create agent</h2>
          </div>
          <form className="ops-panel-body ops-form" onSubmit={handleCreate} noValidate>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <div className="ops-form-grid">
              <Field label="Template" htmlFor="ua-create-tpl" required>
                <select
                  id="ua-create-tpl"
                  value={agentId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={submitting}
                  style={selectStyle}
                >
                  <option value="">Select template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.key}) · {t.direction}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Display name" htmlFor="ua-create-name">
                <Input
                  id="ua-create-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder={selectedTemplate?.name ?? "My agent"}
                />
              </Field>
              <Field
                label="Slug (optional)"
                htmlFor="ua-create-slug"
                hint="Unique in your org. Auto-generated if empty."
              >
                <Input
                  id="ua-create-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={submitting}
                  placeholder="booking-confirmations"
                />
              </Field>
              <Field label="Tool profile" htmlFor="ua-create-tp">
                <select
                  id="ua-create-tp"
                  value={toolProfileId}
                  onChange={(e) => setToolProfileId(e.target.value)}
                  disabled={submitting || !selectedTemplate}
                  style={selectStyle}
                >
                  {!selectedTemplate ? (
                    <option value="">Select a template first…</option>
                  ) : (
                    profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatToolProfileLabel(p)}
                      </option>
                    ))
                  )}
                </select>
              </Field>
            </div>
            <div className="ops-form-actions">
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting || !agentId}
              >
                Create agent
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {agents.length === 0 ? (
            <EmptyState
              title="No agents yet"
              description="Create an inbound or outbound agent config, then edit persona and hooks. You can also clone an existing agent for a different tool profile."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Direction</th>
                    <th>Task</th>
                    <th>Tools</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/dashboard/agents/${a.id}`}>
                          <strong>{a.name}</strong>
                        </Link>
                      </td>
                      <td className="ops-mono">{a.slug ?? "—"}</td>
                      <td>
                        <StatusBadge status={a.direction} />
                      </td>
                      <td className="ops-mono">{a.defaultTaskKey}</td>
                      <td className="ops-faint">
                        {a.enabledTools?.length
                          ? a.enabledTools.join(", ")
                          : "—"}
                      </td>
                      <td>
                        <StatusBadge
                          status={a.isActive ? "live" : "inactive"}
                          label={a.isActive ? "Active" : "Inactive"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const selectStyle: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 0.75rem",
  borderRadius: 8,
  border: "1px solid var(--ops-line)",
  font: "inherit",
  background: "#fff",
};
