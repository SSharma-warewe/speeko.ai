import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@call-agent/ui";
import {
  ApiError,
  enqueueUserCalls,
  listUserAgents,
  listUserOutboundTrunks,
  TASK_KEYS,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { useUserAsync } from "../hooks/useAsync";

export default function UserEnqueuePage() {
  const { logout } = useUserAuth();
  const navigate = useNavigate();
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
  const [maxAttempts, setMaxAttempts] = useState("");
  const [priority, setPriority] = useState("0");
  const [maxConcurrent, setMaxConcurrent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ batchId: string; count: number } | null>(
    null,
  );

  useEffect(() => {
    if (!data) return;
    const active = data.agents.filter((a) => a.isActive);
    if (!organizationAgentId && active.length > 0) {
      setOrganizationAgentId(active[0].id);
      setTask(active[0].defaultTaskKey || "");
    }
    if (!sipTrunkId && data.trunks.length > 0) {
      const live = data.trunks.find((t) => t.isActive && t.status === "live");
      if (live) setSipTrunkId(live.id);
    }
  }, [data, organizationAgentId, sipTrunkId]);

  const handleAgentChange = (id: string) => {
    setOrganizationAgentId(id);
    const agent = data?.agents.find((a) => a.id === id);
    if (agent?.defaultTaskKey) setTask(agent.defaultTaskKey);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

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
        calls: numbers.map((toNumber) => ({
          toNumber,
          context: { phoneNumber: toNumber },
        })),
        ...(task ? { task } : {}),
        ...(sipTrunkId ? { sipTrunkId } : {}),
        ...(maxAttempts ? { maxAttempts: Number(maxAttempts) } : {}),
        ...(priority !== "" ? { priority: Number(priority) } : {}),
        ...(maxConcurrent ? { maxConcurrent: Number(maxConcurrent) } : {}),
      });
      setSuccess({ batchId: result.batchId, count: result.count });
      setNumbersText("");
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

  if (loading) return <LoadingBlock label="Loading enqueue form" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  const { agents, trunks } = data;
  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Enqueue outbound"
        description="Create a batch of 1–50 pending SIP calls. The API queue dialer claims them under your concurrency and rate limits."
      />

      <section className="ops-panel">
        <div className="ops-panel-head">
          <h2>Batch form</h2>
        </div>
        <form className="ops-panel-body ops-form" onSubmit={handleSubmit}>
          <div className="ops-form-alerts">
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            {success ? (
              <Alert tone="success">
                Enqueued {success.count} call{success.count === 1 ? "" : "s"}.{" "}
                <Link to={`/dashboard/batches/${success.batchId}`}>View batch →</Link>
                {" · "}
                <Link to={`/dashboard/calls?batchId=${success.batchId}`}>View calls →</Link>
              </Alert>
            ) : null}
            {activeAgents.length === 0 ? (
              <Alert tone="info">
                No active agents.{" "}
                <Link to="/dashboard/agents">Configure agents</Link> or ask an admin to assign
                one.
              </Alert>
            ) : null}
            {trunks.length === 0 ? (
              <Alert tone="info">
                No outbound SIP trunks.{" "}
                <Link to="/dashboard/sip">Add a trunk</Link> before dialing.
              </Alert>
            ) : null}
          </div>

          <div className="ops-form-split">
            <div className="ops-form-split__col">
              <Field
                label="Phone numbers"
                htmlFor="eq-numbers"
                required
                hint="One per line or comma-separated. E.164 preferred (e.g. +919876543210). Max 50."
              >
                <Textarea
                  id="eq-numbers"
                  value={numbersText}
                  onChange={(e) => setNumbersText(e.target.value)}
                  rows={12}
                  disabled={submitting}
                  placeholder={"+919876543210\n+14155551234"}
                />
              </Field>
            </div>

            <div className="ops-form-split__col ops-form-split__col--side">
              <Field label="Agent" htmlFor="eq-agent" required>
                <Select
                  id="eq-agent"
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

              <Field label="Task key" htmlFor="eq-task">
                <Select
                  id="eq-task"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
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

              <Field label="SIP trunk" htmlFor="eq-trunk">
                <Select
                  id="eq-trunk"
                  value={sipTrunkId}
                  onChange={(e) => setSipTrunkId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Default (first active)</option>
                  {trunks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="ops-form-section">
                <p className="ops-form-section__title">Batch options</p>
                <div className="ops-form-grid">
                  <Field label="Max attempts" htmlFor="eq-att">
                    <Input
                      id="eq-att"
                      type="number"
                      min={1}
                      max={20}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      disabled={submitting}
                      placeholder="Org default"
                    />
                  </Field>
                  <Field label="Priority" htmlFor="eq-pri">
                    <Input
                      id="eq-pri"
                      type="number"
                      min={0}
                      max={1000}
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="Max concurrent" htmlFor="eq-conc" className="ops-form-span-2">
                    <Input
                      id="eq-conc"
                      type="number"
                      min={1}
                      max={100}
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(e.target.value)}
                      disabled={submitting}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="ops-form-actions">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting || activeAgents.length === 0}
            >
              Enqueue batch
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => navigate("/dashboard/dial")}
            >
              Dial single instead
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
