import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input, Select } from "@call-agent/ui";
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
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type DirFilter = "all" | "outbound" | "inbound";

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

function ToolPills({ ids }: { ids?: string[] }) {
  const tools = (ids ?? []).filter(Boolean);
  if (tools.length === 0) return <span className="ops-faint">—</span>;
  const shown = tools.slice(0, 2);
  const extra = tools.length - shown.length;
  return (
    <div className="ops-pills">
      {shown.map((id) => (
        <span key={id} className="ops-pill">
          {id}
        </span>
      ))}
      {extra > 0 ? <span className="ops-pill is-more">+{extra}</span> : null}
    </div>
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

  const [dir, setDir] = useState<DirFilter>("all");
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [toolProfileId, setToolProfileId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

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
    setCreatedName(null);
    if (!agentId) {
      setFormError("Select a platform template.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createUserAgent({
        agentId,
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
        toolProfileId: toolProfileId || undefined,
      });
      setAgentId("");
      setName("");
      setSlug("");
      setToolProfileId("");
      setCreatedName(created.name);
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

  const agents = data?.agents ?? [];
  const templates = data?.templates ?? [];
  const profiles = data?.profiles ?? [];
  const selectedTemplate = templates.find((t) => t.id === agentId);
  const outbound = agents.filter((a) => a.direction === "outbound").length;
  const inbound = agents.filter((a) => a.direction === "inbound").length;
  const active = agents.filter((a) => a.isActive).length;

  const visible = useMemo(() => {
    if (dir === "all") return agents;
    return agents.filter((a) => a.direction === dir);
  }, [agents, dir]);

  if (loading && !data) return <LoadingBlock label="Loading agents" />;
  if ((error || !data) && !loading) {
    return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  }

  return (
    <div className="ops-desk">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <h1>Agents</h1>
          <div className="ops-mode-toggle" role="tablist" aria-label="Agent direction">
            {(
              [
                ["all", "All"],
                ["outbound", "Outbound"],
                ["inbound", "Inbound"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={dir === key}
                className={`ops-mode-btn${dir === key ? " is-active" : ""}`}
                onClick={() => setDir(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="ops-desk-counts">
          <li>
            <span className="ops-desk-stat">
              <strong>{active}</strong>
              <span>active</span>
            </span>
          </li>
          <li>
            <span className="ops-desk-stat">
              <strong>{outbound}</strong>
              <span>out</span>
            </span>
          </li>
          <li>
            <span className="ops-desk-stat">
              <strong>{inbound}</strong>
              <span>in</span>
            </span>
          </li>
        </ul>
      </div>

      <div className="ops-desk-board">
        <section className="ops-panel ops-desk-compose">
          <div className="ops-panel-head">
            <span className="ops-desk-kicker">New agent</span>
            <span className="ops-desk-hint">From template</span>
          </div>
          <form
            className="ops-panel-body ops-form ops-desk-form"
            onSubmit={handleCreate}
            noValidate
          >
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {createdName ? (
              <Alert tone="success">
                Created {createdName}. Open it from the roster to edit persona.
              </Alert>
            ) : null}
            {templates.length === 0 ? (
              <Alert tone="info">No platform templates available.</Alert>
            ) : null}

            <Field label="Template" htmlFor="ua-create-tpl" required>
              <Select
                id="ua-create-tpl"
                value={agentId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={submitting}
              >
                <option value="">Select template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.key}) · {t.direction}
                  </option>
                ))}
              </Select>
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

            <Field label="Slug" htmlFor="ua-create-slug" hint="Unique in org · auto if empty">
              <Input
                id="ua-create-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={submitting}
                placeholder="booking-confirmations"
              />
            </Field>
            <Field label="Tool profile" htmlFor="ua-create-tp">
              <Select
                id="ua-create-tp"
                value={toolProfileId}
                onChange={(e) => setToolProfileId(e.target.value)}
                disabled={submitting || !selectedTemplate}
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
              </Select>
            </Field>

            <div className="ops-desk-submit">
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

        <section className="ops-panel ops-desk-list">
          <div className="ops-desk-list-bar">
            <div className="ops-desk-list-bar-main">
              <span className="ops-desk-kicker">Roster</span>
              <span className="ops-desk-hint">
                {visible.length} {dir === "all" ? "total" : dir}
              </span>
            </div>
          </div>
          <div className="ops-panel-body is-flush ops-desk-list-body">
            {visible.length === 0 ? (
              <EmptyState
                title={agents.length === 0 ? "No agents yet" : "No agents in this filter"}
                description={
                  agents.length === 0
                    ? "Create from a template on the left, then edit persona and hooks."
                    : "Switch direction or create another config."
                }
              />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table ops-desk-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Dir</th>
                      <th>Task</th>
                      <th>Tools</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link
                            to={`/dashboard/agents/${a.id}`}
                            className="ops-desk-entity"
                          >
                            <span className="ops-desk-entity-name">{a.name}</span>
                            <span className="ops-desk-entity-meta">
                              <span className="ops-mono">{a.slug ?? a.key}</span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={a.direction} />
                        </td>
                        <td className="ops-mono">{a.defaultTaskKey}</td>
                        <td>
                          <ToolPills ids={a.enabledTools} />
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
    </div>
  );
}
