import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserBatch,
  getUserBatch,
  pauseUserBatch,
  resumeUserBatch,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { ErrorBlock } from "../components/ErrorBlock";
import { KpiCard } from "../components/KpiCard";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { ResourceNotFound } from "../components/ResourceNotFound";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserBatchDetailPage() {
  const { id = "" } = useParams();
  const { logout } = useUserAuth();
  const { data, error, notFound, loading, reload } = useUserAsync(
    () => getUserBatch(id),
    [id],
  );
  const [busy, setBusy] = useState(false);

  const runAction = async (action: "pause" | "resume" | "cancel") => {
    setBusy(true);
    try {
      if (action === "pause") await pauseUserBatch(id);
      else if (action === "resume") await resumeUserBatch(id);
      else {
        if (!window.confirm("Cancel this batch? Pending calls will be cancelled.")) {
          setBusy(false);
          return;
        }
        await cancelUserBatch(id);
      }
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }
      window.alert(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading batch" />;
  if (notFound || (!data && !error)) {
    return (
      <ResourceNotFound
        kind="Batch"
        id={id}
        backTo="/dashboard/batches"
        backLabel="All batches"
      />
    );
  }
  if (error || !data) return <ErrorBlock message={error ?? "Failed to load"} onRetry={reload} />;

  const stats = data.stats;

  return (
    <div className="ops-stack">
      <p style={{ margin: 0 }}>
        <Link to="/dashboard/batches" className="ops-muted">
          ← All batches
        </Link>
      </p>

      <PageHeader
        eyebrow="Batch"
        title={data.id}
        description={`Created ${formatDateTime(data.createdAt)} · ${data.totalCount} calls`}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <StatusBadge status={data.status} />
            {data.status === "running" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => runAction("pause")}
              >
                Pause
              </Button>
            ) : null}
            {data.status === "paused" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => runAction("resume")}
              >
                Resume
              </Button>
            ) : null}
            {data.status === "running" || data.status === "paused" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => runAction("cancel")}
              >
                Cancel
              </Button>
            ) : null}
            <Link to={`/dashboard/calls?batchId=${data.id}`}>
              <Button type="button" variant="primary" size="sm">
                View calls
              </Button>
            </Link>
          </div>
        }
      />

      {stats ? (
        <div className="ops-kpis">
          <KpiCard value={stats.pending} label="Pending" />
          <KpiCard
            value={stats.creating + stats.dialing + stats.ready}
            label="In progress"
            highlight={stats.dialing > 0}
          />
          <KpiCard value={stats.completed} label="Completed" />
          <KpiCard value={stats.incomplete ?? 0} label="Incomplete" />
          <KpiCard value={stats.failed} label="Failed" hint={`${stats.cancelled} cancelled`} />
        </div>
      ) : null}

      <section className="ops-panel">
        <div className="ops-panel-head">
          <h2>Details</h2>
        </div>
        <div className="ops-panel-body">
          <dl className="ops-detail-grid">
            <div className="ops-detail-item">
              <dt>Task</dt>
              <dd className="ops-mono">{data.taskKey || "—"}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>Agent id</dt>
              <dd className="ops-mono">
                {data.organizationAgentId ? (
                  <Link to={`/dashboard/agents/${data.organizationAgentId}`}>
                    {data.organizationAgentId.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="ops-detail-item">
              <dt>Priority</dt>
              <dd>{data.priority}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>Max attempts</dt>
              <dd>{data.maxAttempts ?? "org default"}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>Max concurrent</dt>
              <dd>{data.maxConcurrent ?? "org default"}</dd>
            </div>
            <div className="ops-detail-item">
              <dt>SIP trunk</dt>
              <dd className="ops-mono">
                {data.sipTrunkId ? `${data.sipTrunkId.slice(0, 8)}…` : "default"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
