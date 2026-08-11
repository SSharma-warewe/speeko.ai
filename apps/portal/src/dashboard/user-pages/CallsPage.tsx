import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserCall,
  listUserCalls,
  prioritizeUserCall,
  retryUserCall,
  UnauthorizedError,
  type UserCallBucket,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatDateTime, shortId } from "../../lib/format";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type DirectionTab = "outbound" | "inbound";

const BUCKETS: { key: UserCallBucket | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

function parseDirection(raw: string | null): DirectionTab {
  return raw === "inbound" ? "inbound" : "outbound";
}

export default function UserCallsPage() {
  const { logout } = useUserAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get("batchId") || undefined;
  const bucketParam = searchParams.get("bucket") as UserCallBucket | null;
  const [direction, setDirection] = useState<DirectionTab>(
    parseDirection(searchParams.get("direction")),
  );
  const [bucket, setBucket] = useState<UserCallBucket | "all">(bucketParam || "all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error, loading, reload } = useUserAsync(
    () =>
      listUserCalls({
        limit: 80,
        batchId,
        direction,
        ...(bucket !== "all" ? { bucket } : {}),
      }),
    [bucket, batchId, direction],
  );

  const setDirectionTab = (d: DirectionTab) => {
    setDirection(d);
    const next = new URLSearchParams(searchParams);
    if (d === "outbound") next.delete("direction");
    else next.set("direction", d);
    // Inbound has no queue pending/retry UX — clear outbound-only bucket when switching
    if (d === "inbound" && bucket === "pending") {
      setBucket("all");
      next.delete("bucket");
    }
    setSearchParams(next, { replace: true });
  };

  const setBucketTab = (b: UserCallBucket | "all") => {
    setBucket(b);
    const next = new URLSearchParams(searchParams);
    if (b === "all") next.delete("bucket");
    else next.set("bucket", b);
    setSearchParams(next, { replace: true });
  };

  const runAction = async (
    id: string,
    action: "cancel" | "retry" | "prioritize",
  ) => {
    setBusyId(id);
    try {
      if (action === "cancel") await cancelUserCall(id);
      else if (action === "retry") await retryUserCall(id);
      else await prioritizeUserCall(id);
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

  if (loading) return <LoadingBlock label="Loading calls" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const calls = data ?? [];
  const isInbound = direction === "inbound";

  return (
    <div>
      <PageHeader
        eyebrow="Operate"
        title="Calls"
        description={
          isInbound
            ? "Inbound sessions (web agent tests today). SIP rings are accepted by LiveKit but not yet written as call rows."
            : "Outbound dials and queue activity — cancel, retry, and prioritize pending work."
        }
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {!isInbound ? (
              <Link to="/dashboard/enqueue">
                <Button type="button" variant="primary" size="sm">
                  Enqueue
                </Button>
              </Link>
            ) : (
              <Link to="/dashboard/sip">
                <Button type="button" variant="primary" size="sm">
                  Inbound telephony
                </Button>
              </Link>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={reload}>
              Refresh
            </Button>
          </div>
        }
      />

      <div
        className="ops-mode-toggle"
        role="tablist"
        aria-label="Call direction"
        style={{ marginBottom: "1rem" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={!isInbound}
          className={`ops-mode-btn${!isInbound ? " is-active" : ""}`}
          onClick={() => setDirectionTab("outbound")}
        >
          Outbound
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isInbound}
          className={`ops-mode-btn${isInbound ? " is-active" : ""}`}
          onClick={() => setDirectionTab("inbound")}
        >
          Inbound
        </button>
      </div>

      {batchId ? (
        <p className="ops-muted" style={{ marginTop: 0 }}>
          Filtered by batch{" "}
          <span className="ops-mono">{shortId(batchId, 12)}</span>
          {" · "}
          <Link to={`/dashboard/calls${isInbound ? "?direction=inbound" : ""}`}>
            Clear filter
          </Link>
          {" · "}
          <Link to={`/dashboard/batches/${batchId}`}>Batch detail</Link>
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`ops-logout${bucket === b.key ? " is-active" : ""}`}
            style={{
              borderRadius: 999,
              padding: "0.35rem 0.85rem",
              fontSize: "0.8rem",
              background: bucket === b.key ? "var(--ops-amber, #f5c518)" : undefined,
              fontWeight: bucket === b.key ? 600 : 400,
            }}
            onClick={() => setBucketTab(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <section className="ops-panel">
        <div className="ops-panel-body is-flush">
          {calls.length === 0 ? (
            <EmptyState
              title={isInbound ? "No inbound calls" : "No outbound calls"}
              description={
                isInbound
                  ? "Inbound SIP is draft → publish under SIP / Telephony (LiveKit accepts rings), but the platform does not yet open a calls row when a number rings. Web tests with an inbound agent will show up here."
                  : "Enqueue a batch or place an immediate dial to see activity here."
              }
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Medium</th>
                    <th>{isInbound ? "From" : "To"}</th>
                    <th>Task</th>
                    {!isInbound ? <th>Attempts</th> : null}
                    <th>Created</th>
                    {!isInbound ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => {
                    const busy = busyId === c.id;
                    const canCancel = c.status === "pending";
                    const canRetry =
                      c.status === "pending" || c.status === "failed";
                    const canPrioritize = c.status === "pending";
                    const party = isInbound
                      ? c.fromNumber || c.participantIdentity || "—"
                      : c.toNumber || "—";
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link
                            to={`/dashboard/calls/${c.id}`}
                            className="ops-mono"
                          >
                            {shortId(c.id, 10)}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="ops-mono">{c.medium}</td>
                        <td className="ops-mono">{party}</td>
                        <td className="ops-mono">{c.taskKey || "—"}</td>
                        {!isInbound ? (
                          <td className="ops-mono">
                            {c.attemptCount}/{c.maxAttempts}
                          </td>
                        ) : null}
                        <td className="ops-faint">{formatDateTime(c.createdAt)}</td>
                        {!isInbound ? (
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.25rem",
                                flexWrap: "wrap",
                              }}
                            >
                              {canCancel ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => runAction(c.id, "cancel")}
                                >
                                  Cancel
                                </Button>
                              ) : null}
                              {canRetry ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => runAction(c.id, "retry")}
                                >
                                  Retry
                                </Button>
                              ) : null}
                              {canPrioritize ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => runAction(c.id, "prioritize")}
                                >
                                  Prioritize
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
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
