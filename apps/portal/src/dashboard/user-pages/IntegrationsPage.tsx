import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  createUserIntegrationEndpoint,
  createUserOrgIntegration,
  deleteUserIntegrationEndpoint,
  deleteUserOrgIntegration,
  listUserAgents,
  listUserIntegrationEndpoints,
  listUserOrgIntegrations,
  listUserOutboundTrunks,
  previewGhlCalendars,
  rotateUserIntegrationEndpointKey,
  TASK_KEYS,
  testUserOrgIntegration,
  UnauthorizedError,
  updateUserIntegrationEndpoint,
  updateUserOrgIntegration,
  type GhlCalendarOption,
  type IntegrationEndpoint,
  type IntegrationEndpointSecret,
  type IntegrationProvider,
  type OrganizationIntegration,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatRelative } from "../../lib/format";
import {
  formatTaskContextSkeleton,
  getTaskContextSkeleton,
} from "../../lib/task-context-skeletons";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type IntegMode = "dial" | "calendar";

const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "/api");

function absoluteEndpointUrl(endpointPath: string): string {
  const base = API_ORIGIN.endsWith("/api")
    ? API_ORIGIN.slice(0, -4)
    : API_ORIGIN;
  return `${base}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function parseMode(raw: string | null): IntegMode {
  return raw === "calendar" ? "calendar" : "dial";
}

function formatAccountId(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

const GHL_V3_SCOPES = [
  { label: "View Calendars", scope: "calendars.readonly" },
  { label: "View Calendar Events", scope: "calendars/events.readonly" },
  { label: "Edit Calendar Events", scope: "calendars/events.write" },
  { label: "View Contacts", scope: "contacts.readonly" },
  { label: "Edit Contacts", scope: "contacts.write" },
] as const;

function calendarLabel(cal: GhlCalendarOption): string {
  return cal.name ? `${cal.name} · ${cal.id}` : cal.id;
}

export default function UserIntegrationsPage() {
  const { logout } = useUserAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<IntegMode>(parseMode(searchParams.get("tab")));

  const { data, error, loading, reload } = useUserAsync(async () => {
    const [endpoints, agents, trunks, calendars] = await Promise.all([
      listUserIntegrationEndpoints(),
      listUserAgents(),
      listUserOutboundTrunks(),
      listUserOrgIntegrations(),
    ]);
    return { endpoints, agents, trunks, calendars };
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [organizationAgentId, setOrganizationAgentId] = useState("");
  const [task, setTask] = useState("");
  const [sipTrunkId, setSipTrunkId] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [priority, setPriority] = useState("0");
  const [maxConcurrent, setMaxConcurrent] = useState("");
  const [defaultContextText, setDefaultContextText] = useState(
    formatTaskContextSkeleton("general"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [secretReveal, setSecretReveal] =
    useState<IntegrationEndpointSecret | null>(null);

  const [calEditingId, setCalEditingId] = useState<string | null>(null);
  const [calProvider, setCalProvider] = useState<IntegrationProvider>("nylas");
  const [calName, setCalName] = useState("");
  const [calApiKey, setCalApiKey] = useState("");
  const [calGrantId, setCalGrantId] = useState("");
  const [calLocationId, setCalLocationId] = useState("");
  const [calCalendarId, setCalCalendarId] = useState("primary");
  const [calApiUri, setCalApiUri] = useState("https://api.us.nylas.com");
  const [calEmail, setCalEmail] = useState("");
  const [calSubmitting, setCalSubmitting] = useState(false);
  const [calFormError, setCalFormError] = useState<string | null>(null);
  const [ghlCalendars, setGhlCalendars] = useState<GhlCalendarOption[]>([]);
  const [ghlCalendarsLoading, setGhlCalendarsLoading] = useState(false);

  useEffect(() => {
    setMode(parseMode(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (!data || editingId) return;
    const active = data.agents.filter((a) => a.isActive);
    if (!organizationAgentId && active.length > 0) {
      setOrganizationAgentId(active[0].id);
      setTask(active[0].defaultTaskKey || "");
      setDefaultContextText(
        formatTaskContextSkeleton(active[0].defaultTaskKey || "general"),
      );
    }
  }, [data, editingId, organizationAgentId]);

  const setModeTab = (next: IntegMode) => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === "dial") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setOrganizationAgentId("");
    setTask("");
    setSipTrunkId("");
    setMaxAttempts("");
    setPriority("0");
    setMaxConcurrent("");
    setDefaultContextText(formatTaskContextSkeleton("general"));
    setFormError(null);
  };

  const openEdit = (ep: IntegrationEndpoint) => {
    setEditingId(ep.id);
    setName(ep.name);
    setOrganizationAgentId(ep.organizationAgentId);
    setTask(ep.taskKey || "");
    setSipTrunkId(ep.sipTrunkId || "");
    setMaxAttempts(ep.maxAttempts != null ? String(ep.maxAttempts) : "");
    setPriority(String(ep.priority ?? 0));
    setMaxConcurrent(
      ep.maxConcurrent != null ? String(ep.maxConcurrent) : "",
    );
    setDefaultContextText(
      ep.defaultContext
        ? JSON.stringify(ep.defaultContext, null, 2)
        : formatTaskContextSkeleton(ep.taskKey || "general"),
    );
    setFormError(null);
    setActionMsg(null);
    setSecretReveal(null);
    setModeTab("dial");
  };

  const handleAgentChange = (id: string) => {
    setOrganizationAgentId(id);
    const agent = data?.agents.find((a) => a.id === id);
    if (agent?.defaultTaskKey) {
      setTask(agent.defaultTaskKey);
      if (!editingId) {
        setDefaultContextText(formatTaskContextSkeleton(agent.defaultTaskKey));
      }
    }
  };

  const handleTaskChange = (taskKey: string) => {
    setTask(taskKey);
    if (!editingId) {
      setDefaultContextText(formatTaskContextSkeleton(taskKey || "general"));
    }
  };

  const parseDefaultContext = ():
    | Record<string, unknown>
    | null
    | undefined => {
    const raw = defaultContextText.trim();
    if (!raw) return editingId ? null : undefined;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === null) return null;
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Default context must be a JSON object");
      }
      return parsed as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : "Invalid default context JSON",
      );
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionMsg(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!organizationAgentId) {
      setFormError("Select an agent.");
      return;
    }

    let defaultContext: Record<string, unknown> | null | undefined;
    try {
      defaultContext = parseDefaultContext();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateUserIntegrationEndpoint(editingId, {
          name: name.trim(),
          organizationAgentId,
          task: task || undefined,
          sipTrunkId: sipTrunkId || null,
          maxAttempts: maxAttempts ? Number(maxAttempts) : null,
          priority: priority !== "" ? Number(priority) : 0,
          maxConcurrent: maxConcurrent ? Number(maxConcurrent) : null,
          defaultContext: defaultContext ?? null,
        });
        setActionMsg("Endpoint updated. CRM request shape is unchanged.");
        setSecretReveal(null);
      } else {
        const created = await createUserIntegrationEndpoint({
          name: name.trim(),
          organizationAgentId,
          ...(task ? { task } : {}),
          ...(sipTrunkId ? { sipTrunkId } : {}),
          ...(maxAttempts ? { maxAttempts: Number(maxAttempts) } : {}),
          ...(priority !== "" ? { priority: Number(priority) } : {}),
          ...(maxConcurrent
            ? { maxConcurrent: Number(maxConcurrent) }
            : {}),
          ...(defaultContext && Object.keys(defaultContext).length > 0
            ? { defaultContext }
            : {}),
        });
        setSecretReveal(created);
        setActionMsg(
          "Endpoint created. Copy the API key now — it will not be shown again.",
        );
      }
      resetForm();
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Could not save integration endpoint.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotate = async (ep: IntegrationEndpoint) => {
    if (
      !window.confirm(
        `Rotate API key for “${ep.name}”? The old key will stop working immediately.`,
      )
    ) {
      return;
    }
    setBusyId(ep.id);
    setActionMsg(null);
    try {
      const rotated = await rotateUserIntegrationEndpointKey(ep.id);
      setSecretReveal(rotated);
      setActionMsg(
        "Key rotated. Copy the new API key now — it will not be shown again.",
      );
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not rotate key.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (ep: IntegrationEndpoint) => {
    setBusyId(ep.id);
    setActionMsg(null);
    try {
      await updateUserIntegrationEndpoint(ep.id, { isActive: !ep.isActive });
      setActionMsg(
        ep.isActive
          ? `Disabled “${ep.name}”. CRM requests will get 403.`
          : `Enabled “${ep.name}”.`,
      );
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not update endpoint.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ep: IntegrationEndpoint) => {
    if (
      !window.confirm(
        `Delete “${ep.name}”? The URL and API key will stop working immediately.`,
      )
    ) {
      return;
    }
    setBusyId(ep.id);
    setActionMsg(null);
    try {
      await deleteUserIntegrationEndpoint(ep.id);
      if (secretReveal?.id === ep.id) setSecretReveal(null);
      if (editingId === ep.id) resetForm();
      setActionMsg("Endpoint deleted.");
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not delete endpoint.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const resetCalForm = () => {
    setCalEditingId(null);
    setCalProvider("nylas");
    setCalName("");
    setCalApiKey("");
    setCalGrantId("");
    setCalLocationId("");
    setCalCalendarId("primary");
    setCalApiUri("https://api.us.nylas.com");
    setCalEmail("");
    setCalFormError(null);
    setGhlCalendars([]);
  };

  const openCalEdit = (row: OrganizationIntegration) => {
    setCalEditingId(row.id);
    setCalProvider(row.provider === "ghl" ? "ghl" : "nylas");
    setCalName(row.name);
    setCalApiKey("");
    setCalGrantId(row.grantId || "");
    setCalLocationId(row.locationId || "");
    setCalCalendarId(row.calendarId || (row.provider === "ghl" ? "" : "primary"));
    setCalApiUri(row.apiUri || "https://api.us.nylas.com");
    setCalEmail(row.email || "");
    setCalFormError(null);
    setGhlCalendars([]);
    setActionMsg(null);
    setModeTab("calendar");
  };

  const applyGhlCalendarList = (list: GhlCalendarOption[]) => {
    setGhlCalendars(list);
    if (list.length === 0) return;
    const current = calCalendarId.trim();
    if (!current || !list.some((c) => c.id === current)) {
      setCalCalendarId(list[0].id);
    }
  };

  const handleLoadGhlCalendars = async () => {
    setCalFormError(null);
    setActionMsg(null);
    if (!calLocationId.trim()) {
      setCalFormError("Location ID (sub-account) is required to list calendars.");
      return;
    }
    if (!calApiKey.trim() && !calEditingId) {
      setCalFormError("Paste the Private Integration Token first.");
      return;
    }
    setGhlCalendarsLoading(true);
    try {
      if (calApiKey.trim()) {
        const result = await previewGhlCalendars({
          apiKey: calApiKey.trim(),
          locationId: calLocationId.trim(),
        });
        if (!result.ok) {
          setCalFormError(result.message || "Could not list calendars.");
          setGhlCalendars([]);
          return;
        }
        applyGhlCalendarList(result.calendars ?? []);
        setActionMsg(
          result.message ||
            `Found ${result.calendars?.length ?? 0} calendar(s).`,
        );
        return;
      }
      const result = await testUserOrgIntegration(calEditingId as string);
      if (!result.ok) {
        setCalFormError(result.message || "Could not list calendars.");
        setGhlCalendars([]);
        return;
      }
      const fromTest =
        result.calendars && result.calendars.length > 0
          ? result.calendars
          : (result.calendarIds ?? []).map((id) => ({ id }));
      applyGhlCalendarList(fromTest);
      setActionMsg(result.message || `Found ${fromTest.length} calendar(s).`);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setCalFormError(
        err instanceof ApiError ? err.message : "Could not list calendars.",
      );
    } finally {
      setGhlCalendarsLoading(false);
    }
  };

  const handleCalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCalFormError(null);
    if (!calName.trim()) {
      setCalFormError("Name is required.");
      return;
    }
    if (calProvider === "nylas" && !calGrantId.trim()) {
      setCalFormError("Grant ID is required.");
      return;
    }
    if (calProvider === "ghl" && !calLocationId.trim()) {
      setCalFormError("Location ID is required.");
      return;
    }
    if (calProvider === "ghl" && !calCalendarId.trim()) {
      setCalFormError("Calendar ID is required.");
      return;
    }
    if (!calEditingId && !calApiKey.trim()) {
      setCalFormError(
        calProvider === "ghl"
          ? "Private Integration Token is required for a new connection."
          : "API key is required for a new connection.",
      );
      return;
    }
    setCalSubmitting(true);
    try {
      if (calEditingId) {
        await updateUserOrgIntegration(calEditingId, {
          name: calName.trim(),
          apiKey: calApiKey.trim() || undefined,
          ...(calProvider === "ghl"
            ? {
                locationId: calLocationId.trim(),
                calendarId: calCalendarId.trim(),
              }
            : {
                grantId: calGrantId.trim(),
                calendarId: calCalendarId.trim() || "primary",
                apiUri: calApiUri.trim() || undefined,
                email: calEmail.trim() || null,
              }),
        });
        setActionMsg("Calendar connection updated.");
      } else {
        await createUserOrgIntegration({
          name: calName.trim(),
          provider: calProvider,
          apiKey: calApiKey.trim(),
          ...(calProvider === "ghl"
            ? {
                locationId: calLocationId.trim(),
                calendarId: calCalendarId.trim(),
              }
            : {
                grantId: calGrantId.trim(),
                calendarId: calCalendarId.trim() || "primary",
                apiUri: calApiUri.trim() || undefined,
                email: calEmail.trim() || undefined,
              }),
        });
        setActionMsg(
          "Calendar saved. Link it on an agent and enable calendar tools.",
        );
      }
      resetCalForm();
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setCalFormError(
        err instanceof ApiError ? err.message : "Could not save calendar connection.",
      );
    } finally {
      setCalSubmitting(false);
    }
  };

  const handleCalTest = async (row: OrganizationIntegration) => {
    setBusyId(row.id);
    setActionMsg(null);
    try {
      const result = await testUserOrgIntegration(row.id);
      setActionMsg(
        result.ok
          ? result.message || "Connection OK"
          : result.message || "Connection test failed",
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not test connection.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCalDelete = async (row: OrganizationIntegration) => {
    if (
      !window.confirm(
        `Delete calendar connection “${row.name}”? Agents using it will lose calendar tools until re-linked.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setActionMsg(null);
    try {
      await deleteUserOrgIntegration(row.id);
      if (calEditingId === row.id) resetCalForm();
      setActionMsg("Calendar connection deleted.");
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not delete connection.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCalToggleActive = async (row: OrganizationIntegration) => {
    setBusyId(row.id);
    try {
      await updateUserOrgIntegration(row.id, { isActive: !row.isActive });
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setActionMsg(
        err instanceof ApiError ? err.message : "Could not update connection.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading integrations" />;
  if (error || !data) {
    return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;
  }

  const { endpoints, agents, trunks, calendars } = data;
  const activeAgents = agents.filter((a) => a.isActive);
  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const isDial = mode === "dial";

  return (
    <div className="ops-desk">
      <div className="ops-desk-toolbar">
        <div className="ops-desk-toolbar-main">
          <h1>Integrations</h1>
          <div className="ops-mode-toggle" role="tablist" aria-label="Integration type">
            <button
              type="button"
              role="tab"
              aria-selected={isDial}
              className={`ops-mode-btn${isDial ? " is-active" : ""}`}
              onClick={() => setModeTab("dial")}
            >
              Dial
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isDial}
              className={`ops-mode-btn${!isDial ? " is-active" : ""}`}
              onClick={() => setModeTab("calendar")}
            >
              Calendar
            </button>
          </div>
        </div>
        <ul className="ops-desk-counts">
          <li>
            <span className={`ops-desk-stat${isDial ? " is-on" : ""}`}>
              <strong>{endpoints.length}</strong>
              <span>endpoints</span>
            </span>
          </li>
          <li>
            <span className={`ops-desk-stat${!isDial ? " is-on" : ""}`}>
              <strong>{calendars.length}</strong>
              <span>calendars</span>
            </span>
          </li>
        </ul>
      </div>

      <div className="ops-desk-board">
        {isDial ? (
          <section className="ops-panel ops-desk-compose">
            <div className="ops-panel-head">
              <span className="ops-desk-kicker">
                {editingId ? "Edit endpoint" : "New endpoint"}
              </span>
              <span className="ops-desk-hint">CRM dial-in</span>
            </div>
            <form className="ops-panel-body ops-form ops-desk-form" onSubmit={handleSubmit}>
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}
              {activeAgents.length === 0 ? (
                <Alert tone="info">
                  No active agents.{" "}
                  <Link to="/dashboard/agents">Configure agents</Link> first.
                </Alert>
              ) : null}

              {secretReveal ? (
                <div className="ops-desk-secret">
                  <Alert tone="warn">
                    Copy the key now. It will not be shown again.
                  </Alert>
                  <div className="ops-desk-secret-row">
                    <Field label="URL" htmlFor="ie-url">
                      <Input
                        id="ie-url"
                        readOnly
                        value={absoluteEndpointUrl(secretReveal.endpointPath)}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const ok = await copyText(
                          absoluteEndpointUrl(secretReveal.endpointPath),
                        );
                        setActionMsg(ok ? "URL copied." : "Could not copy URL.");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <div className="ops-desk-secret-row">
                    <Field label="API key" htmlFor="ie-key">
                      <Input
                        id="ie-key"
                        readOnly
                        value={secretReveal.apiKey}
                        className="ops-mono"
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const ok = await copyText(secretReveal.apiKey);
                        setActionMsg(ok ? "API key copied." : "Could not copy key.");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="ops-desk-note">
                    POST with{" "}
                    <code className="ops-mono">
                      {"{"}"phoneNumber":"+91…"{"}"}
                    </code>{" "}
                    and Bearer key.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSecretReveal(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : null}

              <Field label="Name" htmlFor="ie-name" required>
                <Input
                  id="ie-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="HubSpot leads"
                />
              </Field>
              <Field label="Agent" htmlFor="ie-agent" required>
                <Select
                  id="ie-agent"
                  value={organizationAgentId}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Select agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.isActive}>
                      {a.name}
                      {a.slug ? ` (${a.slug})` : a.key ? ` (${a.key})` : ""}
                      {!a.isActive ? " — inactive" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="ops-desk-pair">
                <Field label="Task" htmlFor="ie-task">
                  <Select
                    id="ie-task"
                    value={task}
                    onChange={(e) => handleTaskChange(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">Agent default</option>
                    {TASK_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Trunk" htmlFor="ie-trunk">
                  <Select
                    id="ie-trunk"
                    value={sipTrunkId}
                    onChange={(e) => setSipTrunkId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">Default</option>
                    {trunks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="ops-desk-triple">
                <Field label="Attempts" htmlFor="ie-att">
                  <Input
                    id="ie-att"
                    type="number"
                    min={1}
                    max={20}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    disabled={submitting}
                    placeholder="Default"
                  />
                </Field>
                <Field label="Priority" htmlFor="ie-pri">
                  <Input
                    id="ie-pri"
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={submitting}
                  />
                </Field>
                <Field label="Concurrent" htmlFor="ie-conc">
                  <Input
                    id="ie-conc"
                    type="number"
                    min={1}
                    max={100}
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(e.target.value)}
                    disabled={submitting}
                    placeholder="Default"
                  />
                </Field>
              </div>

              <div className="ops-desk-submit">
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={submitting || activeAgents.length === 0}
                >
                  {editingId ? "Save endpoint" : "Create + API key"}
                </Button>
              </div>
              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={resetForm}
                >
                  New instead
                </Button>
              ) : null}

              <details className="ops-desk-advanced">
                <summary>Advanced — default context JSON</summary>
                <Field
                  label="Context"
                  htmlFor="ie-ctx"
                  hint="Merged under each CRM request. Request fields win."
                >
                  <Textarea
                    id="ie-ctx"
                    value={defaultContextText}
                    onChange={(e) => setDefaultContextText(e.target.value)}
                    rows={7}
                    disabled={submitting}
                    className="ops-mono"
                    placeholder={JSON.stringify(
                      getTaskContextSkeleton(task || "general"),
                      null,
                      2,
                    )}
                  />
                </Field>
              </details>
            </form>
          </section>
        ) : (
          <section className="ops-panel ops-desk-compose">
            <div className="ops-panel-head">
              <span className="ops-desk-kicker">
                {calEditingId ? "Edit calendar" : "New calendar"}
              </span>
              <span className="ops-desk-hint">
                {calProvider === "ghl" ? "GoHighLevel" : "Nylas"}
              </span>
            </div>
            <form className="ops-panel-body ops-form ops-desk-form" onSubmit={handleCalSubmit}>
              {calFormError ? <Alert tone="error">{calFormError}</Alert> : null}
              {actionMsg ? <Alert tone="info">{actionMsg}</Alert> : null}
              <p className="ops-desk-note">
                {calProvider === "ghl" ? (
                  <>
                    GoHighLevel{" "}
                    <a
                      href="https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API v3 Private Integration
                    </a>
                    {" "}on the <strong>sub-account</strong> (not a v1 API key). Create
                    it under Settings → Private Integrations with only{" "}
                    {GHL_V3_SCOPES.map((s, i) => (
                      <span key={s.scope}>
                        {i > 0 ? "; " : ""}
                        {s.label} (
                        <span className="ops-mono">{s.scope}</span>)
                      </span>
                    ))}
                    . Calendar tools still do not create contacts — enable{" "}
                    <span className="ops-mono">lookupGhlContact</span> (
                    <span className="ops-mono">contacts.readonly</span>) and{" "}
                    <span className="ops-mono">upsertGhlContact</span> (
                    <span className="ops-mono">contacts.write</span>) on the
                    tool profile.
                    Then link this connection on an{" "}
                    <Link to="/dashboard/agents">agent</Link> and enable GHL
                    tools on a{" "}
                    <Link to="/dashboard/tool-profiles">tool profile</Link>.
                  </>
                ) : (
                  <>
                    Keys from the{" "}
                    <a
                      href="https://dashboard-v3.nylas.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Nylas dashboard
                    </a>
                    . Link on an <Link to="/dashboard/agents">agent</Link> and enable
                    calendar ids on a{" "}
                    <Link to="/dashboard/tool-profiles">tool profile</Link>.
                  </>
                )}
              </p>
              <Field label="Provider" htmlFor="cal-provider">
                <Select
                  id="cal-provider"
                  value={calProvider}
                  onChange={(e) => {
                    const next = e.target.value as IntegrationProvider;
                    setCalProvider(next);
                    setGhlCalendars([]);
                    if (!calEditingId) {
                      setCalCalendarId(next === "ghl" ? "" : "primary");
                    }
                  }}
                  disabled={calSubmitting || Boolean(calEditingId)}
                >
                  <option value="nylas">Nylas</option>
                  <option value="ghl">GoHighLevel</option>
                </Select>
              </Field>
              <Field label="Name" htmlFor="cal-name" required>
                <Input
                  id="cal-name"
                  value={calName}
                  onChange={(e) => setCalName(e.target.value)}
                  disabled={calSubmitting}
                  placeholder={
                    calProvider === "ghl"
                      ? "Clinic GHL calendar"
                      : "Clinic Google Calendar"
                  }
                />
              </Field>
              {calProvider === "nylas" ? (
                <Field label="Grant email" htmlFor="cal-email" hint="For free/busy">
                  <Input
                    id="cal-email"
                    type="email"
                    value={calEmail}
                    onChange={(e) => setCalEmail(e.target.value)}
                    disabled={calSubmitting}
                    placeholder="clinic@example.com"
                  />
                </Field>
              ) : null}
              <Field
                label={
                  calEditingId
                    ? calProvider === "ghl"
                      ? "Private Integration Token (blank = keep)"
                      : "API key (blank = keep)"
                    : calProvider === "ghl"
                      ? "Private Integration Token"
                      : "API key"
                }
                htmlFor="cal-key"
                required={!calEditingId}
                hint={
                  calProvider === "ghl"
                    ? "Bearer token from Settings → Private Integrations. Shown once — usually starts with pit-."
                    : undefined
                }
              >
                <Input
                  id="cal-key"
                  type="password"
                  autoComplete="off"
                  value={calApiKey}
                  onChange={(e) => setCalApiKey(e.target.value)}
                  disabled={calSubmitting}
                  placeholder={calProvider === "ghl" ? "pit-…" : "nyk_…"}
                  className="ops-mono"
                />
              </Field>
              {calProvider === "ghl" ? (
                <>
                  <Field
                    label="Location ID"
                    htmlFor="cal-loc"
                    required
                    hint="Sub-account id. In the GHL URL /v2/location/<id>/ or Settings → Business Profile."
                  >
                    <Input
                      id="cal-loc"
                      value={calLocationId}
                      onChange={(e) => {
                        setCalLocationId(e.target.value);
                        setGhlCalendars([]);
                      }}
                      disabled={calSubmitting}
                      className="ops-mono"
                      placeholder="sub-account location id"
                    />
                  </Field>
                  <div className="ops-desk-submit">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={ghlCalendarsLoading}
                      disabled={calSubmitting || ghlCalendarsLoading}
                      onClick={() => void handleLoadGhlCalendars()}
                    >
                      Load calendars
                    </Button>
                  </div>
                  {ghlCalendars.length > 0 ? (
                    <Field
                      label="Calendar"
                      htmlFor="cal-cal"
                      required
                      hint="From GET /calendars/?locationId= (v3). Pick the bookable calendar."
                    >
                      <Select
                        id="cal-cal"
                        value={calCalendarId}
                        onChange={(e) => setCalCalendarId(e.target.value)}
                        disabled={calSubmitting}
                      >
                        {calCalendarId &&
                        !ghlCalendars.some((c) => c.id === calCalendarId) ? (
                          <option value={calCalendarId}>
                            {calCalendarId} (saved)
                          </option>
                        ) : null}
                        {ghlCalendars.map((cal) => (
                          <option key={cal.id} value={cal.id}>
                            {calendarLabel(cal)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <Field
                      label="Calendar ID"
                      htmlFor="cal-cal"
                      required
                      hint="Load calendars above, or paste the calendar id from GHL calendar settings."
                    >
                      <Input
                        id="cal-cal"
                        value={calCalendarId}
                        onChange={(e) => setCalCalendarId(e.target.value)}
                        disabled={calSubmitting}
                        className="ops-mono"
                        placeholder="calendar id"
                      />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="Grant ID" htmlFor="cal-grant" required>
                    <Input
                      id="cal-grant"
                      value={calGrantId}
                      onChange={(e) => setCalGrantId(e.target.value)}
                      disabled={calSubmitting}
                      className="ops-mono"
                    />
                  </Field>
                  <div className="ops-desk-pair">
                    <Field label="Calendar ID" htmlFor="cal-cal">
                      <Input
                        id="cal-cal"
                        value={calCalendarId}
                        onChange={(e) => setCalCalendarId(e.target.value)}
                        disabled={calSubmitting}
                        placeholder="primary"
                      />
                    </Field>
                    <Field label="Region" htmlFor="cal-uri">
                      <Select
                        id="cal-uri"
                        value={calApiUri}
                        onChange={(e) => setCalApiUri(e.target.value)}
                        disabled={calSubmitting}
                      >
                        <option value="https://api.us.nylas.com">US</option>
                        <option value="https://api.eu.nylas.com">EU</option>
                      </Select>
                    </Field>
                  </div>
                </>
              )}
              <div className="ops-desk-submit">
                <Button type="submit" variant="primary" loading={calSubmitting}>
                  {calEditingId ? "Save calendar" : "Add calendar"}
                </Button>
              </div>
              {calEditingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={calSubmitting}
                  onClick={resetCalForm}
                >
                  New instead
                </Button>
              ) : null}
            </form>
          </section>
        )}

        <section className="ops-panel ops-desk-list">
          <div className="ops-desk-list-bar">
            <div className="ops-desk-list-bar-main">
              <span className="ops-desk-kicker">{isDial ? "Endpoints" : "Calendars"}</span>
              <span className="ops-desk-hint">
                {isDial ? `${endpoints.length} total` : `${calendars.length} total`}
              </span>
            </div>
          </div>
          <div className="ops-panel-body is-flush ops-desk-list-body">
            {isDial ? (
              endpoints.length === 0 ? (
                <EmptyState
                  title="No dial endpoints"
                  description="Create one on the left. CRM sends phoneNumber; agent and queue stay here."
                />
              ) : (
                <div className="ops-table-wrap">
                  <table className="ops-table ops-desk-table">
                    <thead>
                      <tr>
                        <th>Endpoint</th>
                        <th>Agent</th>
                        <th>Key</th>
                        <th>Used</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {endpoints.map((ep) => (
                        <tr
                          key={ep.id}
                          className={editingId === ep.id ? "is-live" : undefined}
                        >
                          <td>
                            <div className="ops-desk-entity">
                              <span className="ops-desk-entity-name">{ep.name}</span>
                              <span className="ops-desk-entity-meta">
                                <StatusBadge
                                  status={ep.isActive ? "ready" : "cancelled"}
                                  label={ep.isActive ? "Active" : "Off"}
                                />
                                <span className="ops-mono">{ep.publicId}</span>
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="ops-desk-entity">
                              <span>{agentName(ep.organizationAgentId)}</span>
                              <span className="ops-desk-entity-meta ops-mono">
                                {ep.taskKey}
                              </span>
                            </div>
                          </td>
                          <td className="ops-mono">{ep.keyPrefix}…</td>
                          <td className="ops-faint">{formatRelative(ep.lastUsedAt)}</td>
                          <td>
                            <div className="ops-row-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === ep.id}
                                onClick={async () => {
                                  const ok = await copyText(
                                    absoluteEndpointUrl(ep.endpointPath),
                                  );
                                  setActionMsg(
                                    ok ? "URL copied." : "Could not copy URL.",
                                  );
                                }}
                              >
                                Copy
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === ep.id}
                                onClick={() => openEdit(ep)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === ep.id}
                                onClick={() => handleToggleActive(ep)}
                              >
                                {ep.isActive ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === ep.id}
                                onClick={() => handleRotate(ep)}
                              >
                                Rotate
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === ep.id}
                                onClick={() => handleDelete(ep)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : calendars.length === 0 ? (
              <EmptyState
                title="No calendars"
                description="Add a Nylas or GoHighLevel connection on the left to power scheduling tools."
              />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table ops-desk-table">
                  <thead>
                    <tr>
                      <th>Calendar</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {calendars.map((row) => (
                      <tr
                        key={row.id}
                        className={calEditingId === row.id ? "is-live" : undefined}
                      >
                        <td>
                          <div className="ops-desk-entity">
                            <span className="ops-desk-entity-name">{row.name}</span>
                            <span className="ops-desk-entity-meta">
                              <span className="ops-mono">{row.apiKeyPrefix}</span>
                              <span>
                                {row.provider === "ghl" ? "GoHighLevel" : "Nylas"}
                                {row.email ? ` · ${row.email}` : ""}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td
                          className="ops-mono"
                          title={
                            row.provider === "ghl"
                              ? row.locationId || ""
                              : row.grantId || ""
                          }
                        >
                          {formatAccountId(
                            row.provider === "ghl"
                              ? row.locationId
                              : row.grantId,
                          )}
                        </td>
                        <td>
                          <StatusBadge status={row.isActive ? "active" : "inactive"} />
                        </td>
                        <td>
                          <div className="ops-row-actions">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={busyId === row.id}
                              disabled={busyId === row.id}
                              onClick={() => handleCalTest(row)}
                            >
                              Test
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => openCalEdit(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => handleCalToggleActive(row)}
                            >
                              {row.isActive ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => handleCalDelete(row)}
                            >
                              Delete
                            </Button>
                          </div>
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
