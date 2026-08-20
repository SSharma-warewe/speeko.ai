import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button, Field, Input } from "@call-agent/ui";
import {
  ApiError,
  assignOrgAgent,
  listAgentTemplates,
  listOrgAgents,
  listOrgToolProfiles,
  TASK_KEYS,
  type Agent,
  type ToolProfile,
  UnauthorizedError,
} from "../../lib/api";
import { useAdminAuth } from "../../lib/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";

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

/** Prefer template default profile; else direction seed key. */
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

export default function OrgAgentsPage() {
  const { orgId = "" } = useParams();
  const { logout } = useAdminAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [agents, templates, profiles] = await Promise.all([
      listOrgAgents(orgId),
      listAgentTemplates(),
      listOrgToolProfiles(orgId),
    ]);
    return { agents, templates, profiles };
  }, [orgId]);

  const [showForm, setShowForm] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [toolProfileId, setToolProfileId] = useState("");
  const [defaultTaskKey, setDefaultTaskKey] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleTemplateChange = (
    nextAgentId: string,
    templates: Agent[],
    profiles: ToolProfile[],
  ) => {
    setAgentId(nextAgentId);
    if (!nextAgentId) {
      setToolProfileId("");
      setName("");
      setSlug("");
      setDefaultTaskKey("general");
      return;
    }
    const template = templates.find((t) => t.id === nextAgentId);
    setToolProfileId(defaultProfileId(template, profiles));
    setDefaultTaskKey(template?.defaultTaskKey || "general");
    if (template && !name.trim()) {
      setName(template.name);
    }
  };

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!agentId) {
      setFormError("Select a platform agent template.");
      return;
    }
    const template = data?.templates.find((t) => t.id === agentId);
    if (template?.direction === "inbound" && !defaultTaskKey.trim()) {
      setFormError("Inbound agents require a default task.");
      return;
    }
    const profiles = data?.profiles ?? [];
    const resolvedProfileId =
      (toolProfileId && profiles.some((p) => p.id === toolProfileId)
        ? toolProfileId
        : defaultProfileId(template, profiles)) || undefined;

    setSubmitting(true);
    try {
      await assignOrgAgent(orgId, {
        agentId,
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
        toolProfileId: resolvedProfileId,
        ...(template?.direction === "inbound" ? { defaultTaskKey } : {}),
      });
      setAgentId("");
      setName("");
      setSlug("");
      setToolProfileId("");
      setDefaultTaskKey("general");
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
  const effectiveProfileId =
    toolProfileId && profiles.some((p) => p.id === toolProfileId)
      ? toolProfileId
      : defaultProfileId(selectedTemplate, profiles);
  const selectedProfile = profiles.find((p) => p.id === effectiveProfileId);
  const previewTools =
    selectedProfile?.toolIds ??
    selectedTemplate?.enabledTools ??
    [];

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>Organization agents</h2>
        <Button type="button" variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New agent"}
        </Button>
      </div>

      {showForm ? (
        <form className="ops-inline-form ops-form" onSubmit={handleAssign} noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="ops-form-grid">
            <Field
              label="Platform template"
              htmlFor="assign-agent"
              required
              hint="Starter for direction and default persona. You can create many configs from the same template."
            >
              <select
                id="assign-agent"
                value={agentId}
                onChange={(e) =>
                  handleTemplateChange(e.target.value, templates, profiles)
                }
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
            <Field
              label="Display name"
              htmlFor="assign-name"
              hint="Unique label for this config (e.g. Booking confirmations)."
            >
              <Input
                id="assign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder={selectedTemplate?.name ?? "My outbound agent"}
              />
            </Field>
            <Field
              label="Slug (optional)"
              htmlFor="assign-slug"
              hint="Unique per org. Leave blank to auto-generate from the name."
            >
              <Input
                id="assign-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={submitting}
                placeholder="booking-confirmations"
                className="ops-mono"
              />
            </Field>
            <Field
              label="Tool profile"
              htmlFor="assign-profile"
              hint={
                selectedTemplate
                  ? "Platform seeds + this org’s custom profiles. Default is the template’s recommended profile."
                  : "Select a platform template first."
              }
            >
              <select
                id="assign-profile"
                value={effectiveProfileId}
                onChange={(e) => setToolProfileId(e.target.value)}
                disabled={submitting || !selectedTemplate || profiles.length === 0}
                style={selectStyle}
              >
                {!selectedTemplate ? (
                  <option value="">Select a template first…</option>
                ) : profiles.length === 0 ? (
                  <option value="">No tool profiles available</option>
                ) : (
                  profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatToolProfileLabel(p)}
                    </option>
                  ))
                )}
              </select>
            </Field>
            {selectedTemplate?.direction === "inbound" ? (
              <Field
                label="Default task"
                htmlFor="assign-task"
                required
                hint="Workflow packed on inbound ring."
              >
                <select
                  id="assign-task"
                  value={defaultTaskKey}
                  onChange={(e) => setDefaultTaskKey(e.target.value)}
                  disabled={submitting}
                  style={selectStyle}
                >
                  {TASK_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          {selectedTemplate && previewTools.length > 0 ? (
            <div>
              <div className="ops-faint" style={{ fontSize: "0.7rem", marginBottom: "0.4rem" }}>
                {selectedTemplate.direction.toUpperCase()} TOOLS
              </div>
              <div className="ops-chip-row">
                {previewTools.map((t) => (
                  <span key={t} className="ops-tool-chip">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="ops-form-actions">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting || !agentId || templates.length === 0}
            >
              Create agent
            </Button>
          </div>
        </form>
      ) : null}

      <div className="ops-panel-body is-flush">
        {agents.length === 0 ? (
          <EmptyState
            title="No agents yet"
            description="Create named agent configs from inbound/outbound templates. Each can have its own prompt, hooks, and tool profile."
          />
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Template</th>
                  <th>Direction</th>
                  <th>Tools</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/admin-dashboard/organizations/${orgId}/agents/${a.id}`}>
                        <strong>{a.name}</strong>
                      </Link>
                    </td>
                    <td className="ops-mono">{a.slug ?? "—"}</td>
                    <td className="ops-mono">{a.templateKey ?? a.key}</td>
                    <td>
                      <StatusBadge status={a.direction} />
                    </td>
                    <td>
                      <div className="ops-chip-row">
                        {(a.enabledTools ?? []).slice(0, 4).map((t) => (
                          <span key={t} className="ops-tool-chip">
                            {t}
                          </span>
                        ))}
                        {(a.enabledTools?.length ?? 0) > 4 ? (
                          <span className="ops-faint">+{a.enabledTools.length - 4}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        status={a.isActive ? "active" : "inactive"}
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
