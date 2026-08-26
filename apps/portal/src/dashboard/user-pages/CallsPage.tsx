import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@call-agent/ui";
import {
  ApiError,
  cancelUserCall,
  getUserCostSummary,
  getUserQueueStats,
  listUserCalls,
  prioritizeUserCall,
  retryUserCall,
  UnauthorizedError,
  type UserCallBucket,
} from "../../lib/api";
import { useUserAuth } from "../../lib/auth";
import { formatRelative, formatUsd, shortId } from "../../lib/format";
import { CallComposer, type ComposeMode } from "../components/CallComposer";
import { CallCostCell } from "../components/CallCostCell";
import {
  CallsCountsSkeleton,
  CallsLedgerSkeleton,
  CallsTapeSkeleton,
} from "../components/CallsTapeSkeleton";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock } from "../components/ErrorBlock";
import { StatusBadge } from "../components/StatusBadge";
import { useUserAsync } from "../hooks/useAsync";

type DirectionTab = "outbound" | "inbound";

const BUCKETS: { key: UserCallBucket | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "Live" },
  { key: "done", label: "Done" },
];

function parseDirection(raw: string | null): DirectionTab {
  return raw === "inbound" ? "inbound" : "outbound";
}

function parseCompose(raw: string | null): ComposeMode {
  return raw === "enqueue" ? "enqueue" : "dial";
}

