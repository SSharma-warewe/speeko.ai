import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  createUserOutboundCall,
  listUserAgents,
  listUserOutboundTrunks,
  TASK_KEYS,
  UnauthorizedError,
  type CallRecord,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatTaskContextSkeleton } from "../../lib/task-context-skeletons";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserDialNowPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [agents, trunks] = await Promise.all([
      listUserAgents(),
      listUserOutboundTrunks(),
    ]);
    return { agents, trunks };
  }, []);

  const [organizationAgentId, setOrganizationAgentId] = useState("");
  const [sipTrunkId, setSipTrunkId] = useState("");
  const [task, setTask] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [contextJson, setContextJson] = useState(() =>
    formatTaskContextSkeleton("general"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<CallRecord | null>(null);

  const selectedAgent = data?.agents.find((a) => a.id === organizationAgentId);
  const effectiveTask = task || selectedAgent?.defaultTaskKey || "general";

  const applySkeletonForTask = (taskKey: string | null | undefined) => {
    setContextJson(formatTaskContextSkeleton(taskKey || "general"));
  };

  useEffect(() => {
    if (!data) return;
    const active = data.agents.filter((a) => a.isActive);
    if (!organizationAgentId && active.length > 0) {
      const agent = active[0];
      setOrganizationAgentId(agent.id);
      setTask(agent.defaultTaskKey || "");
      applySkeletonForTask(agent.defaultTaskKey || "general");
    }
    if (!sipTrunkId && data.trunks.length > 0) {
      const live = data.trunks.find((t) => t.isActive && t.status === "live");
      if (live) setSipTrunkId(live.id);
    }
  }, [data, organizationAgentId, sipTrunkId]);

  const handleAgentChange = (id: string) => {
    setOrganizationAgentId(id);
    const agent = data?.agents.find((a) => a.id === id);
    const nextTask = agent?.defaultTaskKey || "";
    setTask(nextTask);
    applySkeletonForTask(nextTask || "general");
  };

  const handleTaskChange = (value: string) => {
    setTask(value);
    const agentDefault =
      data?.agents.find((a) => a.id === organizationAgentId)?.defaultTaskKey ||
      "general";
    applySkeletonForTask(value || agentDefault);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setResult(null);

    if (!organizationAgentId) {
      setFormError("Select an agent.");
      return;
    }
    if (!toNumber.trim()) {
      setFormError("Enter a destination phone number.");
      return;
    }

    let context: Record<string, unknown> = { phoneNumber: toNumber.trim() };
    const raw = contextJson.trim();
    if (raw && raw !== "{}") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setFormError("Context must be a JSON object.");
          return;
        }
        context = {
          phoneNumber: toNumber.trim(),
          ...(parsed as Record<string, unknown>),
        };
      } catch {
        setFormError("Context JSON is invalid.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const call = await createUserOutboundCall({
        organizationAgentId,
        toNumber: toNumber.trim(),
        context,
        waitUntilAnswered: false,
        ...(task ? { task } : {}),
        ...(sipTrunkId ? { sipTrunkId } : {}),
      });
      setResult(call);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not place call.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading dial form" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { agents, trunks } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Dial now"
        description="Immediate outbound SIP call. Bypasses queue concurrency — use for one-off dials. Prefer Enqueue for bulk."
      />

      <section className="ops-panel">
        <div className="ops-panel-head">
          <h2>Single outbound</h2>
        </div>
        <form className="ops-panel-body ops-form" onSubmit={handleSubmit}>
          <div className="ops-form-alerts">
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {result ? (
              <Alert tone="success">
                Call placed · <StatusBadge status={result.status} /> ·{" "}
                <Link to={`/dashboard/calls/${result.id}`}>Open call detail →</Link>
              </Alert>
            ) : null}
          </div>

          <div className="ops-form-split">
            <div className="ops-form-split__col">
              <div className="ops-form-grid">
                <Field label="Agent" htmlFor="dn-agent" required>
                  <Select
                    id="dn-agent"
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
                <Field label="To number" htmlFor="dn-to" required>
                  <Input
                    id="dn-to"
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                    disabled={submitting}
                    placeholder="+919876543210"
                  />
                </Field>
                <Field label="Task key" htmlFor="dn-task">
                  <Select
                    id="dn-task"
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
                <Field label="SIP trunk" htmlFor="dn-trunk">
                  <Select
                    id="dn-trunk"
                    value={sipTrunkId}
                    onChange={(e) => setSipTrunkId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">Default (first active)</option>
                    {trunks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <div className="ops-form-split__col ops-form-split__col--side">
              <Field
                label="Context (JSON)"
                htmlFor="dn-ctx"
                hint={`Skeleton for task “${effectiveTask}”. Merged with phoneNumber from To number. Changing the task resets this template.`}
              >
                <Textarea
                  id="dn-ctx"
                  value={contextJson}
                  onChange={(e) => setContextJson(e.target.value)}
                  rows={12}
                  disabled={submitting}
                  className="ops-mono"
                />
              </Field>
            </div>
          </div>

          <div className="ops-form-actions">
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
              Place call
            </Button>
            <Link to="/dashboard/enqueue">
              <Button type="button" variant="secondary" disabled={submitting}>
                Bulk enqueue instead
              </Button>
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
