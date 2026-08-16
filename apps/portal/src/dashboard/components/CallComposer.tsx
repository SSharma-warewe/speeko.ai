import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  createUserOutboundCall,
  enqueueUserCalls,
  listUserAgents,
  listUserOutboundTrunks,
  TASK_KEYS,
  UnauthorizedError,
  type CallRecord,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatTaskContextSkeleton } from "../../lib/task-context-skeletons";
import { StatusBadge } from "./StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export type ComposeMode = "enqueue" | "dial";

type Props = {
  mode: ComposeMode;
  onModeChange: (mode: ComposeMode) => void;
  presetAgentId?: string;
  onEnqueued?: (result: { batchId: string; count: number }) => void;
  onDialed?: (call: CallRecord) => void;
};

export function CallComposer({
  mode,
  onModeChange,
  presetAgentId,
  onEnqueued,
  onDialed,
}: Props) {
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
  const [numbersText, setNumbersText] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [priority, setPriority] = useState("0");
  const [maxConcurrent, setMaxConcurrent] = useState("");
  const [contextJson, setContextJson] = useState(() =>
    formatTaskContextSkeleton("general"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [enqueueOk, setEnqueueOk] = useState<{
    batchId: string;
    count: number;
  } | null>(null);
  const [dialed, setDialed] = useState<CallRecord | null>(null);

  const selectedAgent = data?.agents.find((a) => a.id === organizationAgentId);
  const effectiveTask = task || selectedAgent?.defaultTaskKey || "general";

  const applySkeletonForTask = (taskKey: string | null | undefined) => {
    setContextJson(formatTaskContextSkeleton(taskKey || "general"));
  };

  useEffect(() => {
    if (!data) return;
    const active = data.agents.filter((a) => a.isActive);
    if (!organizationAgentId) {
      const preset = presetAgentId
        ? data.agents.find((a) => a.id === presetAgentId)
        : undefined;
      const pick = preset ?? active[0];
      if (pick) {
        setOrganizationAgentId(pick.id);
        setTask(pick.defaultTaskKey || "");
        applySkeletonForTask(pick.defaultTaskKey || "general");
      }
    }
    if (!sipTrunkId && data.trunks.length > 0) {
      const live = data.trunks.find((t) => t.isActive && t.status === "live");
      if (live) setSipTrunkId(live.id);
    }
  }, [data, organizationAgentId, sipTrunkId, presetAgentId]);

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

  const handleEnqueue = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEnqueueOk(null);
    setDialed(null);

    const numbers = numbersText
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);

    if (!organizationAgentId) {
      setFormError("Select an agent.");
      return;
    }
    if (numbers.length === 0) {
      setFormError("Enter at least one phone number (one per line or comma-separated).");
      return;
    }
    if (numbers.length > 50) {
      setFormError("Maximum 50 numbers per batch.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await enqueueUserCalls({
        organizationAgentId,
        calls: numbers.map((num) => ({
          toNumber: num,
          context: { phoneNumber: num },
        })),
        ...(task ? { task } : {}),
        ...(sipTrunkId ? { sipTrunkId } : {}),
        ...(maxAttempts ? { maxAttempts: Number(maxAttempts) } : {}),
        ...(priority !== "" ? { priority: Number(priority) } : {}),
        ...(maxConcurrent ? { maxConcurrent: Number(maxConcurrent) } : {}),
      });
      setEnqueueOk({ batchId: result.batchId, count: result.count });
      setNumbersText("");
      onEnqueued?.({ batchId: result.batchId, count: result.count });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      setFormError(err instanceof ApiError ? err.message : "Could not enqueue calls.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDial = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEnqueueOk(null);
    setDialed(null);

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
      setDialed(call);
      onDialed?.(call);
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

  const agents = data?.agents ?? [];
  const trunks = data?.trunks ?? [];
  const activeAgents = agents.filter((a) => a.isActive);
  const numberCount = numbersText
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean).length;

  return (
    <section
      className={`ops-panel ops-calls-compose${mode === "dial" ? " is-dial" : " is-enqueue"}`}
    >
      <div className="ops-panel-head">
        <div
          className="ops-mode-toggle"
          role="tablist"
          aria-label="Outbound compose"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "dial"}
            className={`ops-mode-btn${mode === "dial" ? " is-active" : ""}`}
            onClick={() => onModeChange("dial")}
          >
            Dial now
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "enqueue"}
            className={`ops-mode-btn${mode === "enqueue" ? " is-active" : ""}`}
            onClick={() => onModeChange("enqueue")}
          >
            Enqueue
          </button>
        </div>
        <span className="ops-calls-compose-hint">
          {mode === "enqueue" ? "1–50 · queued" : "Skips the queue"}
        </span>
      </div>

      <form
        className="ops-panel-body ops-form ops-calls-form"
        onSubmit={mode === "enqueue" ? handleEnqueue : handleDial}
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {enqueueOk ? (
          <Alert tone="success">
            Enqueued {enqueueOk.count} call{enqueueOk.count === 1 ? "" : "s"}.{" "}
            <Link to={`/dashboard/batches/${enqueueOk.batchId}`}>Batch</Link>
            {" · "}
            <Link to={`/dashboard/calls?compose=enqueue&batchId=${enqueueOk.batchId}`}>
              Filter list
            </Link>
          </Alert>
        ) : null}
        {dialed ? (
          <Alert tone="success">
            Call placed · <StatusBadge status={dialed.status} /> ·{" "}
            <Link to={`/dashboard/calls/${dialed.id}`}>Open detail</Link>
          </Alert>
        ) : null}
        {loading && !data ? (
          <p className="ops-muted" style={{ margin: 0 }}>
            Loading agents and trunks…
          </p>
        ) : null}
        {error ? (
          <Alert tone="error">
            {error}{" "}
            <button type="button" className="ops-calls-text-btn" onClick={reload}>
              Retry
            </button>
          </Alert>
        ) : null}
        {data && activeAgents.length === 0 ? (
          <Alert tone="info">
            No active agents. <Link to="/dashboard/agents">Configure agents</Link>
          </Alert>
        ) : null}
        {data && trunks.length === 0 ? (
          <Alert tone="info">
            No outbound SIP trunks. <Link to="/dashboard/sip">Add a trunk</Link>
          </Alert>
        ) : null}

        <div className="ops-calls-destination">
          {mode === "dial" ? (
            <Field
              label="Number"
              htmlFor="calls-to"
              required
              className="ops-calls-hotline"
            >
              <Input
                id="calls-to"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                disabled={submitting}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                inputMode="tel"
                inputSize="lg"
              />
            </Field>
          ) : (
            <Field
              label="Phone numbers"
              htmlFor="calls-numbers"
              required
              hint={`${numberCount}/50 · one per line or comma-separated`}
            >
              <Textarea
                id="calls-numbers"
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                rows={5}
                disabled={submitting}
                placeholder={"+919876543210\n+14155551234"}
              />
            </Field>
          )}
        </div>

        <div className="ops-calls-routing">
          <Field
            label="Agent"
            htmlFor="calls-agent"
            required
            className="ops-calls-routing-agent"
          >
            <Select
              id="calls-agent"
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

          <Field label="Task" htmlFor="calls-task">
            <Select
              id="calls-task"
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

          <Field label="SIP trunk" htmlFor="calls-trunk">
            <Select
              id="calls-trunk"
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

        {mode === "enqueue" ? (
          <div className="ops-calls-queue-opts">
            <Field label="Attempts" htmlFor="calls-att">
              <Input
                id="calls-att"
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                disabled={submitting}
                placeholder="Default"
              />
            </Field>
            <Field label="Priority" htmlFor="calls-pri">
              <Input
                id="calls-pri"
                type="number"
                min={0}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Concurrent" htmlFor="calls-conc">
              <Input
                id="calls-conc"
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
        ) : null}

        <div className="ops-calls-submit">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={submitting || activeAgents.length === 0}
          >
            {mode === "enqueue" ? "Enqueue batch" : "Place call"}
          </Button>
        </div>

        {mode === "dial" ? (
          <details className="ops-calls-advanced">
            <summary>Advanced — context JSON for “{effectiveTask}”</summary>
            <Field
              label="Context"
              htmlFor="calls-ctx"
              hint="Merged with phoneNumber from To number. Changing the task resets this template."
            >
              <Textarea
                id="calls-ctx"
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                rows={7}
                disabled={submitting}
                className="ops-mono"
              />
            </Field>
          </details>
        ) : null}
      </form>
    </section>
  );
}
