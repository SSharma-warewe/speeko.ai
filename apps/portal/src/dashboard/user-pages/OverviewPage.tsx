import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  getUserQueueStats,
  listUserAgents,
  listUserCalls,
  pauseUserQueue,
  resumeUserQueue,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatRelative } from "../../lib/format";
import { CallOutcomeDonut } from "../components/CallOutcomeDonut";
import { CallsVolumeChart } from "../components/CallsVolumeChart";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserOverviewPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [stats, calls, agents] = await Promise.all([
      getUserQueueStats(),
      listUserCalls({ limit: 5 }),
      listUserAgents(),
    ]);
    return { stats, calls, agents };
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

  const { stats, calls, agents } = data;
  const activeAgents = agents.filter((a) => a.isActive).length;
  const queueLabel = stats.queue.paused
    ? "Paused"
    : stats.queue.enabled
      ? "Running"
      : "Disabled";

  return (
    <div className="ops-ov">
      <div className="ops-ov-strip">
        <div className="ops-ov-strip-live">
          <StatusBadge
            status={stats.queue.paused ? "warn" : stats.queue.enabled ? "live" : "inactive"}
            label={queueLabel}
          />
          <span className="ops-muted" style={{ margin: 0 }}>
            {stats.queue.inProgress}/{stats.queue.maxConcurrent} slots ·{" "}
            {stats.queue.dialsLastMinute} dials/min
          </span>
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
        </div>
      </div>

      <div className="ops-ov-grid">
        <section className="ops-panel ops-ov-cell ops-ov-kpis-cell">
          <div className="ops-panel-head">
            <h2>Live</h2>
            <span className="ops-faint">Queue snapshot</span>
          </div>
          <div className="ops-ov-kpis">
            <Link to="/dashboard/agents" className="ops-ov-kpi is-agents">
              <span className="ops-ov-kpi-label">Agents</span>
              <span className="ops-ov-kpi-value">{agents.length}</span>
              <span className="ops-ov-kpi-hint">{activeAgents} active</span>
            </Link>
            <Link to="/dashboard/calls?bucket=pending" className="ops-ov-kpi is-pending">
              <span className="ops-ov-kpi-label">Pending</span>
              <span className="ops-ov-kpi-value">{stats.counts.pending}</span>
              <span className="ops-ov-kpi-hint">{stats.counts.pendingReadyNow} ready now</span>
            </Link>
            <Link to="/dashboard/calls?bucket=done" className="ops-ov-kpi is-done">
              <span className="ops-ov-kpi-label">Done</span>
              <span className="ops-ov-kpi-value">{stats.counts.completed}</span>
              <span className="ops-ov-kpi-hint">{stats.counts.failed} failed</span>
            </Link>
            <Link
              to="/dashboard/calls?bucket=in_progress"
              className={`ops-ov-kpi is-dialing${stats.counts.dialing > 0 ? " is-live" : ""}`}
            >
              <span className="ops-ov-kpi-label">Dialing</span>
              <span className="ops-ov-kpi-value">{stats.counts.dialing}</span>
              <span className="ops-ov-kpi-hint">{stats.queue.inProgress} in flight</span>
            </Link>
          </div>
        </section>

        <section className="ops-panel ops-ov-cell ops-ov-ticker">
          <div className="ops-panel-head">
            <h2>Recent calls</h2>
            <Link to="/dashboard/calls" className="ops-mono">
              View all →
            </Link>
          </div>
          <div className="ops-ov-ticker-body">
            {calls.length === 0 ? (
              <div className="ops-state">
                <p>
                  No calls yet.{" "}
                  <Link to="/dashboard/enqueue">Enqueue a batch</Link> or{" "}
                  <Link to="/dashboard/dial">dial now</Link>.
                </p>
              </div>
            ) : (
              <ol className="ops-ov-tape">
                {calls.map((c) => (
                  <li key={c.id}>
                    <Link to={`/dashboard/calls/${c.id}`} className="ops-ov-tape-row">
                      <StatusBadge status={c.status} />
                      <span className="ops-ov-tape-to">
                        {c.toNumber || c.participantIdentity || "—"}
                      </span>
                      <span className="ops-ov-tape-task">{c.taskKey || "—"}</span>
                      <time className="ops-ov-tape-when" dateTime={c.createdAt}>
                        {formatRelative(c.createdAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="ops-panel ops-ov-cell ops-ov-chart">
          <div className="ops-panel-head">
            <h2>Outcomes</h2>
            <span className="ops-faint">Finished calls</span>
          </div>
          <div className="ops-panel-body ops-ov-chart-body">
            <CallOutcomeDonut
              completed={stats.counts.completed}
              failed={stats.counts.failed}
              cancelled={stats.counts.cancelled}
            />
          </div>
        </section>

        <section className="ops-panel ops-ov-cell ops-ov-chart is-volume">
          <div className="ops-panel-head">
            <h2>Calls made</h2>
            <span className="ops-faint">Created per day</span>
          </div>
          <div className="ops-panel-body ops-ov-chart-body">
            <CallsVolumeChart days={stats.daily ?? []} />
          </div>
        </section>
      </div>
    </div>
  );
}
