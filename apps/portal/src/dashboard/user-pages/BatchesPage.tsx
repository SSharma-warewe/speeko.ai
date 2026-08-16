import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserBatch,
  listUserBatches,
  pauseUserBatch,
  resumeUserBatch,
  UnauthorizedError,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime, shortId } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

export default function UserBatchesPage() {
  const { logout } = useUserAuth();
  const { data, error, loading, reload } = useUserAsync(() => listUserBatches(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  const runAction = async (id: string, action: "pause" | "resume" | "cancel") => {
    setBusyId(id);
    try {
      if (action === "pause") await pauseUserBatch(id);
      else if (action === "resume") await resumeUserBatch(id);
      else {
        if (!window.confirm("Cancel this batch? Pending calls will be cancelled.")) return;
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
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock label="Loading batches" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const batches = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Batches"
        description="Bulk enqueue groups. Pause, resume, or cancel a campaign without touching the whole org queue."
        actions={
          <Link to="/dashboard/calls?compose=enqueue">
            <Button type="button" variant="primary" size="sm">
              New batch
            </Button>
          </Link>
        }
      />

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {batches.length === 0 ? (
            <EmptyState
              title="No batches yet"
              description="Enqueue outbound numbers to create a call batch the dialer can claim."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Task</th>
                    <th>Priority</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const busy = busyId === b.id;
                    return (
                      <tr key={b.id}>
                        <td>
                          <Link to={`/dashboard/batches/${b.id}`} className="ops-mono">
                            {shortId(b.id, 10)}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={b.status} />
                        </td>
                        <td>{b.totalCount}</td>
                        <td className="ops-mono">{b.taskKey || "—"}</td>
                        <td>{b.priority}</td>
                        <td className="ops-faint">{formatDateTime(b.createdAt)}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                            {b.status === "running" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => runAction(b.id, "pause")}
                              >
                                Pause
                              </Button>
                            ) : null}
                            {b.status === "paused" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => runAction(b.id, "resume")}
                              >
                                Resume
                              </Button>
                            ) : null}
                            {b.status === "running" || b.status === "paused" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => runAction(b.id, "cancel")}
                              >
                                Cancel
                              </Button>
                            ) : null}
                            <Link to={`/dashboard/calls?batchId=${b.id}`}>
                              <Button type="button" variant="ghost" size="sm">
                                Calls
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
