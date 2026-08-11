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
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserOverviewPage() {
  const { logout, user } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(async () => {
    const [stats, calls, agents] = await Promise.all([
      getUserQueueStats(),
      listUserCalls({ limit: 12 }),
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
  const orgLabel =
    user?.organization?.name || user?.organization?.slug || "your organization";
  const queueLabel = stats.queue.paused
    ? "Paused"
    : stats.queue.enabled
      ? "Running"
      : "Disabled";

  return (
    <div>
      <PageHeader
        eyebrow={orgLabel}
        title="Ops overview"
        description="Live dial queue health, shortcuts to enqueue and dial, and recent call activity."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {stats.queue.paused ? (
              <Button type="button" variant="primary" size="sm" onClick={() => handlePauseResume("resume")}>
                Resume queue
              </Button>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => handlePauseResume("pause")}>
                Pause queue
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={reload}>
              Refresh
            </Button>
          </div>
        }
      />

      <div
        className="ops-panel"
        style={{ marginBottom: "1.25rem" }}
      >
        <div className="ops-panel-body" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge
              status={stats.queue.paused ? "warn" : stats.queue.enabled ? "live" : "inactive"}
              label={queueLabel}
            />
            <span className="ops-muted" style={{ margin: 0 }}>
              {stats.queue.inProgress}/{stats.queue.maxConcurrent} slots ·{" "}
              {stats.queue.dialsLastMinute} dials/min ·{" "}
              {stats.batches.running} batch{stats.batches.running === 1 ? "" : "es"} running
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link to="/dashboard/enqueue">
              <Button type="button" variant="primary" size="sm">
                Enqueue
              </Button>
            </Link>
            <Link to="/dashboard/dial">
              <Button type="button" variant="secondary" size="sm">
                Dial now
              </Button>
            </Link>
            <Link to="/dashboard/agents">
              <Button type="button" variant="ghost" size="sm">
                Agents ({agents.length})
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="ops-kpis">
        <KpiCard
          value={stats.counts.pending}
          label="Pending"
          hint={`${stats.counts.pendingReadyNow} ready now`}
        />
        <KpiCard
          value={stats.queue.inProgress}
          label="In flight"
          hint={`${stats.queue.availableSlots} slots free`}
          highlight={stats.queue.inProgress > 0}
        />
        <KpiCard value={stats.counts.dialing} label="Dialing" />
        <KpiCard
          value={stats.counts.completed}
          label="Completed"
          hint={`${stats.counts.failed} failed`}
        />
      </div>

      <div className="ops-two-col">
        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Recent calls</h2>
            <Link to="/dashboard/calls" className="ops-mono">
              View all →
            </Link>
          </div>
          <div className="ops-panel-body is-flush">
            {calls.length === 0 ? (
              <div className="ops-state">
                <p>
                  No calls yet.{" "}
                  <Link to="/dashboard/enqueue">Enqueue a batch</Link> or{" "}
                  <Link to="/dashboard/dial">dial now</Link>.
                </p>
              </div>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>To</th>
                      <th>Task</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link to={`/dashboard/calls/${c.id}`}>
                            <StatusBadge status={c.status} />
                          </Link>
                        </td>
                        <td className="ops-mono">
                          {c.toNumber || c.participantIdentity || "—"}
                        </td>
                        <td className="ops-mono">{c.taskKey || "—"}</td>
                        <td className="ops-faint">{formatRelative(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>Dialer</h2>
            <StatusBadge
              status={stats.dialer.globalEnabled ? "live" : "inactive"}
              label={stats.dialer.globalEnabled ? "Enabled" : "Disabled"}
            />
          </div>
          <div className="ops-panel-body">
            <dl className="ops-detail-grid">
              <div className="ops-detail-item">
                <dt>Retries scheduled</dt>
                <dd>{stats.retries.scheduled}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Last claim count</dt>
                <dd>{stats.dialer.lastClaimCount}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Batches paused</dt>
                <dd>{stats.batches.paused}</dd>
              </div>
              <div className="ops-detail-item">
                <dt>Avg attempts</dt>
                <dd>{stats.retries.avgAttemptCount}</dd>
              </div>
            </dl>
            {stats.dialer.lastError ? (
              <p className="ops-muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
                Last error: {stats.dialer.lastError}
              </p>
            ) : null}
            <p style={{ marginTop: "1.25rem", marginBottom: 0 }}>
              <Link to="/dashboard/queue">Queue settings →</Link>
              {" · "}
              <Link to="/dashboard/batches">Batches →</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