export default function UserCallsPage() {
  const { logout } = useUserAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get("batchId") || undefined;
  const agentId = searchParams.get("agentId") || undefined;
  const bucketParam = searchParams.get("bucket") as UserCallBucket | null;
  const [direction, setDirection] = useState<DirectionTab>(
    parseDirection(searchParams.get("direction")),
  );
  const [compose, setCompose] = useState<ComposeMode>(
    parseCompose(searchParams.get("compose")),
  );
  const [bucket, setBucket] = useState<UserCallBucket | "all">(bucketParam || "all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const callsState = useUserAsync(
    () =>
      listUserCalls({
        limit: 80,
        batchId,
        direction,
        ...(bucket !== "all" ? { bucket } : {}),
      }),
    [bucket, batchId, direction],
  );

  const statsState = useUserAsync(() => getUserQueueStats(), []);
  const costsState = useUserAsync(() => getUserCostSummary(), []);

  useEffect(() => {
    setDirection(parseDirection(searchParams.get("direction")));
    setCompose(parseCompose(searchParams.get("compose")));
    const nextBucket = (searchParams.get("bucket") as UserCallBucket | null) || "all";
    setBucket(nextBucket);
  }, [searchParams]);

  useEffect(() => {
    const id = window.setInterval(() => {
      callsState.reload();
      statsState.reload();
      costsState.reload();
    }, 6000);
    return () => window.clearInterval(id);
  }, [callsState.reload, statsState.reload, costsState.reload]);

  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const setDirectionTab = (d: DirectionTab) => {
    setDirection(d);
    const next: Record<string, string | null> = {
      direction: d === "outbound" ? null : d,
    };
    if (d === "inbound" && bucket === "pending") {
      setBucket("all");
      next.bucket = null;
    }
    patchParams(next);
  };

  const setComposeMode = (mode: ComposeMode) => {
    setCompose(mode);
    patchParams({ compose: mode === "dial" ? null : mode });
  };

  const setBucketTab = (b: UserCallBucket | "all") => {
    setBucket(b);
    patchParams({ bucket: b === "all" ? null : b });
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
      callsState.reload();
      statsState.reload();
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

  const calls = callsState.data ?? [];
  const isInbound = direction === "inbound";
  const stats = statsState.data;
  const counts = stats?.counts;
  const inFlight = stats?.queue.inProgress ?? 0;

  return (
    <div className="ops-calls">
      <div className="ops-calls-toolbar">
        <div className="ops-calls-toolbar-main">
          <h1>Calls</h1>
          <div className="ops-mode-toggle" role="tablist" aria-label="Call direction">
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
        </div>
        <div className="ops-calls-toolbar-side">
          {costsState.data ? (
            <div
              className="ops-calls-ledger"
              title={
                costsState.data.callCount > 0
                  ? `${costsState.data.callCount} priced · ${costsState.data.unpricedCount} unpriced · catalog ${costsState.data.catalogAsOf}`
                  : "LiveKit list price, last 30 days · no markup"
              }
            >
              <span className="ops-calls-ledger-kicker">30d meter</span>
              <strong>{formatUsd(costsState.data.totalUsd)}</strong>
              <span className="ops-calls-ledger-hint">
                {costsState.data.callCount > 0
                  ? `${formatUsd(costsState.data.avgUsd)} avg · list`
                  : "list price"}
              </span>
            </div>
          ) : costsState.loading ? (
            <CallsLedgerSkeleton />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              callsState.reload();
              statsState.reload();
              costsState.reload();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="ops-calls-board">
      {!isInbound ? (
        <CallComposer
          mode={compose}
          onModeChange={setComposeMode}
          presetAgentId={agentId}
          onEnqueued={(result) => {
            patchParams({
              batchId: result.batchId,
              bucket: null,
              compose: "enqueue",
            });
            setBucket("all");
            callsState.reload();
            statsState.reload();
            costsState.reload();
          }}
          onDialed={() => {
            callsState.reload();
            statsState.reload();
            costsState.reload();
          }}
        />
      ) : (
        <section className="ops-panel ops-calls-compose ops-calls-inbound">
          <div className="ops-panel-head">
            <span className="ops-calls-list-kicker">Inbound</span>
            <span className="ops-calls-compose-hint">Rings · web tests</span>
          </div>
          <div className="ops-panel-body">
            <p className="ops-calls-inbound-copy">
              Published numbers land here when someone dials. Live sessions
              show while the worker is in the room; hangup writes transcript
              and cost like outbound.
            </p>
            <Link to="/dashboard/sip?tab=inbound" className="ops-calls-inbound-link">
              Inbound telephony →
            </Link>
          </div>
        </section>
      )}

      <section className="ops-panel ops-calls-list">
        <div className="ops-calls-list-bar">
          <div className="ops-calls-list-bar-main">
            <span className="ops-calls-list-kicker">Tape</span>
            <div className="ops-calls-chips" role="tablist" aria-label="Call bucket">
              {BUCKETS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  aria-selected={bucket === b.key}
                  className={`ops-calls-chip${bucket === b.key ? " is-active" : ""}`}
                  onClick={() => setBucketTab(b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {counts ? (
            <ul className="ops-calls-counts">
              <li>
                <button
                  type="button"
                  className={`ops-calls-stat${bucket === "pending" ? " is-on" : ""}`}
                  onClick={() => setBucketTab(bucket === "pending" ? "all" : "pending")}
                >
                  <strong>{counts.pending}</strong>
                  <span>pending</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`ops-calls-stat${bucket === "in_progress" ? " is-on" : ""}`}
                  onClick={() =>
                    setBucketTab(bucket === "in_progress" ? "all" : "in_progress")
                  }
                >
                  <strong>{counts.dialing + counts.ready + counts.creating}</strong>
                  <span>live · {inFlight} slots</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`ops-calls-stat${bucket === "done" ? " is-on" : ""}`}
                  onClick={() => setBucketTab(bucket === "done" ? "all" : "done")}
                >
                  <strong>
                    {counts.completed + (counts.incomplete ?? 0) + counts.failed + counts.cancelled}
                  </strong>
                  <span>
                    done · {counts.completed} ok · {counts.incomplete ?? 0} incomplete
                  </span>
                </button>
              </li>
            </ul>
          ) : statsState.loading ? (
            <CallsCountsSkeleton />
          ) : (
            <span className="ops-faint">Queue stats…</span>
          )}
        </div>
        {batchId ? (
          <p className="ops-calls-filter">
            Batch <span className="ops-mono">{shortId(batchId, 12)}</span>
            {" · "}
            <button
              type="button"
              className="ops-calls-text-btn"
              onClick={() => patchParams({ batchId: null })}
            >
              Clear
            </button>
            {" · "}
            <Link to={`/dashboard/batches/${batchId}`}>Detail</Link>
          </p>
        ) : null}

        <div className="ops-panel-body is-flush ops-calls-list-body">
          {callsState.error ? (
            <ErrorBlock message={callsState.error} onRetry={callsState.reload} />
          ) : callsState.loading && !callsState.data ? (
            <CallsTapeSkeleton inbound={isInbound} />
          ) : calls.length === 0 ? (
            <EmptyState
              title={isInbound ? "No inbound calls" : "No outbound calls"}
              description={
                isInbound
                  ? "When someone dials a published number, the session shows up here."
                  : "Place a dial on the left, or switch to Enqueue batch."
              }
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table ops-calls-table">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Status</th>
                    <th>Task</th>
                    <th className="ops-calls-cost-col">Cost</th>
                    {!isInbound ? <th>Try</th> : null}
                    <th>When</th>
                    {!isInbound ? <th /> : null}
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
                    const live =
                      c.status === "dialing" ||
                      c.status === "ready" ||
                      c.status === "creating";
                    return (
                      <tr key={c.id} className={live ? "is-live" : undefined}>
                        <td>
                          <Link to={`/dashboard/calls/${c.id}`} className="ops-calls-party">
                            <span className="ops-calls-party-num ops-mono">{party}</span>
                            <span className="ops-calls-party-meta">
                              <span className="ops-mono">{c.medium}</span>
                              <span className="ops-mono">{shortId(c.id, 8)}</span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="ops-mono">{c.taskKey || "—"}</td>
                        <td className="ops-calls-cost-col">
                          <CallCostCell cost={c.cost} live={live} />
                        </td>
                        {!isInbound ? (
                          <td className="ops-mono">
                            {c.attemptCount}/{c.maxAttempts}
                          </td>
                        ) : null}
                        <td className="ops-faint">
                          <time dateTime={c.createdAt}>{formatRelative(c.createdAt)}</time>
                        </td>
                        {!isInbound ? (
                          <td>
                            <div className="ops-row-actions">
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
    </div>
  );
}
