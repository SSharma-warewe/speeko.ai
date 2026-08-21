import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  getUserQueueStats,
  listUserAgents,
  listUserBatches,
  listUserCalls,
  pauseUserQueue,
  resumeUserQueue,
  UnauthorizedError,
  type Agent,
  type CallBatch,
  type CallRecord,
  type OrgQueueStats,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatRelative } from "../../lib/format";
import { CallCostCell } from "../components/CallCostCell";
import { CallOutcomeBar } from "../components/CallOutcomeBar";
import { CallsVolumeChart } from "../components/CallsVolumeChart";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type KpiTone = "live" | "warn" | "ok" | "bad";

export default function UserOverviewPage() {
  const navigate = useNavigate();
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [stats, calls, agents, batches] = await Promise.all([
      getUserQueueStats(),
      listUserCalls({ limit: 12 }),
      listUserAgents(),
      listUserBatches(),
    ]);
    return { stats, calls, agents, batches };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => reload(), 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  const handlePauseResume = async (action: "pause" | "resume") => {
    try {
      if (action === "pause") await pauseUserQueue();
      else await resumeUserQueue();
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      window.alert(err instanceof ApiError ? err.message : "Queue action failed");
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading overview" />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const { stats, calls, agents, batches } = data;
  const activeAgents = agents.filter((a) => a.isActive).length;
  const queueLabel = stats.queue.paused
    ? "Paused"
    : stats.queue.enabled
      ? "Running"
      : "Disabled";
  const recentBatches = [...batches]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 3);
  const rate14 = successRate14(stats);
  const pipeline = [
    { key: "pending", label: "Pending", value: stats.counts.pending, color: "#ca8a04" },
    { key: "creating", label: "Creating", value: stats.counts.creating, color: "#525252" },
    { key: "dialing", label: "Dialing", value: stats.counts.dialing, color: "#854d0e" },
    { key: "ready", label: "Live", value: stats.counts.ready, color: "#166534" },
  ];
  const pipeTotal = pipeline.reduce((n, p) => n + p.value, 0);

  return (
    <div className="ops-ov">
      <div className="ops-ov-strip">
        <div className="ops-ov-strip-live">
          <StatusBadge
            status={stats.queue.paused ? "warn" : stats.queue.enabled ? "live" : "inactive"}
            label={queueLabel}
          />
          <span className="ops-ov-strip-meta">
            <span>
              {stats.queue.inProgress}/{stats.queue.maxConcurrent} slots
            </span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>
              {stats.queue.dialsLastMinute}/{stats.queue.maxDialsPerMinute} /min
            </span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>{stats.retries.scheduled} retries queued</span>
            <span className="ops-ov-dot" aria-hidden>
              ·
            </span>
            <span>tick {formatRelative(stats.dialer.lastTickAt)}</span>
          </span>
          {stats.dialer.lastError ? (
            <span className="ops-ov-strip-error" title={stats.dialer.lastError}>
              {stats.dialer.lastError}
            </span>
          ) : null}
        </div>
        <div className="ops-ov-strip-actions">
          {stats.queue.paused ? (
            <Button type="button" variant="primary" size="sm" onClick={() => handlePauseResume("resume")}>
              Resume queue
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => handlePauseResume("pause")}>
              Pause queue
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={reload}>
            Refresh
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard/calls?compose=enqueue")}
          >
            Enqueue
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => navigate("/dashboard/calls")}
          >
            Dial now
          </Button>
        </div>
      </div>

      <div className="ops-ov-kpis" role="list">
        <KpiCell
          to="/dashboard/calls?bucket=pending"
          label="Pending"
          value={stats.counts.pending}
          hint={`${stats.counts.pendingReadyNow} ready`}
          tone={stats.counts.pendingReadyNow > 0 && !stats.queue.paused ? "warn" : undefined}
        />
        <KpiCell
          to="/dashboard/calls?bucket=pending"
          label="Ready"
          value={stats.counts.pendingReadyNow}
          hint="claimable now"
        />
        <KpiCell
          to="/dashboard/calls?bucket=in_progress"
          label="Creating"
          value={stats.counts.creating}
        />
        <KpiCell
          to="/dashboard/calls?bucket=in_progress"
          label="Dialing"
          value={stats.counts.dialing}
          hint={`${stats.queue.inProgress} in flight`}
          tone={stats.counts.dialing > 0 ? "live" : undefined}
        />
        <KpiCell
          to="/dashboard/calls?bucket=in_progress"
          label="Live"
          value={stats.counts.ready}
          tone={stats.counts.ready > 0 ? "ok" : undefined}
        />
        <KpiCell
          to="/dashboard/calls?bucket=done"
          label="Completed"
          value={stats.counts.completed}
        />
        <KpiCell
          to="/dashboard/calls?bucket=done"
          label="Incomplete"
          value={stats.counts.incomplete ?? 0}
          tone={(stats.counts.incomplete ?? 0) > 0 ? "warn" : undefined}
        />
        <KpiCell
          to="/dashboard/calls?bucket=done"
          label="Failed"
          value={stats.counts.failed}
          tone={stats.counts.failed > 0 ? "bad" : undefined}
        />
        <KpiCell
          to="/dashboard/calls?bucket=done"
          label="Cancelled"
          value={stats.counts.cancelled}
        />
        <KpiCell
          to="/dashboard/calls?bucket=pending"
          label="Retries"
          value={stats.retries.scheduled}
          hint={`avg ${formatAvgAttempt(stats.retries.avgAttemptCount)}`}
        />
        <KpiCell
          to="/dashboard/batches"
          label="Batches"
          value={stats.batches.running}
          hint={`${stats.batches.paused} paused`}
        />
        <KpiCell
          to="/dashboard/agents"
          label="Agents"
          value={agents.length}
          hint={`${activeAgents} active`}
        />
        <KpiCell
          to="/dashboard/calls?bucket=done"
          label="14d rate"
          value={rate14 == null ? "—" : `${rate14}%`}
          hint="finished → done"
        />
      </div>

      <div className="ops-ov-mid">
        <section className="ops-panel ops-ov-cell">
          <div className="ops-panel-head">
            <h2>Calls made</h2>
            <span className="ops-faint">Completed / incomplete / failed · UTC day</span>
          </div>
          <div className="ops-panel-body ops-ov-chart-body">
            <CallsVolumeChart days={stats.daily ?? []} />
          </div>
        </section>

        <section className="ops-panel ops-ov-cell">
          <div className="ops-panel-head">
            <h2>Pipeline</h2>
            <span className="ops-faint">{pipeTotal} in queue or live</span>
          </div>
          <div className="ops-panel-body ops-ov-mix-body">
            <div
              className="ops-ov-pipe"
              role="img"
              aria-label={
                pipeTotal === 0
                  ? "No calls in the pipeline"
                  : pipeline.map((p) => `${p.label} ${p.value}`).join(", ")
              }
            >
              {pipeTotal === 0 ? (
                <span className="ops-ov-mix-empty" />
              ) : (
                pipeline
                  .filter((p) => p.value > 0)
                  .map((p) => (
                    <span
                      key={p.key}
                      className="ops-ov-mix-seg"
                      style={{ flexGrow: p.value, background: p.color }}
                    />
                  ))
              )}
            </div>
            <ul className="ops-ov-legend is-pipe">
              {pipeline.map((p) => (
                <li key={p.key}>
                  <span className="ops-ov-swatch" style={{ background: p.color }} />
                  <span>{p.label}</span>
                  <strong>{p.value}</strong>
                </li>
              ))}
            </ul>
            <h3 className="ops-ov-subhead">Outcomes</h3>
            <CallOutcomeBar
              completed={stats.counts.completed}
              incomplete={stats.counts.incomplete ?? 0}
              failed={stats.counts.failed}
              cancelled={stats.counts.cancelled}
            />
          </div>
        </section>
      </div>

      <div className="ops-ov-floor">
        <section className="ops-panel ops-ov-cell">
          <div className="ops-panel-head">
            <h2>Recent calls</h2>
            <Link to="/dashboard/calls" className="ops-mono">
              View all →
            </Link>
          </div>
          <div className="ops-ov-ticker-body">
            {calls.length === 0 ? (
              <div className="ops-ov-empty">
                <p>
                  No calls yet.{" "}
                  <Link to="/dashboard/calls">Dial now</Link> or{" "}
                  <Link to="/dashboard/calls?compose=enqueue">enqueue a batch</Link>.
                </p>
              </div>
            ) : (
              <ol className="ops-ov-tape">
                {calls.map((c) => (
                  <li key={c.id}>
                    <TapeRow call={c} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <aside className="ops-ov-side">
          <section className="ops-panel">
            <div className="ops-panel-head">
              <h2>Capacity</h2>
              <span className="ops-faint">
                {stats.queue.availableSlots} free
              </span>
            </div>
            <div className="ops-panel-body ops-ov-side-body">
              <dl className="ops-ov-facts">
                <div>
                  <dt>In flight</dt>
                  <dd>
                    {stats.queue.inProgress}
                    <span> / {stats.queue.maxConcurrent}</span>
                  </dd>
                </div>
                <div>
                  <dt>Dial rate</dt>
                  <dd>
                    {stats.queue.dialsLastMinute}
                    <span> / {stats.queue.maxDialsPerMinute}</span>
                  </dd>
                </div>
                <div>
                  <dt>Retries</dt>
                  <dd>
                    {stats.retries.scheduled}
                    <span> avg {formatAvgAttempt(stats.retries.avgAttemptCount)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Dialer</dt>
                  <dd>{stats.dialer.globalEnabled ? "On" : "Off"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel-head">
              <h2>Batches</h2>
              <Link to="/dashboard/batches" className="ops-mono">
                All →
              </Link>
            </div>
            <div className="ops-panel-body is-flush">
              {recentBatches.length === 0 ? (
                <div className="ops-ov-empty">
                  <p>
                    No batches.{" "}
                    <Link to="/dashboard/calls?compose=enqueue">Enqueue one</Link>.
                  </p>
                </div>
              ) : (
                <ul className="ops-ov-side-list">
                  {recentBatches.map((b) => (
                    <li key={b.id}>
                      <BatchRow batch={b} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel-head">
              <h2>Agents</h2>
              <Link to="/dashboard/agents" className="ops-mono">
                All →
              </Link>
            </div>
            <div className="ops-panel-body is-flush">
              {agents.length === 0 ? (
                <div className="ops-ov-empty">
                  <p>
                    No agents. <Link to="/dashboard/agents">Create one</Link>.
                  </p>
                </div>
              ) : (
                <ul className="ops-ov-side-list">
                  {agents.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <AgentRow agent={a} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function KpiCell({
  to,
  label,
  value,
  hint,
  tone,
}: {
  to: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: KpiTone;
}) {
  return (
    <Link
      to={to}
      role="listitem"
      className={`ops-ov-kpi${tone ? ` is-${tone}` : ""}`}
    >
      <span className="ops-ov-kpi-label">{label}</span>
      <span className="ops-ov-kpi-value">{value}</span>
      {hint ? <span className="ops-ov-kpi-hint">{hint}</span> : null}
    </Link>
  );
}

function TapeRow({ call }: { call: CallRecord }) {
  const live = call.status === "dialing" || call.status === "ready" || call.status === "creating";
  return (
    <Link
      to={`/dashboard/calls/${call.id}`}
      className={`ops-ov-tape-row${live ? " is-live" : ""}`}
    >
      <StatusBadge status={call.status} />
      <span className="ops-ov-tape-to">
        {call.toNumber || call.participantIdentity || "—"}
      </span>
      <span className="ops-ov-tape-task">{call.taskKey || "—"}</span>
      <span className="ops-ov-tape-meta">
        {call.direction}
        <span aria-hidden> · </span>
        {call.medium}
      </span>
      <span className="ops-ov-tape-try">
        {call.attemptCount}/{call.maxAttempts}
      </span>
      <span className="ops-ov-tape-cost">
        <CallCostCell cost={call.cost} live={live} />
      </span>
      <time className="ops-ov-tape-when" dateTime={call.createdAt}>
        {formatRelative(call.createdAt)}
      </time>
    </Link>
  );
}

function BatchRow({ batch }: { batch: CallBatch }) {
  const done = batch.stats
    ? batch.stats.completed +
      (batch.stats.incomplete ?? 0) +
      batch.stats.failed +
      batch.stats.cancelled
    : 0;
  return (
    <Link to={`/dashboard/batches/${batch.id}`} className="ops-ov-side-row">
      <StatusBadge status={batch.status} />
      <span className="ops-ov-side-copy">
        <strong>{batch.taskKey || "batch"}</strong>
        <span>
          {done}/{batch.totalCount}
          {batch.stats ? ` · ${batch.stats.pending} pending` : ""}
        </span>
      </span>
    </Link>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <Link to={`/dashboard/agents/${agent.id}`} className="ops-ov-side-row">
      <StatusBadge status={agent.direction} />
      <span className="ops-ov-side-copy">
        <strong>{agent.name}</strong>
        <span>{agent.isActive ? "Active" : "Inactive"}</span>
      </span>
    </Link>
  );
}

function successRate14(stats: OrgQueueStats): number | null {
  const daily = stats.daily ?? [];
  let finished = 0;
  let completed = 0;
  for (const d of daily) {
    finished += d.completed + (d.incomplete ?? 0) + d.failed + d.cancelled;
    completed += d.completed;
  }
  if (finished <= 0) return null;
  return Math.round((completed / finished) * 100);
}

function formatAvgAttempt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
